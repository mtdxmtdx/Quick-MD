// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {describe,it,expect} from 'vitest';
import {Text} from '@codemirror/state';
import {DocumentSession,confirmReplacement} from '../src/document-session';
import {active,sameIdentity,lineStarts,metrics,countWords,overRenderLimit,RENDER_LIMIT,imageSource,imageType,imageSlot,type Identity} from '../src/model';
import {parseMarkdown} from '../src/markdown';
import {RenderClient,type WorkerLike} from '../src/render-client';
const id=(n=1):Identity=>({docId:'a',revision:n,requestId:n,surfaceEpoch:1,themeEpoch:1});
describe('document lifecycle',()=>{
 const setup=()=>{const s=new DocumentSession();s.adopt({docId:'a',text:'old\n',name:'a.md',mixed:false,eol:'lf'});s.attach(Text.of(['old','']));return s};
 it('save snapshot does not mark later typing saved',()=>{const s=setup();s.edit(Text.of(['new','']));const save=s.snapshot();s.edit(Text.of(['newer','']));expect(s.savedResult(save,{docId:'a',revision:1,name:'a.md'})).toBe(true);expect(s.dirty).toBe(true);expect(save.text).toBe('new\n');s.dispose()});
 it('undo to saved content clears dirty even when revision differs',()=>{const s=setup();s.edit(Text.of(['new','']));s.edit(Text.of(['old','']));expect(s.revision).toBe(2);expect(s.exactDirty()).toBe(false);s.dispose()});
 it('stale save cannot rename or clean another document',()=>{const s=setup();const save=s.snapshot();s.adopt({docId:'b',text:'B',name:'b.md',mixed:false,eol:'lf'});expect(s.savedResult(save,{docId:'a',revision:0,name:'wrong.md'})).toBe(false);expect(s.name).toBe('b.md');expect(s.text()).toBe('B')});
 it('edit/title path does not serialize text',()=>{const s=setup();const before=metrics.serialized;for(let i=0;i<100;i++)s.edit(Text.of([String(i)]));expect(metrics.serialized).toBe(before);s.dispose()});
 it('preserves BOM-independent trailing text boundaries',()=>{for(const text of ['','x','x\n','你好😀\\\\\n']){const s=new DocumentSession();s.adopt({docId:'a',text,name:'x',mixed:false,eol:'lf'});expect(s.snapshot().text).toBe(text)}});
 it('cancelled save blocks document replacement',async()=>{const s=setup();s.edit(Text.of(['changed']));expect(await confirmReplacement(s,async()=>'save',async()=>false)).toBe(false);expect(s.dirty).toBe(true);s.dispose()});
 it('new input during successful save blocks replacement',async()=>{const s=setup();s.edit(Text.of(['changed']));expect(await confirmReplacement(s,async()=>'save',async()=>{const snap=s.snapshot();s.edit(Text.of(['new input']));s.savedResult(snap,{docId:'a',revision:snap.revision,name:'a.md'});return true})).toBe(false);s.dispose()});
 it('cancel does not invoke save; explicit discard permits replacement',async()=>{const s=setup();s.edit(Text.of(['changed']));expect(await confirmReplacement(s,async()=>'cancel',async()=>{throw Error('save should not run')})).toBe(false);expect(await confirmReplacement(s,async()=>'discard',async()=>false)).toBe(true);s.dispose()});
});
describe('ranges and identities',()=>{
 it('half-open selection and inclusive cursor boundaries',()=>{expect(active({from:2,to:5},[{from:5,to:7}])).toBe(false);expect(active({from:2,to:5},[{from:5,to:5}])).toBe(true)});
 it('all selections participate',()=>expect(active({from:10,to:12},[{from:0,to:0},{from:11,to:11}])).toBe(true));
 it('UTF16 offsets include surrogate pairs',()=>expect(lineStarts('😀\n中\n')).toEqual([0,3,5]));
 it.each(['docId','revision','requestId','surfaceEpoch','themeEpoch'] as const)('rejects changed %s',key=>{const other={...id(),[key]:key==='docId'?'b':2};expect(sameIdentity(id(),other)).toBe(false)});
});
describe('image addresses',()=>{
 it('sorts embedded, network and local images',()=>{expect(imageSource('data:image/png;base64,AAAA').kind).toBe('data');expect(imageSource('data:image/svg+xml,%3Csvg/%3E').kind).toBe('data');expect(imageSource('https://example.com/a.png').kind).toBe('remote');expect(imageSource('HTTP://example.com/a.png').kind).toBe('remote');expect(imageSource('./a b.png')).toEqual({kind:'local',path:'./a b.png'});expect(imageSource('../assets/a.png')).toEqual({kind:'local',path:'../assets/a.png'})});
 it('decodes local paths the Markdown parser encoded',()=>{expect(imageSource('./%E5%9B%BE%201.png?v=2#x')).toEqual({kind:'local',path:'./图 1.png'});expect(imageSource('D:%5Cpics%5Ca.png')).toEqual({kind:'local',path:'D:\\pics\\a.png'});expect(imageSource('file:///D:/pics/a.png')).toEqual({kind:'local',path:'D:/pics/a.png'});expect(imageSource('<a b.png>')).toEqual({kind:'local',path:'a b.png'});expect(imageSource('100%.png')).toEqual({kind:'local',path:'100%.png'})});
 it.each(['\\\\server\\share\\a.png','//server/share/a.png','%5C%5Cserver%5Cshare%5Ca.png','file://server/share/a.png','javascript:alert(1)','ftp://example.com/a.png','data:text/html,x','data:image/x-unknown;base64,AA',''])('rejects %s',src=>expect(imageSource(src).kind).toBe('rejected'));
 it('knows image types by extension',()=>{expect(imageType('a.PNG')).toBe('image/png');expect(imageType('b.svg')).toBe('image/svg+xml');expect(imageType('c.txt')).toBe('')});
 it('slot attributes cannot break out of their quotes',()=>{const html=imageSlot('a"><img src=x onerror=y>','<b>');expect(html).not.toContain('<img');expect(html).not.toContain('<b>')});
});
describe('render limit',()=>{
 const picture=`![图](data:image/png;base64,${'A'.repeat(RENDER_LIMIT)})`;
 it('counts text but not embedded image data',()=>{expect(overRenderLimit('x'.repeat(RENDER_LIMIT))).toBe(false);expect(overRenderLimit('x'.repeat(RENDER_LIMIT+1))).toBe(true);expect(overRenderLimit(picture)).toBe(false);expect(overRenderLimit(Text.of(['intro',picture,'end']))).toBe(false);expect(overRenderLimit(picture+'x'.repeat(RENDER_LIMIT))).toBe(true);expect(overRenderLimit(Text.of([picture,'x'.repeat(RENDER_LIMIT)]))).toBe(true)});
 it('does not exempt text that only looks like an image address',()=>{expect(overRenderLimit('data:image/png;base64,'+'!'.repeat(RENDER_LIMIT))).toBe(true);expect(overRenderLimit('data:text/plain;base64,'+'A'.repeat(RENDER_LIMIT))).toBe(true)});
});
describe('word count',()=>{
 it('counts CJK characters singly and other scripts by word',()=>expect(countWords(['# 你好 world','abc中文 x2, **bold**','','かなカナ 한글'])).toBe(2+1+1+2+1+1+4+2));
 it('ignores HTML tags and their attributes',()=>expect(countWords(['<div style="color: red; font-family: a > b">你好 <b>world</b></div>'])).toBe(3));
 it('ignores embedded image data',()=>expect(countWords(['前 ![图](data:image/png;base64,iVBOR/w0+KGgo=) 后'])).toBe(3));
 it('reads a CodeMirror document line by line',()=>{const s=new DocumentSession();s.attach(Text.of(['one two','三']));expect(countWords(s.lines())).toBe(3)});
});
describe('Markdown and math grammar',()=>{
 it('four delimiter forms become syntax placeholders',()=>{const p=parseMarkdown('$x$ and \\(y\\)\n\n$$\nz^2\n$$\n\n\\[\na+b\n\\]\n');expect(p.complex.filter(c=>c.kind==='math')).toHaveLength(4)});
 it('matrix double backslashes are preserved',()=>{const s='$$\n\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\n$$';const p=parseMarkdown(s);expect(p.complex[0].html).toContain('1&amp;2\\\\3&amp;4');expect(s.slice(p.complex[0].from,p.complex[0].to)).toBe(s)});
 it('code dollars and escaped currency never become math',()=>{const p=parseMarkdown('`$x$` \\$5\n\n```latex\n\\(a\\)\n\n$x$\n```');expect(p.complex).toEqual([])});
 it('currency rule rejects a closing dollar followed by digit',()=>expect(parseMarkdown('价格 $5，另一个价格 $10。').complex).toEqual([]));
 it('unclosed inline math remains text',()=>expect(parseMarkdown('text $oops').complex).toEqual([]));
 it('unclosed block remains literal source',()=>{const p=parseMarkdown('$$\nx+1\n\nordinary');expect(p.complex).toEqual([]);expect(p.blocks[0].html).toContain('ordinary')});
 it('references have full document context',()=>{const p=parseMarkdown('[a][ref]\n\n[ref]: https://example.com');expect(p.blocks[0].html).toContain('href="https://example.com"')});
 it('images become inert slots and count network ones',()=>{const p=parseMarkdown('![本地](./a.png "说明") ![网](https://example.com/a.png)\n\n![嵌入](data:image/png;base64,AAAA) ![也网](http://example.com/b.png)');const html=p.blocks.map(b=>b.html).join('');expect(p.remoteImages).toBe(2);expect(html).not.toContain('<img');expect(html.match(/data-image=""/g)).toHaveLength(4);expect(html).toContain('data-src="./a.png"');expect(html).toContain('data-title="说明"');expect(html).toContain('data-src="data:image/png;base64,AAAA"')});
 it('accepts file addresses and extra embedded types as images only',()=>{expect(parseMarkdown('![a](file:///D:/a.png) ![b](data:image/svg+xml,x)').blocks[0].html.match(/data-image=""/g)).toHaveLength(2);expect(parseMarkdown('![a](javascript:alert(1))').blocks[0].html).not.toContain('data-image')});
 it('raw images become inert slots with their attributes',()=>{const p=parseMarkdown('<img src="https://example.com/a.png?x=1&amp;y=2" alt="图" width=120 onerror=x>\n');const html=p.blocks[0].html;expect(html).not.toContain('<img');expect(html).not.toContain('onerror');expect(html).toContain('data-width="120"');expect(html).toContain('data-alt="图"');expect(p.remoteImages).toBe(1)});
 it('joins an HTML block with its closing tag across blank lines',()=>{const s='<div style="color:red">\n\n**正文**\n\n<table><tr><td>1</td></tr></table>\n\n</div>\n\nafter\n';const p=parseMarkdown(s);expect(p.blocks).toHaveLength(2);expect(p.blocks[0].html).toContain('<strong>正文</strong>');expect(p.blocks[0].html).toContain('</div>');expect(p.blocks[1].html).toContain('after');expect(p.complex).toHaveLength(1);expect(p.complex[0].kind).toBe('html');expect(s.slice(p.complex[0].from,p.complex[0].to)).toBe(s.slice(0,s.indexOf('\n\nafter')))});
 it('closes on an inline tag and leaves unclosed HTML alone',()=>{expect(parseMarkdown('<div>\n\ntext</div>\n\nafter').blocks).toHaveLength(2);expect(parseMarkdown('<div>\n\none\n\ntwo').blocks).toHaveLength(3)});
 it('does not treat fenced tags as HTML and hides comments from widgets',()=>{const p=parseMarkdown('<div>\n\n```html\n</div>\n```\n\n</div>\n\n<!-- note -->\n');expect(p.blocks).toHaveLength(2);expect(p.complex).toHaveLength(1)});
 it('fenced blank lines are a single block',()=>expect(parseMarkdown('```text\na\n\nb\n```').blocks).toHaveLength(1));
 it('tables and Mermaid are complex but prose is not',()=>{const p=parseMarkdown('hello **world**\n\n| A | B |\n|---|---|\n|x|y|\n\n```Mermaid\nflowchart LR\nA-->B\n```');expect(p.complex.map(c=>c.kind)).toEqual(['table','diagram'])});
 it('unicode math spans slice the exact source',()=>{const s='你好😀 $x+1$';const p=parseMarkdown(s);expect(s.slice(p.complex[0].from,p.complex[0].to)).toBe('$x+1$')});
});
describe('one running + one latest parse',()=>{
 class Fake implements WorkerLike{onmessage:((e:MessageEvent)=>void)|null=null;onerror:((e:ErrorEvent)=>void)|null=null;sent:any[]=[];postMessage(d:any){this.sent.push(d)}terminate(){}finish(n:number){this.onmessage?.({data:{identity:id(n),result:{blocks:[],complex:[]}}} as MessageEvent)}}
 it('coalesces 100 requests and settles superseded promises',async()=>{const w=new Fake(),c=new RenderClient(w);const p1=c.request(id(1),'1');const pending=[];for(let n=2;n<=100;n++)pending.push(c.request(id(n),String(n)));expect(w.sent).toHaveLength(1);w.finish(1);expect(w.sent).toHaveLength(2);expect(w.sent[1].text).toBe('100');w.finish(100);expect(await p1).not.toBeNull();const values=await Promise.all(pending);expect(values.filter(v=>v!==null)).toHaveLength(1);c.dispose()});
 it('disposal settles running and waiting',async()=>{const w=new Fake(),c=new RenderClient(w);const a=c.request(id(),'a'),b=c.request(id(2),'b');c.dispose();expect(await a).toBeNull();expect(await b).toBeNull()});
 it('cancelled running result never reaches caller',async()=>{const w=new Fake(),c=new RenderClient(w);const a=c.request(id(),'a');c.cancel();w.finish(1);expect(await a).toBeNull();c.dispose()});
 it('worker reply must match every identity field',async()=>{for(const key of ['docId','revision','surfaceEpoch','themeEpoch'] as const){const w=new Fake(),c=new RenderClient(w);const a=c.request(id(),'a');w.onmessage?.({data:{identity:{...id(),[key]:key==='docId'?'other':99},result:{blocks:[],complex:[]}}} as MessageEvent);expect(await a).toBeNull();c.dispose()}});
});
