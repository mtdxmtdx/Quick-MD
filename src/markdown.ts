// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import MarkdownIt from 'markdown-it';
import {tex} from '@mdit/plugin-tex';
import type Token from 'markdown-it/lib/token.mjs';
import {lineStarts,imageSlot,imageSource,type Parsed,type Complex} from './model';
// Raw HTML passes through here and is made safe by the sanitizer before it reaches the DOM.
const md=new MarkdownIt({html:true,linkify:false,typographer:false});
const escape=md.utils.escapeHtml;
export function mathPlaceholder(s:string,display:boolean){return `<${display?'div':'span'} class="math" data-math="" data-display="${display}">${escape(s)}</${display?'div':'span'}>`}
md.use(tex,{delimiters:'all',allowInlineWithSpace:false,render:mathPlaceholder});
// Capture offsets at the syntax rule boundary, never infer them from HTML.
for(const rule of (md.inline.ruler as unknown as {__rules__:Array<{name:string;fn:(...args:any[])=>boolean}>}).__rules__){
 if(rule.name.startsWith('math_inline_')){const old=rule.fn;rule.fn=(state:any,silent:boolean)=>{const from=state.pos,count=state.tokens.length;const ok=old(state,silent);if(ok&&!silent&&state.tokens.length>count){const token=state.tokens.at(-1);if(token.type==='math_inline')token.meta={from,to:state.pos}}return ok}}
}
const fence=md.renderer.rules.fence!;
md.renderer.rules.fence=(tokens,index,options,env,self)=>{const t=tokens[index];return t.info.trim().toLowerCase()==='mermaid'?`<div class="diagram" data-diagram=""><pre>${escape(t.content)}</pre></div>`:fence(tokens,index,options,env,self)};
// file: and the extra data: image types are only ever read through imageSource.
const validLink=md.validateLink;
md.validateLink=url=>validLink(url)||/^file:/i.test(url.trim())||/^data:image\/(?:avif|bmp|svg\+xml)[;,]/i.test(url.trim());
md.renderer.rules.image=(tokens,index,_options,env)=>{const t=tokens[index],src=t.attrGet('src')??'';if(imageSource(src).kind==='remote')env.remoteImages++;return imageSlot(src,t.content,t.attrGet('title')??'')};
// <img> in raw HTML becomes the same inert slot as Markdown images, so it obeys the same address rules.
function rawHtml(html:string,env:{remoteImages:number}){return html.replace(/<img\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi,tag=>{
 const attr=(name:string)=>{const m=new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i').exec(tag);return (m?.[1]??m?.[2]??m?.[3]??'').replace(/&amp;/g,'&')};
 const src=attr('src');if(imageSource(src).kind==='remote')env.remoteImages++;return imageSlot(src,attr('alt'),attr('title'),attr('width'))})}
md.renderer.rules.html_block=(tokens,index,_options,env)=>rawHtml(tokens[index].content.trimEnd(),env);
md.renderer.rules.html_inline=(tokens,index,_options,env)=>rawHtml(tokens[index].content,env);
const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
function htmlDepth(html:string){let depth=0;for(const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)(?:"[^"]*"|'[^']*'|[^>"'])*?(\/?)>/g)){if(!m[3]&&!voidTags.has(m[2].toLowerCase()))depth+=m[1]?-1:1}return depth}
// A blank line ends an HTML block, so <div> and its </div> can arrive as separate blocks. Find where an open tag closes.
function htmlClose(tokens:Token[],start:number){
 let depth=htmlDepth(tokens[start].content),line=tokens[start].map![1];if(depth<=0)return;
 for(let k=start+1;k<tokens.length&&k<start+2000;k++){const t=tokens[k];
  if(t.map&&t.level===0)line=t.map[1];
  if(t.type==='html_block')depth+=htmlDepth(t.content);else if(t.type==='inline')for(const c of t.children??[])if(c.type==='html_inline')depth+=htmlDepth(c.content);
  if(depth<=0){let end=k+1;while(end<tokens.length&&!(tokens[end].map&&tokens[end].level===0))end++;return {end,line}}
 }
}
export function parseMarkdown(text:string):Parsed {
 const env={remoteImages:0};const tokens=md.parse(text,env);const starts=lineStarts(text);const end=(line:number)=>starts[line]??text.length;
 // The TeX plugin accepts an unclosed dollar block up to EOF. Keep that input
 // literal rather than presenting an apparently completed mathematical block.
 for(const t of tokens){if(t.type==='math_block'&&t.markup==='$$'&&t.map){const raw=text.slice(end(t.map[0]),end(t.map[1]));if(!raw.trimEnd().endsWith('$$')||raw.trim().length<4){t.type='code_block';t.tag='code';t.content=raw}}}
 const complex:Complex[]=[];const blocks:Parsed['blocks']=[];
 for(let i=0;i<tokens.length;){const first=tokens[i];if(!first.map||first.level!==0){i++;continue}let j=i+1;
 if(first.nesting===1){let depth=1;while(j<tokens.length&&depth){depth+=tokens[j].nesting;j++}}
 const close=first.type==='html_block'?htmlClose(tokens,i):undefined;if(close)j=close.end;
 const from=end(first.map[0]),rawTo=end(close?.line??first.map[1]),to=rawTo>from&&text[rawTo-1]==='\n'?rawTo-1:rawTo;
 const html=md.renderer.render(tokens.slice(i,j),md.options,env);blocks.push({from,to:rawTo,kind:first.type,html});
 if(first.type==='table_open')complex.push({from,to,kind:'table',html,block:true});
 if(first.type==='html_block'&&!/^\s*<!--[\s\S]*-->\s*$/.test(html))complex.push({from,to,kind:'html',html,block:true});
 i=j;
 }
 for(const t of tokens){
  if(t.map&&(t.type==='math_block'||t.type==='fence'&&t.info.trim().toLowerCase()==='mermaid')){
   const from=end(t.map[0]),rawTo=end(t.map[1]),to=rawTo>from&&text[rawTo-1]==='\n'?rawTo-1:rawTo;
   complex.push({from,to,kind:t.type==='math_block'?'math':'diagram',html:md.renderer.render([t],md.options,env),block:true});
  }
  if(t.type==='inline'&&t.map&&t.children){
   const rawFrom=end(t.map[0]),rawTo=end(t.map[1]);
   const contentAt=text.indexOf(t.content,rawFrom);
   if(contentAt>=rawFrom&&contentAt+t.content.length<=rawTo){for(const child of t.children){if(child.type==='math_inline'&&child.meta){const from=contentAt+child.meta.from,to=contentAt+child.meta.to;complex.push({from,to,kind:'math',html:mathPlaceholder(child.content,false),block:false})}}}
  }
 }
 complex.sort((a,b)=>a.from-b.from||b.to-a.to);
 // Nested special nodes inside whole-table replacements are covered by the table.
 const filtered:Complex[]=[];for(const c of complex){if(!filtered.some(p=>c.from>=p.from&&c.to<=p.to))filtered.push(c)}
 return {blocks,complex:filtered,remoteImages:env.remoteImages};
}
