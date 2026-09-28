// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
test('batch sanitization preserves complete block structure and security',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>!!(window as any).mdLiteTest);
 const fixtures=['plain-102400.md','plain-1048576.md','basic.md','math.md','diagrams.md','security.md'];
 const results=[];
 for(const file of fixtures){
  const source=readFileSync('tests/fixtures/'+file,'utf8');
  const result=await page.evaluate(async source=>{
   const securityUrl='/src/security.ts',markdownUrl='/src/markdown.ts';
   const {cleanHtml,cleanFragment}=await import(securityUrl),{parseMarkdown}=await import(markdownUrl);
   const blocks=parseMarkdown(source).blocks;const oldTimes=[],batchTimes=[];let equal=true;
   for(let n=0;n<5;n++){
    let start=performance.now();const old=document.createElement('div');
    for(const block of blocks){const node=document.createElement('section');node.dataset.from=String(block.from);node.innerHTML=cleanHtml(block.html);old.append(node)}
    oldTimes.push(performance.now()-start);start=performance.now();const batch=document.createElement('div');
    batch.append(cleanFragment(blocks.map((b:any)=>`<section data-from="${b.from}">${b.html}</section>`).join('')));
    batchTimes.push(performance.now()-start);equal&&=old.innerHTML===batch.innerHTML;
   }
   const untrusted=cleanFragment('<section data-from="0"><img src=x onerror=alert(1)><script>bad()</script><a href="javascript:bad()">x</a><iframe></iframe></section>');
   return {blocks:blocks.length,oldTimes,batchTimes,equal,unsafeCount:untrusted.querySelectorAll('script,img,iframe,[onerror],[href]').length};
  },source);
  expect(result.equal).toBe(true);expect(result.unsafeCount).toBe(0);results.push({file,...result});
 }
 writeFileSync('docs/evidence/preview-sanitize.json',JSON.stringify({at:new Date().toISOString(),context:'Headless Edge, detached DOM; not release startup measurement',results},null,2));
});
