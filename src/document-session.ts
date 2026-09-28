// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {metrics} from './model';
export interface TextSnapshot {length:number;toString():string;eq(other:TextSnapshot):boolean}
export type Snapshot=string|TextSnapshot;
export interface Payload {docId:string;text:string;name:string;mixed:boolean;eol:string}
export interface SaveSnapshot {docId:string;revision:number;doc:Snapshot;text:string}
function equal(a:Snapshot,b:Snapshot){if(a===b)return true;if(a.length!==b.length)return false;return typeof a!=='string'&&typeof b!=='string'?a.eq(b):a.toString()===b.toString()}
export class DocumentSession {
  docId='';revision=0;name='未命名';mixed=false;eol='lf';doc:Snapshot='';saved:Snapshot='';dirty=false;
  private timer:ReturnType<typeof setTimeout>|undefined;
  constructor(private changed:()=>void=()=>{}){}
  adopt(p:Payload){clearTimeout(this.timer);this.docId=p.docId;this.revision=0;this.name=p.name;this.mixed=p.mixed;this.eol=p.eol;this.doc=this.saved=p.text;this.dirty=false;this.changed()}
  attach(doc:TextSnapshot){const clean=!this.exactDirty();this.doc=doc;if(clean)this.saved=doc}
  edit(doc:TextSnapshot){this.doc=doc;this.revision++;this.dirty=true;this.changed();clearTimeout(this.timer);this.timer=setTimeout(()=>{this.exactDirty();this.changed()},160)}
  exactDirty(){this.dirty=!equal(this.doc,this.saved);return this.dirty}
  text(){metrics.serialized++;return this.doc.toString()}
  snapshot():SaveSnapshot{return {docId:this.docId,revision:this.revision,doc:this.doc,text:this.text()}}
  savedResult(s:SaveSnapshot,result:{docId:string;revision:number;name:string}){if(result.docId!==this.docId||s.docId!==this.docId||result.revision!==s.revision)return false;this.saved=s.doc;this.name=result.name;this.mixed=false;this.exactDirty();this.changed();return true}
  dispose(){clearTimeout(this.timer)}
}
export async function confirmReplacement(session:DocumentSession,choose:()=>Promise<string>,save:()=>Promise<boolean>):Promise<boolean>{
 if(!session.exactDirty())return true;
 const choice=await choose();
 if(choice==='discard')return true;
 if(choice!=='save')return false;
 return await save()&&!session.exactDirty();
}
