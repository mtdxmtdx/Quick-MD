// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {invoke} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {DocumentSession,confirmReplacement,type Payload} from './document-session';
import {RenderClient} from './render-client';
import {metrics,record,trace,RENDER_LIMIT,countWords,sameIdentity,type Identity,type Mode,type Parsed} from './model';
import {cleanFragment} from './security';
import {hydrate,rendererStats} from './hydrate';
import type {Editor} from './editor';
import './style.css';
const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const preview=$<HTMLElement>('#preview'),editorHost=$<HTMLElement>('#editor');
let editor:Editor|undefined,mode:Mode='preview',epoch=0,themeEpoch=0,requestId=0,client:RenderClient|undefined;
let parsed:{docId:string;revision:number;result:Parsed}|undefined;
let disposeHydration=()=>{},timer:ReturnType<typeof setTimeout>|undefined;
let modeOperation=0,fileBusy=false,pendingSave=false;
const scrolls:Partial<Record<Mode,number>>={};let anchor={pos:0,offset:0};
const deferred:Array<()=>void>=[];
const session=new DocumentSession(()=>{$('#filename').textContent=session.name;$('#dirty').textContent=session.dirty?'未保存':'';docInfo();document.title=`${session.dirty?'● ':''}${session.name} — Quick MD`});
const native='__TAURI_INTERNALS__' in window;
// The translucent header overlays the page; visible content starts below it.
function viewTop(){return $('header').getBoundingClientRect().bottom}
function status(message:string){$('#status').textContent=message}
// Footer facts: encoding, line endings, cursor (editor modes) and a debounced word count.
let words:number|undefined,countTimer:ReturnType<typeof setTimeout>|undefined;
function docInfo(){const cursor=mode!=='preview'&&editor?editor.cursor():undefined;$('#doc-info').textContent=[session.bom?'UTF-8 BOM':'UTF-8',session.mixed?'混合换行':session.eol.toUpperCase(),cursor&&`行 ${cursor.line}，列 ${cursor.column}`,words!==undefined&&`${words.toLocaleString('zh-CN')} 字`].filter(Boolean).join(' · ')}
function countLater(){clearTimeout(countTimer);countTimer=setTimeout(()=>{words=session.doc.length>RENDER_LIMIT?undefined:countWords(session.lines());docInfo()},300)}
const modes=$<HTMLElement>('nav.modes'),lens=$<HTMLElement>('.lens');
// The lens slides with a fixed small overshoot and squash, so every switch moves the same way.
// Use `translate`, not `transform`: transform is applied after `scale`, which would stretch the slide distance too.
let lensX:number|undefined;
function placeLens(animate=false){const active=modes.querySelector<HTMLElement>('[aria-pressed=true]');if(!active)return;const x=active.offsetLeft,from=lensX;lensX=x;lens.style.width=`${active.offsetWidth}px`;lens.style.translate=`${x}px 0`;lens.classList.add('ready');
 if(!animate||from===undefined||from===x||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const past=x+Math.sign(x-from)*3;
 lens.animate([{translate:`${from}px 0`},{translate:`${past}px 0`,offset:.65},{translate:`${x}px 0`}],{duration:380,easing:'cubic-bezier(.3,.7,.4,1)'});
 lens.animate([{scale:'1 1'},{scale:'1.08 .9',offset:.35},{scale:'.98 1.03',offset:.7},{scale:'1 1'}],{duration:380,easing:'ease-out'})}
new ResizeObserver(()=>placeLens()).observe(modes);
function identity():Identity{return {docId:session.docId,revision:session.revision,requestId,surfaceEpoch:epoch,themeEpoch}}
function current(id:Identity){return sameIdentity(id,identity())}
function afterComposition(fn:()=>void){if(editor?.composing)deferred.push(fn);else fn()}
function compositionEnded(){const todo=deferred.splice(0);for(const fn of todo)fn();schedule()}
function invalidate(){epoch++;clearTimeout(timer);client?.cancel();disposeHydration();disposeHydration=()=>{}}
function previewAnchor(){const nodes=[...preview.querySelectorAll<HTMLElement>('[data-from]')];const top=viewTop();const first=nodes.find(n=>n.getBoundingClientRect().bottom>=top);return first?{pos:Number(first.dataset.from),offset:first.getBoundingClientRect().top-top}:anchor}
function renderPreview(result:Parsed){disposeHydration();const html=result.blocks.map(block=>`<section data-from="${block.from}">${block.html}</section>`).join('');preview.replaceChildren(cleanFragment(html));if(!result.blocks.length){const empty=document.createElement('div');empty.className='empty';empty.innerHTML='<span class="eyebrow">QUICK MD / LOCAL READER</span><h1>让文字，回到中心。</h1><p>打开 Markdown 文件开始阅读，<br>或新建一页，记录此刻的想法。</p>';preview.append(empty)}
 const id=identity();disposeHydration=hydrate(preview,()=>mode==='preview'&&current(id));requestAnimationFrame(()=>requestAnimationFrame(()=>{if(current(id)&&mode==='preview')record('previewPaint',id)}));
 if(scrolls.preview!==undefined)preview.scrollTop=scrolls.preview;else {const nodes=[...preview.querySelectorAll<HTMLElement>('[data-from]')];const node=nodes.find((n,i)=>Number(n.dataset.from)<=anchor.pos&&(!nodes[i+1]||Number(nodes[i+1].dataset.from)>anchor.pos));if(node&&anchor.pos>0)preview.scrollTop+=node.getBoundingClientRect().top-viewTop()-anchor.offset}
}
async function parse(){if(mode==='source'||editor?.composing||session.doc.length>RENDER_LIMIT)return;
 requestId++;const id=identity();if(parsed?.docId===id.docId&&parsed.revision===id.revision){if(mode==='live')editor?.complex(parsed.result.complex);else renderPreview(parsed.result);return}
 client??=new RenderClient(new Worker(new URL('./render.worker.ts',import.meta.url),{type:'module'}));
 const result=await client.request(id,session.text());if(!result||!current(id)||editor?.composing)return;
 parsed={docId:id.docId,revision:id.revision,result};metrics.parseCommitted++;record('renderCommitted',id);
 if(mode==='preview')renderPreview(result);else editor?.complex(result.complex);
}
function schedule(){clearTimeout(timer);if(mode!=='source'&&!editor?.composing)timer=setTimeout(()=>void parse(),120)}
async function changeMode(next:Mode,force=false){
 if(editor?.composing){deferred.push(()=>void changeMode(next,force));return}
 if(session.doc.length>RENDER_LIMIT&&next!=='source'){next='source';status('文档超过渲染阈值，已切换源码；正文完整保留。')}
 if(mode===next&&!force)return;
 const ticket=++modeOperation;
 if(!force){if(mode==='preview'){scrolls.preview=preview.scrollTop;anchor=previewAnchor()}else if(editor){scrolls[mode]=editor.view.scrollDOM.scrollTop;anchor=editor.anchor()}}
 invalidate();mode=next;
 // Preview is rebuilt from the cached parse on return; retaining its hidden DOM
 // only inflates memory and first-editor style/layout work for large documents.
 if(mode!=='preview'){preview.replaceChildren();preview.hidden=true}
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));placeLens(true);editorHost.dataset.mode=mode;docInfo();
 if(mode!=='preview'){
  if(!editor){const {Editor}=await import('./editor');if(ticket!==modeOperation)return;editor=new Editor(editorHost,session.text(),doc=>{session.edit(doc);const inputId=identity();record('inputReceived',inputId);parsed=undefined;if(doc.length>RENDER_LIMIT&&mode!=='source')queueMicrotask(()=>void changeMode('source'));else schedule();countLater();requestAnimationFrame(()=>record('inputPaint',inputId))},compositionEnded,docInfo);session.attach(editor.view.state.doc)}
  editor.modeTo(mode);preview.hidden=true;editorHost.hidden=false;editor.view.requestMeasure();if(scrolls[mode]!==undefined)editor.view.scrollDOM.scrollTop=scrolls[mode]!;else if(anchor.pos>0)editor.restore(anchor.pos,anchor.offset);editor.view.focus();
 }else {editor?.modeTo('preview');editorHost.hidden=true;preview.hidden=false;preview.focus()}
 await parse();
}
async function adopt(payload:Payload,initialMode:Mode){invalidate();editor?.destroy();editor=undefined;editorHost.replaceChildren();parsed=undefined;for(const key of Object.keys(scrolls) as Mode[])delete scrolls[key];anchor={pos:0,offset:0};session.adopt(payload);words=undefined;countLater();status(payload.mixed?`检测到混合换行；实际保存前将确认统一为 ${payload.eol.toUpperCase()}。`:'');await changeMode(initialMode,true)}
function ask(title:string,message:string,choices:Array<[string,string]>):Promise<string>{const dialog=$<HTMLDialogElement>('#confirm');$('#confirm-title').textContent=title;$('#confirm-text').textContent=message;const actions=$('#confirm-actions');actions.replaceChildren();return new Promise(resolve=>{const finish=(value:string)=>{dialog.close();dialog.oncancel=null;resolve(value);if(mode!=='preview')editor?.view.focus()};for(const [value,label] of choices){const button=document.createElement('button');button.textContent=label;button.onclick=()=>finish(value);actions.append(button)}dialog.oncancel=e=>{e.preventDefault();finish('cancel')};dialog.showModal()})}
async function save(saveAs=false):Promise<boolean>{
 if(!saveAs&&!session.exactDirty()&&session.name!=='未命名')return true;
 if(!native){status('浏览器仅用于界面验证；文件操作请在桌面应用执行。');return false}
 if(session.mixed&&await ask('混合换行',`本次写入将统一为 ${session.eol.toUpperCase()}，保留 UTF-8/BOM 与末尾换行边界。`,[['save','继续保存'],['cancel','取消']])!=='save')return false;
 const snapshot=session.snapshot();const result=await invoke<{docId:string;revision:number;name:string}|null>('save_document',{docId:snapshot.docId,revision:snapshot.revision,text:snapshot.text,saveAs,normalizeMixed:session.mixed});
 if(!result)return false;session.savedResult(snapshot,result);status(session.dirty?'已保存快照；后续输入仍未保存。':'已保存');return !session.exactDirty();
}
async function protect():Promise<boolean>{return confirmReplacement(session,()=>ask('保留更改？',`${session.name} 有尚未保存的内容。`,[['save','保存'],['discard','不保存'],['cancel','取消']]),()=>save())}
async function fileAction(action:'open'|'new'|'save'|'save-as'|'close'){
 if(editor?.composing){deferred.push(()=>void fileAction(action));return}
 if(fileBusy){if(action==='save')pendingSave=true;return}fileBusy=true;
 try{
  if(action==='save'||action==='save-as'){await save(action==='save-as');return}
  if(!await protect())return;
  if(action==='close'){client?.dispose();disposeHydration();session.dispose();if(native)await getCurrentWindow().destroy();return}
  if(!native){if(action==='new')await adopt({docId:crypto.randomUUID(),text:'',name:'未命名',mixed:false,eol:'lf'},'live');else status('请在桌面应用使用原生打开。');return}
  const docId=session.docId,revision=session.revision;
  const candidate=await invoke<Payload|null>(action==='open'?'prepare_open':'prepare_new',{docId});if(!candidate)return;
  if(session.docId!==docId)return;
  if(session.revision!==revision&&!await protect())return;
  // Prevent edits only during the short candidate commit, never over the native picker.
  editorHost.inert=true;await invoke('commit_document',{docId,candidateId:candidate.docId});
  const adopting=adopt(candidate,action==='new'?'live':'preview');editorHost.inert=false;await adopting;
 }catch(e){status(String(e))}finally{editorHost.inert=false;if(mode!=='preview'&&!$<HTMLDialogElement>('#confirm').open)editor?.view.focus();fileBusy=false;if(pendingSave){pendingSave=false;void fileAction('save')}}
}
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))button.onclick=()=>{void changeMode(button.dataset.mode as Mode).catch(e=>status(String(e)))};
for(const action of ['open','new','save','save-as'] as const)$('#'+action).onclick=()=>{more.open=false;void fileAction(action)};
const more=$<HTMLDetailsElement>('.actions details');
document.addEventListener('pointerdown',e=>{if(more.open&&!more.contains(e.target as Node))more.open=false});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&more.open){more.open=false;more.querySelector('summary')!.focus()}});
document.addEventListener('keydown',e=>{if(e.isComposing||editor?.composing||(!e.ctrlKey&&!e.metaKey)||e.altKey)return;const key=e.key.toLowerCase();if(['1','2','3'].includes(key)){e.preventDefault();void changeMode(({1:'live',2:'source',3:'preview'} as Record<string,Mode>)[key])}else if(['n','o','s'].includes(key)){e.preventDefault();void fileAction(key==='n'?'new':key==='o'?'open':e.shiftKey?'save-as':'save')}});
for(const event of ['click','auxclick','dblclick'])document.addEventListener(event,e=>{if((e.target as Element).closest('a'))e.preventDefault()},true);
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{themeEpoch++;invalidate();if(mode==='live'){editor?.complex([])}void parse()});
window.addEventListener('beforeunload',e=>{if(!native&&session.exactDirty())e.preventDefault()});
// The header is the title bar: caption buttons on the right, empty space drags (double-click maximizes).
function windowChrome(){const win=getCurrentWindow(),max=$('#win-max');$('.window-controls').hidden=false;
 $('#win-min').onclick=()=>void win.minimize();max.onclick=()=>void win.toggleMaximize();$('#win-close').onclick=()=>void win.close();
 const sync=async()=>{const maximized=await win.isMaximized();max.dataset.state=maximized?'restore':'maximize';max.title=maximized?'还原':'最大化';max.setAttribute('aria-label',max.title)};
 void sync();void win.onResized(()=>void sync());
 $('header').addEventListener('mousedown',e=>{if(e.button!==0||(e.target as Element).closest('button,summary,details,nav,.actions'))return;if(e.detail===2)void win.toggleMaximize();else void win.startDragging()});
}
async function start(){if(native)windowChrome();if(native){await getCurrentWindow().onCloseRequested(e=>{e.preventDefault();afterComposition(()=>void fileAction('close'))});try{await adopt(await invoke<Payload>('startup_document'),'preview')}catch(e){status(String(e));/* Retrieve the unchanged session after a failed startup request. */try{await adopt(await invoke<Payload>('startup_document'),'preview');status(String(e))}catch(next){status(String(next))}}}else await adopt({docId:crypto.randomUUID(),text:'',name:'未命名',mixed:false,eol:'lf'},'preview')}
void start();
// Read-only diagnostics are bounded; browser-only fixtures never grant native paths.
Object.defineProperty(window,'quickMdDiagnostics',{value:()=>({metrics:{...metrics},trace:[...trace],renderers:rendererStats(),mode,revision:session.revision,dirty:session.dirty,length:session.doc.length})});
if(!native&&import.meta.env.MODE==='test')Object.assign(window,{quickMdTest:{adopt:(text:string)=>adopt({docId:crypto.randomUUID(),text,name:'fixture.md',mixed:false,eol:'lf'},'preview'),text:()=>session.text(),editor:()=>editor,session,changeMode}});
