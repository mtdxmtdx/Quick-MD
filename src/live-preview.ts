// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {StateEffect,StateField,type EditorState,type Range} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,type DecorationSet} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {active,imageSlot,overRenderLimit,parseTable,type Complex} from './model';
import {TableWidget} from './table-widget';
import {cleanHtml} from './security';
import {hydrate} from './hydrate';
export const setComplex=StateEffect.define<Complex[]>();
export const setComposing=StateEffect.define<boolean>();
class RenderWidget extends WidgetType {
 private cleanup?:()=>void;
 constructor(readonly item:Complex){super()}
 // Compare content only, so an edit earlier in the document does not rebuild (and reload) this widget.
 eq(other:RenderWidget){return this.item.html===other.item.html}
 toDOM(view:EditorView){const node=document.createElement(this.item.block?'div':'span');node.className='live-widget';node.innerHTML=cleanHtml(this.item.html);node.tabIndex=0;node.setAttribute('aria-label','显示 Markdown 源码');
 const reveal=()=>{const pos=view.posAtDOM(node);view.dispatch({selection:{anchor:pos},scrollIntoView:true});view.focus()};
 node.addEventListener('click',reveal);node.addEventListener('keydown',event=>{const e=event as KeyboardEvent;if(e.key==='Enter'||e.key===' '){e.preventDefault();reveal()}});
 this.cleanup=hydrate(node,()=>node.isConnected,()=>view.requestMeasure());return node}
 destroy(){this.cleanup?.()}
 ignoreEvent(){return false}
}
// A long embedded image would otherwise fill the editor with base64 when the cursor enters it.
class UrlStub extends WidgetType {
 constructor(readonly label:string){super()}
 eq(other:UrlStub){return this.label===other.label}
 toDOM(){const node=document.createElement('span');node.className='live-url-stub';node.textContent=this.label;return node}
}
interface LiveState {items:Complex[];decorations:DecorationSet;composing:boolean}
function build(state:EditorState,items:Complex[]):DecorationSet {
 if(overRenderLimit(state.doc))return Decoration.none;
 const ranges=state.selection.ranges;const decorations:Range<Decoration>[]=[];const replaced:Complex[]=[];
 // Top-level tables are edit-mode widgets built from the syntax tree, so they survive typing inside a cell.
 const tree=syntaxTree(state),tables:Array<{from:number;to:number}>=[];for(let n=tree.topNode.firstChild;n;n=n.nextSibling)if(n.name==='Table')tables.push({from:n.from,to:n.to});
 for(const item of items){if(item.kind==='table'||item.kind!=='html'&&tables.some(t=>item.from<t.to&&item.to>t.from))continue;if(item.to<=state.doc.length&&item.to>item.from&&!active(item,ranges)){replaced.push(item);decorations.push(Decoration.replace({widget:new RenderWidget(item),block:item.block}).range(item.from,item.to))}}
 const covered=(from:number,to:number)=>replaced.some(c=>from<c.to&&to>c.from);
 const hide=(from:number,to:number)=>{if(to>from&&!covered(from,to))decorations.push(Decoration.replace({}).range(from,to))};
 // Skip only nodes inside a widget; ancestors such as Document overlap every widget.
 const inside=(from:number,to:number)=>replaced.some(c=>from>=c.from&&to<=c.to);
 tree.iterate({enter(node){const {from,to,name}=node;if(inside(from,to))return false;
  const selected=active({from,to},ranges);
  if(name==='Table'&&node.node.parent?.name==='Document'&&!selected){const source=state.doc.sliceString(from,to),table=parseTable(source);if(table){decorations.push(Decoration.replace({widget:new TableWidget(table,source),block:true}).range(from,to));return false}}
  if(name==='Image'){const url=node.node.getChild('URL'),marks=node.node.getChildren('LinkMark');
   if(url&&marks.length>1){const src=state.doc.sliceString(url.from,url.to);
    if(!selected){const title=node.node.getChild('LinkTitle');decorations.push(Decoration.replace({widget:new RenderWidget({from,to,kind:'image',block:false,html:imageSlot(src,state.doc.sliceString(marks[0].to,marks[1].from),title?state.doc.sliceString(title.from+1,title.to-1):'')})}).range(from,to));return false}
    if(src.length>256)decorations.push(Decoration.replace({widget:new UrlStub(`${src.slice(0,24)}… (${Math.ceil(src.length/1024)} KB)`)}).range(url.from,url.to))}}
  if(/^ATXHeading[1-6]$/.test(name)){const line=state.doc.lineAt(from);decorations.push(Decoration.line({class:`live-heading h${name.at(-1)}`}).range(line.from));if(!selected){const match=/^#{1,6}\s+/.exec(state.doc.sliceString(from,to));if(match)hide(from,from+match[0].length)}}
  const styles:Record<string,string>={StrongEmphasis:'live-strong',Emphasis:'live-em',Strikethrough:'live-strike',InlineCode:'live-code',Link:'live-link'};
  if(styles[name]){decorations.push(Decoration.mark({class:styles[name]}).range(from,to));if(!selected){for(let child=node.node.firstChild;child;child=child.nextSibling){if(['EmphasisMark','StrikethroughMark','CodeMark','LinkMark','URL','LinkTitle'].includes(child.name))hide(child.from,child.to)}}}
  if(name==='ListMark'||name==='QuoteMark'){const line=state.doc.lineAt(from);if(!active({from:line.from,to:line.to},ranges)){decorations.push(Decoration.mark({class:name==='ListMark'?'live-list-mark':'live-quote-mark'}).range(from,to))}}
  if(name==='FencedCode'){decorations.push(Decoration.mark({class:'live-fence'}).range(from,to));if(!selected){for(let child=node.node.firstChild;child;child=child.nextSibling)if(child.name==='CodeMark'||child.name==='CodeInfo')hide(child.from,child.to)}}
 }});
 return Decoration.set(decorations,true);
}
export const liveField=StateField.define<LiveState>({
 create(state){return {items:[],decorations:build(state,[]),composing:false}},
 update(value,tr){let items=value.items,composing=value.composing;for(const e of tr.effects){if(e.is(setComposing))composing=e.value;if(e.is(setComplex)&&!composing)items=e.value}
  // Conservatively invalidate all context-sensitive complex ranges on edits.
  if(tr.docChanged)items=[];
  if(composing)return {items,composing,decorations:value.decorations.map(tr.changes)};
  if(tr.docChanged||tr.selection||tr.effects.length||value.composing!==composing)return {items,composing,decorations:build(tr.state,items)};
  return value;
 },provide:field=>EditorView.decorations.from(field,v=>v.decorations)
});
