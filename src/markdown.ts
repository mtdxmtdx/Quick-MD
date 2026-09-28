// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import MarkdownIt from 'markdown-it';
import {tex} from '@mdit/plugin-tex';
import type Token from 'markdown-it/lib/token.mjs';
import {lineStarts,type Parsed,type Complex} from './model';
const md=new MarkdownIt({html:false,linkify:false,typographer:false});
const escape=md.utils.escapeHtml;
export function mathPlaceholder(s:string,display:boolean){return `<${display?'div':'span'} class="math" data-math="" data-display="${display}">${escape(s)}</${display?'div':'span'}>`}
md.use(tex,{delimiters:'all',allowInlineWithSpace:false,render:mathPlaceholder});
// Capture offsets at the syntax rule boundary, never infer them from HTML.
for(const rule of (md.inline.ruler as unknown as {__rules__:Array<{name:string;fn:(...args:any[])=>boolean}>}).__rules__){
 if(rule.name.startsWith('math_inline_')){const old=rule.fn;rule.fn=(state:any,silent:boolean)=>{const from=state.pos,count=state.tokens.length;const ok=old(state,silent);if(ok&&!silent&&state.tokens.length>count){const token=state.tokens.at(-1);if(token.type==='math_inline')token.meta={from,to:state.pos}}return ok}}
}
const fence=md.renderer.rules.fence!;
md.renderer.rules.fence=(tokens,index,options,env,self)=>{const t=tokens[index];return t.info.trim().toLowerCase()==='mermaid'?`<div class="diagram" data-diagram=""><pre>${escape(t.content)}</pre></div>`:fence(tokens,index,options,env,self)};
md.renderer.rules.image=(tokens,index)=>`<span class="blocked-image">[图片：${escape(tokens[index].content)}]</span>`;
export function parseMarkdown(text:string):Parsed {
 const env={};const tokens=md.parse(text,env);const starts=lineStarts(text);const end=(line:number)=>starts[line]??text.length;
 // The TeX plugin accepts an unclosed dollar block up to EOF. Keep that input
 // literal rather than presenting an apparently completed mathematical block.
 for(const t of tokens){if(t.type==='math_block'&&t.markup==='$$'&&t.map){const raw=text.slice(end(t.map[0]),end(t.map[1]));if(!raw.trimEnd().endsWith('$$')||raw.trim().length<4){t.type='code_block';t.tag='code';t.content=raw}}}
 const complex:Complex[]=[];const blocks:Parsed['blocks']=[];
 for(let i=0;i<tokens.length;){const first=tokens[i];if(!first.map||first.level!==0){i++;continue}let j=i+1;
 if(first.nesting===1){let depth=1;while(j<tokens.length&&depth){depth+=tokens[j].nesting;j++}}
 const from=end(first.map[0]),rawTo=end(first.map[1]),to=rawTo>from&&text[rawTo-1]==='\n'?rawTo-1:rawTo;
 const html=md.renderer.render(tokens.slice(i,j),md.options,env);blocks.push({from,to:rawTo,kind:first.type,html});
 if(first.type==='table_open')complex.push({from,to,kind:'table',html,block:true});
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
 return {blocks,complex:filtered};
}
