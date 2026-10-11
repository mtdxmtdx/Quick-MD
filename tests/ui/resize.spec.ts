// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {test,expect} from '@playwright/test';

test('window resize keeps all modes and controls inside the viewport',async({page})=>{
 await page.goto('/');
 await page.waitForFunction(()=>!!window.quickMdTest);
 const text='# Resize\n\n'+('long-unbroken-text'.repeat(80))+'\n\n```text\n'+('wide-code-'.repeat(100))+'\n```\n\n'+('A paragraph that should wrap naturally. '.repeat(100));
 await page.evaluate(t=>window.quickMdTest.adopt(t),text);
 for(const mode of ['预览','源码','编辑']){
  await page.getByRole('button',{name:mode,exact:true}).click();
  for(const size of [{width:1100,height:800},{width:580,height:400},{width:800,height:500},{width:1100,height:800}]){
   await page.setViewportSize(size);
   await expect.poll(()=>page.evaluate(()=>{
    const selectors=['header','main','footer','nav','#open','#save','summary',document.querySelector('#editor')!.hasAttribute('hidden')?'#preview':'#editor'];
    return selectors.filter(selector=>{
     const r=document.querySelector(selector)!.getBoundingClientRect();
     return r.left < -1 || r.right > innerWidth+1 || r.top < -1 || r.bottom > innerHeight+1;
    });
   }),{message:`${mode}: ${size.width}x${size.height} must not clip the app`}).toEqual([]);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width+1);
  }
 }
 expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(text);
});
