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
export const metrics={parseQueued:0,parseStarted:0,parseFinished:0,parseCommitted:0,serialized:0,queueMax:0,diagramQueueMax:0,diagramStarted:0,editorCreated:0,katexLoaded:0,mermaidLoaded:0};
export const trace:Array<{event:string;at:number;identity?:Identity}>=[];
export function record(event:string,identity?:Identity){trace.push({event,at:performance.now(),identity});if(trace.length>256)trace.shift()}
