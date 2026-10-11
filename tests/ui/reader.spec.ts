// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
declare global{interface Window {quickMdTest:any;quickMdDiagnostics:()=>any}}
const basic='# Heading\n\nHello **bold** and *italic* and ~~strike~~ and `code` [link](https://example.com).\n\n- one\n- two\n\nEnd 😀\n';
test.beforeEach(async({page})=>{await page.goto('/');await page.waitForLoadState('networkidle');await page.waitForFunction(()=>!!window.quickMdTest);await page.evaluate(text=>window.quickMdTest.adopt(text),basic);await expect(page.locator('#preview h1')).toHaveText('Heading')});
test('live syntax styling survives complex widgets in the document',async({page})=>{await page.evaluate(()=>window.quickMdTest.adopt('# Title\n\n**bold** text\n\n$$\nx^2\n$$\n\n| A |\n|---|\n| 1 |\n\nend'));await page.getByRole('button',{name:'编辑',exact:true}).click();await expect(page.locator('.live-widget')).toHaveCount(2);await page.evaluate(()=>{const v=window.quickMdTest.editor().view;v.dispatch({selection:{anchor:v.state.doc.length}})});await expect(page.locator('.cm-line.live-heading.h1')).toHaveText('Title');await expect(page.locator('.live-strong')).toHaveText('bold')});
test('preview lazy loads no editor or complex engines',async({page})=>{const d=await page.evaluate(()=>window.quickMdDiagnostics());expect(d.metrics.editorCreated).toBe(0);expect(d.metrics.katexLoaded).toBe(0);expect(d.metrics.mermaidLoaded).toBe(0);await page.locator('#preview').press('Delete');expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(basic)});
test('20 mode cycles preserve source and one editor',async({page})=>{await page.evaluate(async()=>{for(let n=0;n<20;n++){await window.quickMdTest.changeMode('source');await window.quickMdTest.changeMode('live');await window.quickMdTest.changeMode('preview')}});expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(basic);expect((await page.evaluate(()=>window.quickMdDiagnostics())).metrics.editorCreated).toBe(1)});
test('undo survives live/source and restores dirty',async({page})=>{await page.getByRole('button',{name:'源码',exact:true}).click();await page.locator('.cm-content').press('Control+End');await page.keyboard.type('alpha');await page.getByRole('button',{name:'编辑',exact:true}).click();await page.keyboard.type('beta');await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>window.quickMdTest.text())).toBe(basic);await expect.poll(()=>page.evaluate(()=>window.quickMdDiagnostics().dirty)).toBe(false)});
test('selection-only updates do not serialize or parse',async({page})=>{await page.getByRole('button',{name:'编辑',exact:true}).click();await page.waitForTimeout(200);const before=await page.evaluate(()=>window.quickMdDiagnostics().metrics);await page.evaluate(()=>{const v=window.quickMdTest.editor().view;for(let n=0;n<100;n++)v.dispatch({selection:{anchor:n%v.state.doc.length}})});const after=await page.evaluate(()=>window.quickMdDiagnostics().metrics);expect(after.parseStarted).toBe(before.parseStarted);expect(after.serialized).toBe(before.serialized)});
test('ordinary text remains editable nodes and active marks reveal',async({page})=>{await page.getByRole('button',{name:'编辑',exact:true}).click();await expect(page.locator('.live-strong')).toHaveText('bold');await page.evaluate(()=>{const v=window.quickMdTest.editor().view;v.dispatch({selection:{anchor:23}})});await expect(page.locator('.cm-content')).toContainText('**bold**');expect(await page.locator('.live-widget').count()).toBe(0)});
test('math and Mermaid render, errors remain local',async({page})=>{await page.evaluate(text=>window.quickMdTest.adopt(text),'$x$ and \\(y\\)\n\n$$\n\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\n$$\n\n\\[\na+b\n\\]\n\n```mermaid\nflowchart LR\nA-->B\n```\n\n```mermaid\ninvalidDiagram\n```\n\nSurvives');await expect(page.locator('.katex')).toHaveCount(4);await expect(page.locator('.diagram svg')).toHaveCount(1);await expect(page.locator('.render-error')).toHaveCount(1);await expect(page.locator('#preview')).toContainText('Survives');await page.screenshot({path:'docs/evidence/math-diagram.png',fullPage:true})});
test('complex block expansion, no stale widget after insertion',async({page})=>{await page.evaluate(text=>window.quickMdTest.adopt(text),'Start\n\n| A | B |\n|---|---|\n|x|y|\n\nEnd');await page.getByRole('button',{name:'编辑',exact:true}).click();await expect(page.locator('.live-widget table')).toHaveCount(1);await page.locator('.live-widget').click();await expect(page.locator('.cm-content')).toContainText('| A | B |');await page.evaluate(()=>{const v=window.quickMdTest.editor().view;v.dispatch({changes:{from:0,insert:'Prefix\n'},selection:{anchor:0}})});await expect(page.locator('.live-widget table')).toHaveCount(1)});
test('composition defers mode change and preserves content',async({page})=>{await page.getByRole('button',{name:'编辑',exact:true}).click();await page.locator('.cm-content').dispatchEvent('compositionstart');await page.getByRole('button',{name:'预览',exact:true}).click();expect((await page.evaluate(()=>window.quickMdDiagnostics())).mode).toBe('live');await page.locator('.cm-content').dispatchEvent('compositionend');await expect.poll(()=>page.evaluate(()=>window.quickMdDiagnostics().mode)).toBe('preview');expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(basic)});
test('dynamic limit enters source without truncation',async({page})=>{await page.getByRole('button',{name:'源码',exact:true}).click();await page.locator('.cm-content').waitFor();await page.evaluate(()=>{const v=window.quickMdTest.editor().view;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:'x'.repeat(2097153)}})});await page.getByRole('button',{name:'编辑',exact:true}).click();expect((await page.evaluate(()=>window.quickMdDiagnostics())).mode).toBe('source');expect((await page.evaluate(()=>window.quickMdDiagnostics())).length).toBe(2097153)});
test('untrusted markup and Mermaid config remain inert',async({page})=>{await page.evaluate(text=>window.quickMdTest.adopt(text),'<script>window.pwned=1</script>\n\n[x](javascript:alert(1))\n\n```mermaid\n%%{init: {securityLevel: "loose"}}%%\nflowchart LR\nA-->B\n```');await expect(page.locator('.render-error')).toHaveCount(1);expect(await page.evaluate(()=>('pwned' in window))).toBe(false);expect(await page.locator('#preview script,#preview iframe').count()).toBe(0)});
test('five diagram types preserve labels and local markers',async({page})=>{await page.evaluate(text=>window.quickMdTest.adopt(text),readFileSync('tests/fixtures/diagrams.md','utf8'));for(let i=0;i<5;i++){const diagram=page.locator('.diagram').nth(i);await diagram.scrollIntoViewIfNeeded();await expect(diagram.locator('svg')).toHaveCount(1);await expect(diagram.locator('text')).not.toHaveCount(0)}expect(await page.locator('.render-error').count()).toBe(0);const refs=await page.locator('.diagram [marker-end]').evaluateAll(nodes=>nodes.every(n=>{const id=n.getAttribute('marker-end')?.match(/#([^)]*)/);return id&&document.getElementById(id[1])}));expect(refs).toBe(true);await page.screenshot({path:'docs/evidence/five-diagrams.png'})});
test('diagram burst has bounded queue and disposes pending work',async({page})=>{const text=Array.from({length:20},()=> '```mermaid\nflowchart LR\nA-->B\n```\n').join('\n');await page.evaluate(t=>window.quickMdTest.adopt(t),text);await page.locator('.diagram').last().scrollIntoViewIfNeeded();await page.getByRole('button',{name:'源码',exact:true}).click();await page.locator('.cm-content').waitFor();await expect.poll(()=>page.evaluate(()=>window.quickMdDiagnostics().renderers.queued)).toBe(0);const d=await page.evaluate(()=>window.quickMdDiagnostics());expect(d.metrics.diagramQueueMax).toBeLessThanOrEqual(8);expect(d.renderers.surfaces).toBe(0)});
test('source selection across widgets copies original and edit is undoable',async({page})=>{const text='before\n\n$$\nx+1\n$$\n\nafter';await page.evaluate(t=>window.quickMdTest.adopt(t),text);await page.getByRole('button',{name:'编辑',exact:true}).click();await page.locator('.cm-content').waitFor();await page.evaluate(()=>{const v=window.quickMdTest.editor().view;v.dispatch({selection:{anchor:0,head:v.state.doc.length}})});await page.keyboard.type('replacement');await page.keyboard.press('Control+z');expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(text)});
test('ordinary character click does not jump to paragraph start',async({page})=>{await page.getByRole('button',{name:'编辑',exact:true}).click();await page.locator('.live-strong').waitFor();const point=await page.locator('.live-strong').evaluate(el=>{const node=document.createTreeWalker(el,NodeFilter.SHOW_TEXT).nextNode()!;const range=document.createRange();range.setStart(node,2);range.setEnd(node,3);const rect=range.getBoundingClientRect();return{x:rect.x+1,y:rect.y+rect.height/2}});await page.mouse.click(point.x,point.y);await page.keyboard.type('X');const text=await page.evaluate(()=>window.quickMdTest.text());expect(text).toMatch(/\*\*boXld\*\*|\*\*bolXd\*\*/);expect(text.startsWith('# Heading\n\nHello')).toBe(true)});
test('same-mode selection retains DOM and rendering counts',async({page})=>{await page.evaluate(()=>{(window as any).__previewFirst=document.querySelector('#preview')!.firstChild});const before=await page.evaluate(()=>window.quickMdDiagnostics().metrics);for(let i=0;i<20;i++)await page.getByRole('button',{name:'预览',exact:true}).click();expect(await page.evaluate(()=>(window as any).__previewFirst===document.querySelector('#preview')!.firstChild)).toBe(true);expect((await page.evaluate(()=>window.quickMdDiagnostics())).metrics.parseStarted).toBe(before.parseStarted)});
test('runtime growth from live downgrades outside active update',async({page})=>{const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));await page.getByRole('button',{name:'编辑',exact:true}).click();await page.locator('.cm-content').waitFor();await page.evaluate(()=>{const v=window.quickMdTest.editor().view;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:'x'.repeat(2097153)}})});await expect.poll(()=>page.evaluate(()=>window.quickMdDiagnostics().mode)).toBe('source');expect(errors).toEqual([])});
test('dark theme uses dark reading surface without changing document',async({page})=>{await page.emulateMedia({colorScheme:'dark'});await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(28, 33, 30)');expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(basic);await page.getByRole('button',{name:'源码',exact:true}).click();await page.locator('.cm-content').waitFor();const contrast=await page.locator('.cm-line span').filter({hasText:'https://example.com'}).last().evaluate(el=>{const luminance=(rgb:string)=>rgb.match(/\d+/g)!.slice(0,3).map(x=>Number(x)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const fg=luminance(getComputedStyle(el).color),bg=luminance(getComputedStyle(document.documentElement).backgroundColor);return(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)});expect(contrast).toBeGreaterThanOrEqual(4.5);await page.screenshot({path:'docs/evidence/dark-theme.png'})});

test('source mode crossing render limit updates wrapping in both directions',async({page})=>{
 await page.getByRole('button',{name:'源码',exact:true}).click();
 await page.locator('.cm-content').waitFor();
 await expect(page.locator('#preview > *')).toHaveCount(0);
 const wrapping=()=>page.evaluate(()=>window.quickMdTest.editor().view.lineWrapping);
 expect(await wrapping()).toBe(true);
 await page.evaluate(()=>{const v=window.quickMdTest.editor().view;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:'x'.repeat(2097153)}})});
 await expect.poll(wrapping).toBe(false);
 expect((await page.evaluate(()=>window.quickMdDiagnostics())).mode).toBe('source');
 await page.evaluate(()=>{const v=window.quickMdTest.editor().view;v.dispatch({changes:{from:10,to:v.state.doc.length}})});
 await expect.poll(wrapping).toBe(true);
 expect(await page.evaluate(()=>window.quickMdTest.text())).toBe('x'.repeat(10));
});

test('formula and block arrow entry, emoji deletion and boundary undo preserve source',async({page})=>{
 const text='😀before $x+1$ after\n\n$$\ny+2\n$$\n\nend';
 await page.evaluate(t=>window.quickMdTest.adopt(t),text);
 await page.getByRole('button',{name:'编辑',exact:true}).click();await page.locator('.cm-content').waitFor();
 await page.evaluate(()=>window.quickMdTest.editor().view.dispatch({selection:{anchor:8}}));
 await page.keyboard.press('ArrowRight');await page.keyboard.type('q');await page.keyboard.press('Control+z');
 expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(text);
 await page.evaluate(pos=>window.quickMdTest.editor().view.dispatch({selection:{anchor:pos}}),text.indexOf('$$')-1);
 await page.keyboard.press('ArrowRight');await page.keyboard.type('q');await page.keyboard.press('Control+z');
 expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(text);
 await page.evaluate(()=>window.quickMdTest.editor().view.dispatch({selection:{anchor:2}}));
 await page.keyboard.press('Backspace');expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(text.slice(2));
 await page.keyboard.press('Control+z');
 await page.evaluate(()=>window.quickMdTest.editor().view.dispatch({selection:{anchor:0}}));
 await page.keyboard.press('Backspace');expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(text);
 await page.evaluate(()=>{const v=window.quickMdTest.editor().view;v.dispatch({selection:{anchor:v.state.doc.length}})});
 await page.keyboard.press('Delete');expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(text);
});

test('late diagram result cannot fill an identical block in another document',async({page})=>{
 await page.evaluate(()=>{(window as any).__diagramStarted=[];(window as any).__diagramGate=new Promise(resolve=>(window as any).__releaseDiagram=resolve)});
 await page.route('**/node_modules/.vite/deps/mermaid.js*',route=>route.fulfill({contentType:'text/javascript',body:`export default {initialize(){},async render(id,source){window.__diagramStarted.push(source);if(source.includes('OLD'))await window.__diagramGate;return {svg:'<svg xmlns="http://www.w3.org/2000/svg"><text>'+source+'</text></svg>'}}}`}));
 await page.evaluate(t=>window.quickMdTest.adopt(t),'```mermaid\nOLD\n```');
 await expect.poll(()=>page.evaluate(()=>(window as any).__diagramStarted.length)).toBe(1);
 await page.evaluate(t=>window.quickMdTest.adopt(t),'```mermaid\nNEW\n```');
 await page.evaluate(()=>(window as any).__releaseDiagram());
 await expect(page.locator('.diagram svg text')).toHaveText('NEW');
 await expect(page.locator('#preview')).not.toContainText('OLD');
 expect((await page.evaluate(()=>window.quickMdDiagnostics())).renderers.queued).toBe(0);
});

test('formula limits and isolated macros fail locally without poisoning later formulas',async({page})=>{
 const text='$\\\\def\\\\loop{\\\\loop}\\\\loop$\n\n$\\\\gdef\\\\secret{42}\\\\secret$\n\n$\\\\secret$\n\n$x+1$\n\nSurvives'.replaceAll('\\\\','\\');
 await page.evaluate(t=>window.quickMdTest.adopt(t),text);
 await expect(page.locator('.render-error')).toHaveCount(2);
 await expect(page.locator('.katex')).toHaveCount(2);
 await expect(page.locator('#preview')).toContainText('Survives');
 expect(await page.evaluate(()=>window.quickMdTest.text())).toBe(text);
});
