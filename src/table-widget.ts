// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {EditorView,WidgetType} from '@codemirror/view';
import {undo,redo,isolateHistory} from '@codemirror/commands';
import {renderInline} from './markdown';
import {cleanHtml} from './security';
import {hydrate} from './hydrate';
import {editTable,type Table,type TableCell,type TableEdit} from './model';

// Edit-mode table: a click on cell text edits that cell's Markdown in place while the table stays rendered;
// a click on the table's lines (cell edges or the margin around it) reveals the source as before.
// Rows and columns are added from the + on a hovered line or from the context menu.
interface Live {table:Table;source:string;view:EditorView;editing?:{row:number;col:number};cleanups:Map<HTMLElement,()=>void>}
const live=new WeakMap<HTMLElement,Live>();
const EDGE=5,ADD_ZONE=8,ADD_END=28;
type Caret='start'|'end';

function cellOf(st:Live,el:HTMLElement):TableCell|null{return st.table.rows[Number(el.dataset.row)]?.[Number(el.dataset.col)]??null}
function textOf(el:HTMLElement){return el.querySelector<HTMLElement>('.cell-text')!}
function render(st:Live,span:HTMLElement,text:string){
 st.cleanups.get(span)?.();span.innerHTML=cleanHtml(renderInline(text));
 st.cleanups.set(span,hydrate(span,()=>span.isConnected,()=>st.view.requestMeasure()));
}
function placeCaret(span:HTMLElement,offset:number){
 const range=document.createRange(),text=span.firstChild;
 if(text)range.setStart(text,Math.min(offset,text.textContent?.length??0));else range.setStart(span,0);
 range.collapse(true);const sel=getSelection();sel?.removeAllRanges();sel?.addRange(range);
}
// The caret's offset in the cell text, or null when there is a selection.
function caretOffset(span:HTMLElement){
 const sel=getSelection();if(!sel?.rangeCount||!sel.isCollapsed||!span.contains(sel.anchorNode))return null;
 const range=document.createRange();range.setStart(span,0);range.setEnd(sel.anchorNode!,sel.anchorOffset);return range.toString().length;
}
function startEdit(root:HTMLElement,el:HTMLElement,offset:number){
 const st=live.get(root)!,cell=cellOf(st,el);if(!cell)return;endEdit(root);
 const span=textOf(el);st.cleanups.get(span)?.();st.cleanups.delete(span);
 st.editing={row:Number(el.dataset.row),col:Number(el.dataset.col)};el.classList.add('editing');
 span.contentEditable='plaintext-only';span.textContent=cell.text;span.focus();placeCaret(span,offset);
}
function endEdit(root:HTMLElement){
 const st=live.get(root);if(!st?.editing)return;const el=cellElement(root,st.editing.row,st.editing.col);st.editing=undefined;if(!el)return;
 const span=textOf(el);span.removeAttribute('contenteditable');el.classList.remove('editing');render(st,span,cellOf(st,el)?.text??'');
}
function cellElement(root:HTMLElement,row:number,col:number){return root.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)}
function edit(root:HTMLElement,el:HTMLElement,caret:Caret){startEdit(root,el,caret==='start'?0:cellOf(live.get(root)!,el)!.text.length)}
// Leave the table for the editor, putting the cursor just outside it so the table stays rendered.
function leave(root:HTMLElement,dir:1|-1){
 const st=live.get(root)!;endEdit(root);const base=st.view.posAtDOM(root),end=base+st.source.length,doc=st.view.state.doc.length;
 const pos=dir>0?(end<doc?end+1:end):(base>0?base-1:base);
 st.view.dispatch({selection:{anchor:pos},scrollIntoView:true});st.view.focus();
}
function reveal(root:HTMLElement){const st=live.get(root)!;endEdit(root);st.view.dispatch({selection:{anchor:st.view.posAtDOM(root)},scrollIntoView:true});st.view.focus()}
// After a change of shape the widget is rebuilt; find the new one (the table nearest to where the old one was) and edit a cell in it.
function focusCell(view:EditorView,base:number,row:number,col:number,caret:Caret='end'){
 let best:HTMLElement|null=null,distance=Infinity;
 for(const el of view.contentDOM.querySelectorAll<HTMLElement>('.live-table')){if(!live.has(el))continue;const d=Math.abs(view.posAtDOM(el)-base);if(d<distance){best=el;distance=d}}
 if(!best)return;const rows=live.get(best)!.table.rows,r=Math.min(row,rows.length-1),c=Math.min(col,rows[0].length-1);
 const el=cellElement(best,r,c);if(el&&cellOf(live.get(best)!,el))edit(best,el,caret);
}
// Apply a structural edit as one undo step, changing only the part of the source that differs.
function restructure(root:HTMLElement,change:TableEdit,focus?:{row:number;col:number}){
 const st=live.get(root)!,next=editTable(st.source,change);if(next===null)return;
 const view=st.view,base=view.posAtDOM(root),old=st.source;endEdit(root);
 let a=0;while(a<old.length&&a<next.length&&old[a]===next[a])a++;
 let b=0;while(b<old.length-a&&b<next.length-a&&old[old.length-1-b]===next[next.length-1-b])b++;
 view.dispatch({changes:{from:base+a,to:base+old.length-b,insert:next.slice(a,next.length-b)},userEvent:'input',annotations:isolateHistory.of('full')});
 if(focus)focusCell(view,base,focus.row,focus.col);else view.focus();
}
function position(el:HTMLElement){return {row:Number(el.dataset.row),col:Number(el.dataset.col)}}
function move(root:HTMLElement,el:HTMLElement,rows:number,cols:number,caret:Caret='end',grow=false){
 const st=live.get(root)!,cells=st.table.rows.flatMap((row,r)=>row.map((c,col)=>c?{r,col}:null).filter(Boolean)) as Array<{r:number;col:number}>;
 const {row:r,col:c}=position(el);let target:{r:number;col:number}|undefined;
 if(cols){const i=cells.findIndex(x=>x.r===r&&x.col===c)+cols;target=cells[i]}
 else for(let next=r+rows;next>=0&&next<st.table.rows.length;next+=rows)if(st.table.rows[next][c]){target={r:next,col:c};break}
 const dest=target&&cellElement(root,target.r,target.col);
 if(dest)edit(root,dest,caret);
 else if(grow)restructure(root,{kind:'insertRow',at:st.table.rows.length},{row:st.table.rows.length,col:0});
 else leave(root,(rows||cols)>0?1:-1);
}
type Hit={kind:'edge'}|{kind:'cell'|'missing';el:HTMLElement};
function hit(root:HTMLElement,e:MouseEvent):Hit{
 const el=(e.target as Element).closest<HTMLElement>('th,td');if(!el||!root.contains(el))return {kind:'edge'};
 const r=el.getBoundingClientRect();
 if(e.clientX-r.left<EDGE||r.right-e.clientX<EDGE||e.clientY-r.top<EDGE||r.bottom-e.clientY<EDGE)return {kind:'edge'};
 return {kind:cellOf(live.get(root)!,el)?'cell':'missing',el};
}
// Where in the cell text the click landed; only meaningful when the rendered text is the raw text.
function clickOffset(span:HTMLElement,raw:string,e:MouseEvent){
 const point=document.caretPositionFromPoint?.(e.clientX,e.clientY);
 if(!point||span.textContent!==raw||!span.contains(point.offsetNode))return raw.length;
 const range=document.createRange();range.setStart(span,0);range.setEnd(point.offsetNode,point.offset);return range.toString().length;
}

// The + at the outer end of a line: the left end of a row line adds a row there, the top end of a
// column line (in the header row) adds a column. Ends only, so a click on the rest of a line still reveals the source.
interface AddTarget {change:TableEdit;focus:{row:number;col:number}}
const addTargets=new WeakMap<HTMLElement,AddTarget>();
function placeAdd(root:HTMLElement,add:HTMLElement,e:MouseEvent){
 const el=(e.target as Element).closest<HTMLElement>('th,td'),table=root.querySelector('table');
 if(!el||!table||!root.contains(el)){add.hidden=true;return}
 const r=el.getBoundingClientRect(),t=table.getBoundingClientRect(),{row,col}=position(el),x=e.clientX,y=e.clientY;
 const options:Array<{d:number;x:number;y:number;target:AddTarget;label:string}>=[];
 if(x-t.left<ADD_END){
  options.push({d:r.bottom-y,x:t.left,y:r.bottom,target:{change:{kind:'insertRow',at:row+1},focus:{row:row+1,col}},label:'在此插入行'});
  // The line above the header is not a place for a row.
  if(row>0)options.push({d:y-r.top,x:t.left,y:r.top,target:{change:{kind:'insertRow',at:row},focus:{row,col}},label:'在此插入行'});
 }
 if(row===0)options.push(
  {d:x-r.left,x:r.left,y:t.top,target:{change:{kind:'insertColumn',at:col},focus:{row,col}},label:'在此插入列'},
  {d:r.right-x,x:r.right,y:t.top,target:{change:{kind:'insertColumn',at:col+1},focus:{row,col:col+1}},label:'在此插入列'});
 const best=options.filter(o=>o.d<ADD_ZONE).sort((a,b)=>a.d-b.d)[0];
 if(!best){add.hidden=true;return}
 const box=root.getBoundingClientRect(),half=9;
 add.style.left=`${Math.max(half,Math.min(root.scrollWidth-half,best.x-box.left+root.scrollLeft))}px`;
 add.style.top=`${Math.max(half,Math.min(root.scrollHeight-half,best.y-box.top+root.scrollTop))}px`;
 add.title=add.ariaLabel=best.label;addTargets.set(add,best.target);add.hidden=false;
}

// One context menu at a time, closed by any outside press, Escape, scrolling or the window losing focus.
let menu:{root:HTMLElement;close:()=>void}|null=null;
function closeMenu(){menu?.close()}
function openMenu(root:HTMLElement,cell:HTMLElement,x:number,y:number){
 closeMenu();const st=live.get(root)!,{row,col}=position(cell),width=st.table.rows[0].length;
 const items:Array<[string,string,boolean,()=>void]|null>=[
  ['在上方插入行','',row>0,()=>restructure(root,{kind:'insertRow',at:row},{row,col})],
  ['在下方插入行','Ctrl+Enter',true,()=>restructure(root,{kind:'insertRow',at:row+1},{row:row+1,col})],
  ['在左侧插入列','',true,()=>restructure(root,{kind:'insertColumn',at:col},{row,col})],
  ['在右侧插入列','',true,()=>restructure(root,{kind:'insertColumn',at:col+1},{row,col:col+1})],
  null,
  ['删除行','',row>0,()=>restructure(root,{kind:'deleteRow',row})],
  ['删除列','',width>1,()=>restructure(root,{kind:'deleteColumn',col})],
  null,
  ['显示源码','',true,()=>reveal(root)],
 ];
 const el=document.createElement('div');el.className='menu table-menu';el.setAttribute('role','menu');
 for(const item of items){
  if(!item){const sep=document.createElement('div');sep.className='menu-sep';sep.setAttribute('role','separator');el.append(sep);continue}
  const [label,key,enabled,run]=item,button=document.createElement('button');button.setAttribute('role','menuitem');button.textContent=label;button.disabled=!enabled;
  if(key){const kbd=document.createElement('kbd');kbd.textContent=key;button.append(kbd)}
  button.addEventListener('click',()=>{closeMenu();run()});el.append(button);
 }
 const outside=(e:Event)=>{if(!el.contains(e.target as Node))closeMenu()};
 const keys=(e:KeyboardEvent)=>{
  if(e.key==='Escape'){e.preventDefault();closeMenu();return}
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;e.preventDefault();
  const buttons=[...el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],i=buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
 };
 const close=()=>{el.remove();menu=null;document.removeEventListener('mousedown',outside,true);document.removeEventListener('keydown',keys,true);removeEventListener('blur',close);removeEventListener('resize',close);document.removeEventListener('scroll',close,true)};
 document.addEventListener('mousedown',outside,true);document.addEventListener('keydown',keys,true);addEventListener('blur',close);addEventListener('resize',close);document.addEventListener('scroll',close,true);
 menu={root,close};document.body.append(el);
 el.style.left=`${Math.max(4,Math.min(x,innerWidth-el.offsetWidth-4))}px`;el.style.top=`${Math.max(4,Math.min(y,innerHeight-el.offsetHeight-4))}px`;
 el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}

export class TableWidget extends WidgetType {
 constructor(readonly table:Table,readonly source:string){super()}
 eq(other:TableWidget){return other.source===this.source}
 toDOM(view:EditorView){
  const root=document.createElement('div');root.className='live-widget live-table';root.tabIndex=0;root.setAttribute('aria-label','表格：点单元格文字可编辑，点边线显示源码，右键可增删行列');
  const st:Live={table:this.table,source:this.source,view,cleanups:new Map()};live.set(root,st);
  const table=document.createElement('table');
  this.table.rows.forEach((row,r)=>{
   const tr=document.createElement('tr');
   row.forEach((cell,c)=>{
    const el=document.createElement(r===0?'th':'td');el.dataset.row=String(r);el.dataset.col=String(c);if(this.table.align[c])el.style.textAlign=this.table.align[c];
    const span=document.createElement('span');span.className='cell-text';el.append(span);tr.append(el);
    if(cell){render(st,span,cell.text);this.listen(root,el,span)}else{el.classList.add('missing');el.title='点击补齐这一格'}
   });
   if(r===0){const head=document.createElement('thead');head.append(tr);table.append(head)}else{(table.tBodies[0]??table.appendChild(document.createElement('tbody'))).append(tr)}
  });
  const add=document.createElement('button');add.className='table-add';add.type='button';add.tabIndex=-1;add.textContent='+';add.hidden=true;
  add.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();const target=addTargets.get(add);add.hidden=true;if(target)restructure(root,target.change,target.focus)});
  root.append(table,add);
  root.addEventListener('mousemove',e=>{if(e.target===add)return;root.classList.toggle('near-edge',hit(root,e).kind==='edge');placeAdd(root,add,e)});
  root.addEventListener('mouseleave',()=>{root.classList.remove('near-edge');add.hidden=true});
  root.addEventListener('mousedown',e=>{if(e.button!==0)return;const h=hit(root,e);
   if(h.kind==='edge'){e.preventDefault();reveal(root);return}
   // A click inside the cell being edited places the caret natively.
   if(h.el.classList.contains('editing'))return;
   e.preventDefault();const {row,col}=position(h.el);
   if(h.kind==='missing'){restructure(root,{kind:'fillRow',row},{row,col});return}
   startEdit(root,h.el,clickOffset(textOf(h.el),cellOf(st,h.el)!.text,e));
  });
  root.addEventListener('contextmenu',e=>{const el=(e.target as Element).closest<HTMLElement>('th,td');if(!el||!root.contains(el))return;e.preventDefault();openMenu(root,el,e.clientX,e.clientY)});
  root.addEventListener('keydown',e=>{if(e.target===root&&(e.key==='Enter'||e.key===' ')){e.preventDefault();reveal(root)}});
  return root;
 }
 private listen(root:HTMLElement,el:HTMLElement,span:HTMLElement){
  span.addEventListener('beforeinput',event=>{const e=event as InputEvent;
   if(e.inputType==='insertParagraph'||e.inputType==='insertLineBreak'){e.preventDefault();return}
   // A pipe or line break would split the row: escape pipes and fold line breaks into spaces.
   if(['insertText','insertFromPaste','insertFromDrop','insertReplacementText'].includes(e.inputType)){
    const data=e.data??e.dataTransfer?.getData('text/plain')??'',clean=data.replace(/\r\n|\r|\n/g,' ').replace(/(?<!\\)\|/g,'\\|');
    if(clean!==data){e.preventDefault();document.execCommand('insertText',false,clean)}
   }
  });
  span.addEventListener('input',()=>{const st=live.get(root)!,cell=cellOf(st,el),text=span.textContent??'';if(!cell||text===cell.text)return;
   const base=st.view.posAtDOM(root);st.view.dispatch({changes:{from:base+cell.from,to:base+cell.to,insert:text},userEvent:'input.type'})});
  span.addEventListener('keydown',e=>{if(e.isComposing||!el.classList.contains('editing'))return;const st=live.get(root)!,{row,col}=position(el),key=e.key.toLowerCase(),mod=(e.ctrlKey||e.metaKey)&&!e.altKey;
   if(e.key==='Tab'){e.preventDefault();move(root,el,0,e.shiftKey?-1:1,'end',!e.shiftKey)}
   else if(e.key==='Enter'&&mod){e.preventDefault();restructure(root,{kind:'insertRow',at:row+1},{row:row+1,col})}
   else if(e.key==='Enter'){e.preventDefault();move(root,el,e.shiftKey?-1:1,0)}
   else if(e.key==='ArrowUp'||e.key==='ArrowDown'){if(!e.shiftKey){e.preventDefault();move(root,el,e.key==='ArrowUp'?-1:1,0)}}
   else if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&!e.shiftKey&&!mod&&!e.altKey){
    // At either end of the text the arrow keys continue into the neighbouring cell.
    const at=caretOffset(span),left=e.key==='ArrowLeft';
    if(at!==null&&(left?at===0:at===(span.textContent??'').length)){e.preventDefault();move(root,el,0,left?-1:1,left?'end':'start')}
   }
   else if(e.key==='Escape'){e.preventDefault();leave(root,1)}
   else if(mod&&(key==='z'||key==='y')){e.preventDefault();const view=st.view,base=view.posAtDOM(root);(key==='y'||e.shiftKey?redo:undo)(view);
    // Undoing a change of shape rebuilds the table; carry on editing the same cell in the new one.
    if(!root.isConnected)focusCell(view,base,row,col)}
  });
  span.addEventListener('blur',()=>{const st=live.get(root);if(st?.editing&&cellElement(root,st.editing.row,st.editing.col)===el)endEdit(root)});
 }
 // Called for every edit typed into a cell: keep the DOM, and with it the focus and caret.
 updateDOM(dom:HTMLElement){
  const st=live.get(dom);if(!st||st.table.rows.length!==this.table.rows.length||st.table.rows.some((row,r)=>row.length!==this.table.rows[r].length||row.some((c,i)=>!c!==!this.table.rows[r][i])))return false;
  const old=st.table;st.table=this.table;st.source=this.source;
  this.table.rows.forEach((row,r)=>row.forEach((cell,c)=>{if(!cell)return;const el=cellElement(dom,r,c);if(!el)return;const span=textOf(el);
   if(st.editing?.row===r&&st.editing.col===c){if(span.textContent!==cell.text){span.textContent=cell.text;placeCaret(span,cell.text.length)}}
   else if(old.rows[r][c]?.text!==cell.text)render(st,span,cell.text);
  }));
  return true;
 }
 destroy(dom:HTMLElement){const st=live.get(dom);if(st)for(const cleanup of st.cleanups.values())cleanup();if(menu?.root===dom)closeMenu()}
 ignoreEvent(){return true}
 get estimatedHeight(){return this.table.rows.length*36}
}
