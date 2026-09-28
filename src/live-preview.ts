// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {StateEffect,StateField,type EditorState,type Range} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,type DecorationSet} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {active,type Complex,RENDER_LIMIT} from './model';
import {cleanHtml} from './security';
import {hydrate} from './hydrate';
export const setComplex=StateEffect.define<Complex[]>();
export const setComposing=StateEffect.define<boolean>();
class RenderWidget extends WidgetType {
 private cleanup?:()=>void;
 constructor(readonly item:Complex){super()}
 eq(other:RenderWidget){return this.item.from===other.item.from&&this.item.to===other.item.to&&this.item.html===other.item.html}
 toDOM(view:EditorView){const node=document.createElement(this.item.block?'div':'span');node.className='live-widget';node.innerHTML=cleanHtml(this.item.html);node.tabIndex=0;node.setAttribute('aria-label','显示 Markdown 源码');
 const reveal=()=>{const pos=view.posAtDOM(node);view.dispatch({selection:{anchor:pos},scrollIntoView:true});view.focus()};
 node.addEventListener('click',reveal);node.addEventListener('keydown',event=>{const e=event as KeyboardEvent;if(e.key==='Enter'||e.key===' '){e.preventDefault();reveal()}});
 this.cleanup=hydrate(node,()=>node.isConnected,()=>view.requestMeasure());return node}
 destroy(){this.cleanup?.()}
 ignoreEvent(){return false}
}
interface LiveState {items:Complex[];decorations:DecorationSet;composing:boolean}
function build(state:EditorState,items:Complex[]):DecorationSet {
 if(state.doc.length>RENDER_LIMIT)return Decoration.none;
 const ranges=state.selection.ranges;const decorations:Range<Decoration>[]=[];const replaced:Complex[]=[];
 for(const item of items){if(item.to<=state.doc.length&&item.to>item.from&&!active(item,ranges)){replaced.push(item);decorations.push(Decoration.replace({widget:new RenderWidget(item),block:item.block}).range(item.from,item.to))}}
 const covered=(from:number,to:number)=>replaced.some(c=>from<c.to&&to>c.from);
 const hide=(from:number,to:number)=>{if(to>from&&!covered(from,to))decorations.push(Decoration.replace({}).range(from,to))};
 syntaxTree(state).iterate({enter(node){const {from,to,name}=node;if(covered(from,to))return false;
  const selected=active({from,to},ranges);
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
