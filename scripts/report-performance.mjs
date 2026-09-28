// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {readFile,writeFile} from 'node:fs/promises';
const p=JSON.parse((await readFile('docs/evidence/performance.json','utf8')).replace(/^\ufeff/,''));
if(!p.success)throw Error('Measurement did not finish successfully');
const quantile=(a,q)=>[...a].sort((x,y)=>x-y)[Math.ceil(a.length*q)-1];
const samples=p.startup.filter(s=>!s.priming).map(s=>s.paintEstimateMs),mib=p.memoryPlain.reduce((sum,r)=>sum+r.privateWorkingSet,0)/1048576;
const result={measuredAt:p.at,exeSha256:p.artifacts.exeSha256,samples:samples.length,warmP50:quantile(samples,.5),warmP95:quantile(samples,.95),switchP95:quantile(p.interaction.switches.map(s=>s.ms),.95),privateWorkingSetMiB:mib};
await writeFile('docs/evidence/performance-summary.md',`# Local release measurement\n\n${JSON.stringify(result,null,2)}\n\nRaw samples and environment: performance.json. Warm launches only; no cold-start claim. Memory includes application WebView2 descendants. This report does not change the published historical benchmark.\n`);
console.log(JSON.stringify(result));
