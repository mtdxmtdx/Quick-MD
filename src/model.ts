// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
export type Mode = 'live' | 'source' | 'preview';
export const RENDER_LIMIT = 2_097_152;
export interface Identity {docId:string; revision:number; requestId:number; surfaceEpoch:number; themeEpoch:number}
export interface Span {from:number;to:number}
export interface Block extends Span {html:string;kind:string}
export interface Complex extends Span {kind:'math'|'diagram'|'table';html:string;block:boolean}
export interface Parsed {blocks:Block[];complex:Complex[]}
export function active(span:Span,ranges:readonly Span[]):boolean {
  return ranges.some(r=>r.from===r.to ? r.from>=span.from && r.from<=span.to : r.from<span.to && r.to>span.from);
}
export function sameIdentity(a:Identity,b:Identity):boolean {return a.docId===b.docId&&a.revision===b.revision&&a.requestId===b.requestId&&a.surfaceEpoch===b.surfaceEpoch&&a.themeEpoch===b.themeEpoch}
export function lineStarts(s:string):number[]{const out=[0];for(let i=0;i<s.length;i++)if(s.charCodeAt(i)===10)out.push(i+1);return out}
export const metrics={parseQueued:0,parseStarted:0,parseFinished:0,parseCommitted:0,serialized:0,queueMax:0,diagramQueueMax:0,diagramStarted:0,editorCreated:0,katexLoaded:0,mermaidLoaded:0};
export const trace:Array<{event:string;at:number;identity?:Identity}>=[];
export function record(event:string,identity?:Identity){trace.push({event,at:performance.now(),identity});if(trace.length>256)trace.shift()}
