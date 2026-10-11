// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {chromium} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(),exe=path.join(root,'src-tauri/target/release/quick-md.exe');
const report={at:new Date().toISOString(),exeSha256:createHash('sha256').update(await readFile(exe)).digest('hex'),samples:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 for(const file of ['huge-list.md','long-line.md','plain-1048576.md']){
  const fixture=path.join(root,'tests/fixtures',file),original=await readFile(fixture,'utf8');
  const started=Date.now(),child=spawn(exe,[fixture],{windowsHide:true,env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9439',WEBVIEW2_USER_DATA_FOLDER:path.join(root,'.cache/webview-boundaries')}});
  let browser;const sample={file,utf16:original.length,errors:[]};
  try{
   for(let n=0;n<100;n++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9439');break}catch{await sleep(100)}}if(!browser)throw new Error('CDP not available');
   const page=browser.contexts()[0].pages()[0];page.on('pageerror',e=>sample.errors.push(String(e)));
   await page.waitForFunction(()=>window.quickMdDiagnostics?.().trace.some(t=>t.event==='previewPaint'),null,{timeout:60000});
   sample.observedPreviewMs=Date.now()-started;sample.initial=await page.evaluate(()=>window.quickMdDiagnostics());
   const editStart=Date.now();await page.getByRole('button',{name:'源码',exact:true}).click();await page.locator('.cm-content').waitFor();sample.sourceReadyMs=Date.now()-editStart;
   await page.locator('.cm-content').press('Control+End');const inputStart=Date.now();await page.keyboard.insertText('BOUNDARY');await page.waitForFunction(n=>window.quickMdDiagnostics().length===n,original.length+8);sample.inputObservedMs=Date.now()-inputStart;
   await page.keyboard.press('Control+z');await page.waitForFunction(n=>window.quickMdDiagnostics().length===n,original.length);await page.waitForFunction(()=>!window.quickMdDiagnostics().dirty);
   sample.final=await page.evaluate(()=>window.quickMdDiagnostics());if(sample.errors.length)throw new Error(sample.errors.join('\n'));if(await readFile(fixture,'utf8')!==original)throw new Error('Fixture changed without save');
   if(file==='huge-list.md'){
    const memory=()=>JSON.parse(execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'scripts/activity.ps1'),'-RootPid',String(child.pid)],{encoding:'utf8'}));
    sample.idleBefore=memory();sample.idleMetricsBefore=await page.evaluate(()=>window.quickMdDiagnostics().metrics);const idleStart=Date.now();await sleep(30000);sample.idleAfter=memory();sample.idleWallMs=Date.now()-idleStart;sample.idleMetricsAfter=await page.evaluate(()=>window.quickMdDiagnostics().metrics);
    const before=new Map(sample.idleBefore.map(p=>[p.pid,p.cpuSeconds]));sample.cpuSecondsDelta=sample.idleAfter.reduce((sum,p)=>sum+Math.max(0,p.cpuSeconds-(before.get(p.pid)??p.cpuSeconds)),0);sample.oneCoreCpuPercent=sample.cpuSecondsDelta/(sample.idleWallMs/1000)*100;
   }
   if(file==='plain-1048576.md'){
    await page.keyboard.press('Control+n');await page.waitForFunction(()=>window.quickMdDiagnostics().length===0&&window.quickMdDiagnostics().mode==='live');
    await page.waitForFunction(()=>document.activeElement?.classList.contains('cm-content'));
    await page.keyboard.insertText('focus');await page.waitForFunction(()=>window.quickMdDiagnostics().length===5);sample.newDocumentFocused=true;
   }
   sample.passed=true;report.samples.push(sample);console.log(JSON.stringify(sample));
  }finally{if(browser){const page=browser.contexts()[0]?.pages()[0];if(page&&!page.isClosed())await page.evaluate(()=>{void window.__TAURI_INTERNALS__.invoke('plugin:window|destroy',{label:'main'})}).catch(()=>{});await browser.close().catch(()=>{})}for(let n=0;n<40&&child.exitCode===null;n++)await sleep(50);if(child.exitCode===null)child.kill();await sleep(100)}
 }
 report.passed=true;
}catch(e){report.passed=false;report.error=String(e);process.exitCode=1}finally{await writeFile('docs/evidence/native-boundaries.json',JSON.stringify(report,null,2));console.log('Native boundaries passed:',report.passed,report.error??'')}
