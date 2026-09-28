// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {EditorState,Compartment,Text} from '@codemirror/state';
import {EditorView,keymap,drawSelection,highlightActiveLine} from '@codemirror/view';
import {history,historyKeymap,defaultKeymap,indentWithTab} from '@codemirror/commands';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting,defaultHighlightStyle,HighlightStyle} from '@codemirror/language';
import {GFM} from '@lezer/markdown';
import {liveField,setComplex,setComposing} from './live-preview';
import {metrics,RENDER_LIMIT,type Mode,type Complex} from './model';
const display=new Compartment(),wrap=new Compartment();
// Use the same semantic tags in both themes without dark-on-dark default colors.
const syntaxColors:Record<string,string>={'#404740':'--syntax-meta','#708':'--syntax-keyword','#219':'--syntax-value','#164':'--syntax-value','#a11':'--syntax-string','#e40':'--syntax-string','#00f':'--syntax-link','#30a':'--syntax-keyword','#085':'--syntax-value','#167':'--syntax-value','#256':'--syntax-value','#00c':'--syntax-link','#940':'--syntax-comment','#f00':'--syntax-error'};
const highlightStyle=HighlightStyle.define(defaultHighlightStyle.specs.map(spec=>({...spec,...(spec.color?{color:`var(${syntaxColors[spec.color]??'--syntax-meta'})`}:{})})));
export class Editor {
 view:EditorView;mode:Mode='source';composing=false;
 constructor(parent:HTMLElement,text:string,onChange:(doc:Text)=>void,onCompositionEnd:()=>void){
  metrics.editorCreated++;
  this.view=new EditorView({parent,state:EditorState.create({doc:text,extensions:[history(),drawSelection(),highlightActiveLine(),EditorState.allowMultipleSelections.of(true),keymap.of([...defaultKeymap,...historyKeymap,indentWithTab]),markdown({base:markdownLanguage,extensions:[GFM]}),syntaxHighlighting(highlightStyle),display.of([]),wrap.of(text.length<=RENDER_LIMIT?EditorView.lineWrapping:[]),EditorState.transactionExtender.of(tr=>{
   const before=tr.startState.doc.length<=RENDER_LIMIT,after=tr.newDoc.length<=RENDER_LIMIT;
   // Reconfigure in the original transaction: no nested update or mode change.
   return before!==after?{effects:wrap.reconfigure(after?EditorView.lineWrapping:[])}:null;
  }),EditorView.updateListener.of(u=>{if(u.docChanged)onChange(u.state.doc)}),EditorView.domEventHandlers({compositionstart:()=>{this.composing=true;this.view.dispatch({effects:setComposing.of(true)})},compositionend:()=>{setTimeout(()=>{this.composing=false;this.view.dispatch({effects:setComposing.of(false)});onCompositionEnd()},0)}})]})});
 }
 modeTo(mode:Mode){if(mode===this.mode)return;this.mode=mode;this.view.dispatch({effects:display.reconfigure(mode==='live'?[liveField]:[])})}
 complex(items:Complex[]){if(this.mode==='live'&&!this.composing)this.view.dispatch({effects:setComplex.of(items)})}
 anchor(){const block=this.view.lineBlockAtHeight(this.view.scrollDOM.scrollTop);return {pos:block.from,offset:block.top-this.view.scrollDOM.scrollTop}}
 restore(pos:number,offset=0){this.view.dispatch({effects:EditorView.scrollIntoView(Math.min(pos,this.view.state.doc.length),{y:'start',yMargin:Math.max(0,offset)})})}
 destroy(){this.view.destroy()}
}
