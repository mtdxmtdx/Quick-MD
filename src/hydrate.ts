// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {metrics} from './model';
import {cleanSvg,diagramAllowed} from './security';
let katexPromise:Promise<typeof import('katex')>|undefined;
let mermaidPromise:Promise<typeof import('mermaid')>|undefined;
let serial=0,running=false;
interface Task {node:HTMLElement;source:string;valid:()=>boolean;done:()=>void;dark:boolean}
const queue:Task[]=[];const surfaces=new Set<()=>void>();
const formulaCache=new Map<string,string>();let cacheBytes=0;
function cache(key:string,value:string){const bytes=(key.length+value.length)*2;if(bytes>1_048_576)return;while(formulaCache.size>=128||cacheBytes+bytes>1_048_576){const first=formulaCache.entries().next().value;if(!first)break;cacheBytes-=(first[0].length+first[1].length)*2;formulaCache.delete(first[0])}formulaCache.set(key,value);cacheBytes+=bytes}
function failed(node:HTMLElement,error:unknown){node.classList.add('render-error');node.textContent=`渲染失败（源码保留）：${String(error).slice(0,300)}`}
async function pump(){if(running)return;let task:Task|undefined;while((task=queue.shift())&&!task.valid())task.done();if(!task)return;const job=task;running=true;
 try{if(!diagramAllowed(job.source))throw new Error('图表超过 50,000 字符或含配置 / click 指令');
  if(!mermaidPromise){metrics.mermaidLoaded++;mermaidPromise=import('mermaid').catch(e=>{mermaidPromise=undefined;throw e})}
  const {default:mermaid}=await mermaidPromise;if(!job.valid())return;
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:job.dark?'dark':'default',maxTextSize:50_000,maxEdges:500,flowchart:{htmlLabels:false},htmlLabels:false,secure:['securityLevel','startOnLoad','maxTextSize','maxEdges','htmlLabels','flowchart']});
  metrics.diagramStarted++;const id=`diagram-${++serial}`;
  // An isolated temporary host is always removed, including Mermaid's error SVG.
  const host=document.createElement('div');host.style.cssText='position:absolute;left:-100000px;top:0;width:850px';document.body.append(host);
  try{const {svg}=await mermaid.render(id,job.source,host);if(job.valid()){job.node.innerHTML=cleanSvg(svg);job.node.classList.add('rendered')}}finally{host.remove()}
 }catch(e){if(job.valid())failed(job.node,e)}finally{job.done();running=false;for(const fill of surfaces)fill();void pump()}
}
export function hydrate(root:HTMLElement,isCurrent:()=>boolean,onLayout:()=>void=()=>{}):()=>void{
 let alive=true;const visible=new Set<HTMLElement>();const pending=new Set<HTMLElement>();const completed=new Set<HTMLElement>();const dark=matchMedia('(prefers-color-scheme: dark)').matches;
 const valid=(node:HTMLElement)=>alive&&isCurrent()&&node.isConnected;
 const fill=()=>{for(const node of visible){if(queue.length>=8)break;if(!valid(node)||pending.has(node)||completed.has(node))continue;
  pending.add(node);queue.push({node,source:node.textContent??'',valid:()=>valid(node)&&visible.has(node),dark,done:()=>{pending.delete(node);if(valid(node)&&visible.has(node))completed.add(node);onLayout()}});metrics.diagramQueueMax=Math.max(metrics.diagramQueueMax,queue.length)}void pump()};
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){const node=entry.target as HTMLElement;if(!entry.isIntersecting){visible.delete(node);continue}
  if(node.dataset.math!==undefined){observer.unobserve(node);void formula(node)}else{visible.add(node)}}fill()},{rootMargin:'300px'});
 async function formula(node:HTMLElement){try{const source=node.textContent??'',display=node.dataset.display==='true';if(source.length>50_000)throw new Error('公式超过长度边界');const key=`0.16|${display}|${source}`;let html=formulaCache.get(key);if(!html){if(!katexPromise){metrics.katexLoaded++;katexPromise=Promise.all([import('katex'),import('katex/dist/katex.min.css')]).then(([k])=>k).catch(e=>{katexPromise=undefined;throw e})}const k=await katexPromise;if(!valid(node))return;html=k.default.renderToString(source,{displayMode:display,trust:false,maxExpand:1000,maxSize:20,throwOnError:true,strict:'warn',macros:{}});cache(key,html)}if(valid(node)){node.innerHTML=html;node.classList.add('rendered');onLayout()}}catch(e){if(valid(node))failed(node,e)}}
 for(const node of root.querySelectorAll<HTMLElement>('[data-math],[data-diagram]'))observer.observe(node);
 if(root.matches('[data-math],[data-diagram]'))observer.observe(root);
 surfaces.add(fill);
 return ()=>{alive=false;observer.disconnect();surfaces.delete(fill);visible.clear();pending.clear();completed.clear();for(let i=queue.length-1;i>=0;i--)if(!queue[i].valid())queue.splice(i,1)};
}
export function rendererStats(){return {queued:queue.length,running:Number(running),surfaces:surfaces.size,formulaCacheEntries:formulaCache.size,formulaCacheBytes:cacheBytes}}
