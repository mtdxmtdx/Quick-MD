// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {EditorView,WidgetType} from '@codemirror/view';
import {undo,redo} from '@codemirror/commands';
import {renderInline} from './markdown';
import {cleanHtml} from './security';
import {hydrate} from './hydrate';
import type {Table,TableCell} from './model';

// Edit-mode table: a click on cell text edits that cell's Markdown in place while the table stays rendered;
// a click on the table's lines (cell edges or the margin around it) reveals the source as before.
interface Live {table:Table;source:string;view:EditorView;editing?:{row:number;col:number};cleanups:Map<HTMLElement,()=>void>}
const live=new WeakMap<HTMLElement,Live>();
const EDGE=5;

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
// Leave the table for the editor, putting the cursor just outside it so the table stays rendered.
function leave(root:HTMLElement,dir:1|-1){
 const st=live.get(root)!;endEdit(root);const base=st.view.posAtDOM(root),end=base+st.source.length,doc=st.view.state.doc.length;
 const pos=dir>0?(end<doc?end+1:end):(base>0?base-1:base);
 st.view.dispatch({selection:{anchor:pos},scrollIntoView:true});st.view.focus();
}
function reveal(root:HTMLElement){const st=live.get(root)!;endEdit(root);st.view.dispatch({selection:{anchor:st.view.posAtDOM(root)},scrollIntoView:true});st.view.focus()}
function move(root:HTMLElement,el:HTMLElement,rows:number,cols:number){
 const st=live.get(root)!,cells=st.table.rows.flatMap((row,r)=>row.map((c,col)=>c?{r,col}:null).filter(Boolean)) as Array<{r:number;col:number}>;
 const r=Number(el.dataset.row),c=Number(el.dataset.col);let target:{r:number;col:number}|undefined;
 if(cols){const i=cells.findIndex(x=>x.r===r&&x.col===c)+cols;target=cells[i]}
 else for(let next=r+rows;next>=0&&next<st.table.rows.length;next+=rows)if(st.table.rows[next][c]){target={r:next,col:c};break}
 const dest=target&&cellElement(root,target.r,target.col);
 if(dest)startEdit(root,dest,cellOf(st,dest)!.text.length);else leave(root,(rows||cols)>0?1:-1);
}
function edgeOrMissing(root:HTMLElement,e:MouseEvent){
 const el=(e.target as Element).closest<HTMLElement>('th,td');if(!el||!root.contains(el)||!cellOf(live.get(root)!,el))return null;
 const r=el.getBoundingClientRect();
 return e.clientX-r.left<EDGE||r.right-e.clientX<EDGE||e.clientY-r.top<EDGE||r.bottom-e.clientY<EDGE?null:el;
}
// Where in the cell text the click landed; only meaningful when the rendered text is the raw text.
function clickOffset(span:HTMLElement,raw:string,e:MouseEvent){
 const point=document.caretPositionFromPoint?.(e.clientX,e.clientY);
 if(!point||span.textContent!==raw||!span.contains(point.offsetNode))return raw.length;
 const range=document.createRange();range.setStart(span,0);range.setEnd(point.offsetNode,point.offset);return range.toString().length;
}
export class TableWidget extends WidgetType {
 constructor(readonly table:Table,readonly source:string){super()}
 eq(other:TableWidget){return other.source===this.source}
 toDOM(view:EditorView){
  const root=document.createElement('div');root.className='live-widget live-table';root.tabIndex=0;root.setAttribute('aria-label','表格：点单元格文字可编辑，点边线显示源码');
  const st:Live={table:this.table,source:this.source,view,cleanups:new Map()};live.set(root,st);
  const table=document.createElement('table');
  this.table.rows.forEach((row,r)=>{
   const tr=document.createElement('tr');
   row.forEach((cell,c)=>{
    const el=document.createElement(r===0?'th':'td');el.dataset.row=String(r);el.dataset.col=String(c);if(this.table.align[c])el.style.textAlign=this.table.align[c];
    const span=document.createElement('span');span.className='cell-text';el.append(span);tr.append(el);
    if(cell){render(st,span,cell.text);this.listen(root,el,span)}else el.classList.add('missing');
   });
   if(r===0){const head=document.createElement('thead');head.append(tr);table.append(head)}else{(table.tBodies[0]??table.appendChild(document.createElement('tbody'))).append(tr)}
  });
  root.append(table);
  root.addEventListener('mousemove',e=>root.classList.toggle('near-edge',!edgeOrMissing(root,e)));
  root.addEventListener('mouseleave',()=>root.classList.remove('near-edge'));
  root.addEventListener('mousedown',e=>{if(e.button!==0)return;const el=edgeOrMissing(root,e);
   if(!el){e.preventDefault();reveal(root);return}
   if(el.classList.contains('editing'))return;
   e.preventDefault();const span=textOf(el);startEdit(root,el,clickOffset(span,cellOf(live.get(root)!,el)!.text,e));
  });
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
  span.addEventListener('keydown',e=>{if(e.isComposing||!el.classList.contains('editing'))return;const st=live.get(root)!;
   if(e.key==='Tab'){e.preventDefault();move(root,el,0,e.shiftKey?-1:1)}
   else if(e.key==='Enter'){e.preventDefault();move(root,el,e.shiftKey?-1:1,0)}
   else if(e.key==='ArrowUp'||e.key==='ArrowDown'){if(!e.shiftKey){e.preventDefault();move(root,el,e.key==='ArrowUp'?-1:1,0)}}
   else if(e.key==='Escape'){e.preventDefault();leave(root,1)}
   else if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key.toLowerCase()==='z'||e.key.toLowerCase()==='y')){e.preventDefault();(e.key.toLowerCase()==='y'||e.shiftKey?redo:undo)(st.view)}
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
 destroy(dom:HTMLElement){const st=live.get(dom);if(st)for(const cleanup of st.cleanups.values())cleanup()}
 ignoreEvent(){return true}
 get estimatedHeight(){return this.table.rows.length*36}
}
