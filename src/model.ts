// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
export type Mode = 'live' | 'source' | 'preview';
export const RENDER_LIMIT = 2_097_152;
export interface Identity {docId:string; revision:number; requestId:number; surfaceEpoch:number; themeEpoch:number}
export interface Span {from:number;to:number}
export interface Block extends Span {html:string;kind:string}
export interface Complex extends Span {kind:'math'|'diagram'|'table'|'image'|'html';html:string;block:boolean}
export interface Parsed {blocks:Block[];complex:Complex[];remoteImages:number}
export function active(span:Span,ranges:readonly Span[]):boolean {
  return ranges.some(r=>r.from===r.to ? r.from>=span.from && r.from<=span.to : r.from<span.to && r.to>span.from);
}
export function sameIdentity(a:Identity,b:Identity):boolean {return a.docId===b.docId&&a.revision===b.revision&&a.requestId===b.requestId&&a.surfaceEpoch===b.surfaceEpoch&&a.themeEpoch===b.themeEpoch}
export function lineStarts(s:string):number[]{const out=[0];for(let i=0;i<s.length;i++)if(s.charCodeAt(i)===10)out.push(i+1);return out}
// Each CJK character counts as one; other scripts count by runs of letters and digits.
const cjk='\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}';
const wordPattern=new RegExp(`[${cjk}]|(?:(?![${cjk}])[\\p{L}\\p{N}])+`,'gu');
const htmlTag=/<\/?[a-zA-Z](?:"[^"]*"|'[^']*'|[^>"'])*>/g;
export function countWords(lines:Iterable<string>):number{let n=0;for(const line of lines)for(const m of (line.includes('base64,')?line.replace(embeddedImage,''):line).replace(htmlTag,'').matchAll(wordPattern))n++;return n}
// Embedded image data costs almost nothing to render, so only the rest of a document counts toward RENDER_LIMIT.
const embeddedImage=/data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g;
const measured=new WeakMap<object,boolean>();
export function overRenderLimit(doc:string|{length:number;iterLines():Iterable<string>}):boolean{
 if(doc.length<=RENDER_LIMIT)return false;
 if(typeof doc!=='string'&&measured.has(doc))return measured.get(doc)!;
 let size=doc.length;for(const line of typeof doc==='string'?[doc]:doc.iterLines()){if(line.includes('base64,'))for(const m of line.matchAll(embeddedImage))size-=m[0].length}
 const over=size>RENDER_LIMIT;if(typeof doc!=='string')measured.set(doc,over);return over;
}
export type ImageSource={kind:'data';url:string}|{kind:'remote';url:string}|{kind:'local';path:string}|{kind:'rejected'};
// Sort a Markdown image address. Only what this returns is ever given to an <img>.
export function imageSource(raw:string):ImageSource{
 const src=raw.trim().replace(/^<(.*)>$/s,'$1');
 if(/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml)[;,]/i.test(src))return {kind:'data',url:src};
 if(/^https?:\/\//i.test(src))return {kind:'remote',url:src};
 if(/^file:\/\/(?!\/)/i.test(src))return {kind:'rejected'};
 let path=src.replace(/^file:\/\/\/?/i,'').replace(/[?#].*$/s,'');
 try{path=decodeURIComponent(path)}catch{/* A literal % in the file name. */}
 if(!path||/^[\\/]{2}/.test(path)||/^[a-z][a-z0-9+.-]+:/i.test(path))return {kind:'rejected'};
 return {kind:'local',path};
}
const imageTypes:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',svg:'image/svg+xml',ico:'image/x-icon'};
export function imageType(path:string):string{return imageTypes[path.split('.').pop()?.toLowerCase()??'']??''}
const attribute=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// An inert slot: the sanitizer still forbids <img>, and hydrate fills this in after checking the address.
export function imageSlot(src:string,alt:string,title='',width=''):string{return `<span class="image-slot" data-image="" data-src="${attribute(src)}" data-alt="${attribute(alt)}" data-title="${attribute(title)}" data-width="${attribute(width)}">[图片：${attribute(alt)}]</span>`}
// A GFM table split into cells, with offsets relative to the table's first character.
export interface TableCell {from:number;to:number;text:string}
export interface Table {rows:Array<Array<TableCell|null>>;align:string[]}
const blank=(c:string|undefined)=>c===' '||c==='\t';
function tableRow(text:string,offset:number):TableCell[]{
 const pipes:number[]=[];for(let i=0,escaped=false;i<text.length;i++){if(text[i]==='|'&&!escaped)pipes.push(i);escaped=text[i]==='\\'&&!escaped}
 let first=0;while(first<text.length&&blank(text[first]))first++;let last=text.length-1;while(last>=0&&blank(text[last]))last--;
 const edges=[...pipes];if(edges[0]!==first)edges.unshift(-1);if(edges.at(-1)!==last||edges.length<2)edges.push(text.length);
 const cells:TableCell[]=[];
 for(let i=0;i+1<edges.length;i++){const start=edges[i]+1,end=edges[i+1];let a=start,b=end;while(a<b&&blank(text[a]))a++;while(b>a&&blank(text[b-1]))b--;
  // An empty cell is edited at the gap after its first space.
  if(a===b)a=b=Math.min(start+(blank(text[start])?1:0),end);
  cells.push({from:offset+a,to:offset+b,text:text.slice(a,b)})}
 return cells;
}
export function parseTable(source:string):Table|null{
 const lines:Array<{text:string;offset:number}>=[];let offset=0;for(const text of source.split('\n')){lines.push({text,offset});offset+=text.length+1}
 if(lines.length<2)return null;
 const header=tableRow(lines[0].text,lines[0].offset);if(!header.length)return null;
 const align=tableRow(lines[1].text,0).map(c=>/^:-+:$/.test(c.text)?'center':/^-+:$/.test(c.text)?'right':/^:-+$/.test(c.text)?'left':'');
 const rows:Table['rows']=[header];
 for(const line of lines.slice(2)){const cells=tableRow(line.text,line.offset);rows.push(header.map((_,i)=>cells[i]??null))}
 return {rows,align:header.map((_,i)=>align[i]??'')};
}
export const metrics={parseQueued:0,parseStarted:0,parseFinished:0,parseCommitted:0,serialized:0,queueMax:0,diagramQueueMax:0,diagramStarted:0,editorCreated:0,katexLoaded:0,mermaidLoaded:0};
export const trace:Array<{event:string;at:number;identity?:Identity}>=[];
export function record(event:string,identity?:Identity){trace.push({event,at:performance.now(),identity});if(trace.length>256)trace.shift()}
