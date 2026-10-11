// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {metrics,record,sameIdentity,type Identity,type Parsed} from './model';
export interface WorkerLike {postMessage(data:unknown):void;onmessage:((event:MessageEvent)=>void)|null;onerror:((event:ErrorEvent)=>void)|null;terminate():void}
interface Job {identity:Identity;text:string;resolve:(value:Parsed|null)=>void}
export class RenderClient {
 private running?:Job;private waiting?:Job;private disposed=false;
 constructor(private worker:WorkerLike){worker.onmessage=e=>{const job=this.running;if(!job)return;this.running=undefined;metrics.parseFinished++;record('parseFinished',job.identity);job.resolve(sameIdentity(e.data.identity,job.identity)&&!e.data.error?e.data.result:null);const next=this.waiting;this.waiting=undefined;if(next)this.start(next)};worker.onerror=()=>{this.cancel();this.worker.terminate();this.disposed=true}}
 request(identity:Identity,text:string):Promise<Parsed|null>{if(this.disposed)return Promise.resolve(null);metrics.parseQueued++;record('parseQueued',identity);return new Promise(resolve=>{const job={identity,text,resolve};if(this.running){this.waiting?.resolve(null);this.waiting=job}else this.start(job);metrics.queueMax=Math.max(metrics.queueMax,Number(!!this.running)+Number(!!this.waiting))})}
 private start(job:Job){this.running=job;metrics.parseStarted++;record('parseStarted',job.identity);this.worker.postMessage({identity:job.identity,text:job.text})}
 cancel(){this.waiting?.resolve(null);this.waiting=undefined;this.running?.resolve(null)}
 dispose(){this.disposed=true;this.cancel();this.running=undefined;this.worker.terminate()}
}
