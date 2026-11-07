// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import DOMPurify from 'dompurify';
const htmlPolicy={USE_PROFILES:{html:true},FORBID_TAGS:['img','iframe','object','embed','input','form','style','video','audio','source','track','picture','map','area','button','select','textarea']};
// Documents may contain raw HTML, so everything is allow-listed: an attribute or style that is not named here is dropped.
// No id or name: a document must not be able to shadow the app's own elements. No src-like attribute: images go through hydrate.
const allowedAttributes=new Set(['href','title','alt','style','class','align','valign','colspan','rowspan','span','scope','width','height','start','reversed','type','dir','lang','open','role','bgcolor','color','face','size','border','cellpadding','cellspacing','datetime','cite','data-from','data-math','data-display','data-diagram','data-image','data-src','data-alt','data-title','data-width']);
const allowedClass=/^(?:math|diagram|image-slot|language-[\w-]+)$/;
// Layout and decoration only. position, transform and z-index stay out so content cannot escape its block, and every property that can load a resource stays out.
const allowedStyle=/^(?:color|opacity|background-(?:color|image|position(?:-[xy])?|size|repeat|clip|origin)|font(?:-[a-z]+)*|line-height|letter-spacing|word-spacing|text-(?:align|decoration(?:-[a-z]+)*|transform|indent|shadow|overflow|wrap)|white-space|word-break|overflow-wrap|vertical-align|(?:margin|padding)(?:-[a-z-]+)?|border(?:-(?:top|right|bottom|left|block|inline|start|end))*(?:-(?:width|style|color))?|border-(?:[a-z]+-[a-z]+-)?radius|border-collapse|border-spacing|box-shadow|box-sizing|outline(?:-[a-z]+)?|(?:min-|max-)?(?:width|height)|display|flex(?:-[a-z]+)?|gap|row-gap|column-gap|grid-(?:template|auto|column|row)(?:-[a-z]+)?|align-[a-z]+|justify-[a-z]+|overflow(?:-[xy])?|list-style-type|table-layout)$/;
const loadsResource=/\b(?:url|image|image-set|cross-fade|element|paint|src)\s*\(/i;
const gradient=/^(?:none|(?:repeating-)?(?:linear|radial|conic)-gradient\()/;
function cleanStyle(node:HTMLElement){
 const style=node.style,kept:string[]=[];
 for(let i=0;i<style.length;i++){const name=style[i],value=style.getPropertyValue(name);if(allowedStyle.test(name)&&!loadsResource.test(value)&&(name!=='background-image'||gradient.test(value)))kept.push(`${name}:${value}`)}
 // A card with its own background but no text colour would inherit the theme's and can become unreadable.
 const back=/^rgba?\((\d+)\D+(\d+)\D+(\d+)(?:\D+([\d.]+))?/.exec(style.backgroundColor);
 if(back&&!style.color&&Number(back[4]??1)>.5){const light=(.299*+back[1]+.587*+back[2]+.114*+back[3])/255;if(light>.6)kept.push('color:#24221e');else if(light<.3)kept.push('color:#e7e1d6')}
 if(kept.length)node.setAttribute('style',kept.join(';'));else node.removeAttribute('style');
}
// A separate instance: these hooks must not reach Mermaid's SVG, which relies on ids.
const purifier=DOMPurify(window);
purifier.addHook('uponSanitizeAttribute',(_node,data)=>{
 const name=data.attrName;
 if(!allowedAttributes.has(name)&&!name.startsWith('aria-'))data.keepAttr=false;
 else if(name==='class'){data.attrValue=data.attrValue.split(/\s+/).filter(c=>allowedClass.test(c)).join(' ');if(!data.attrValue)data.keepAttr=false}
});
purifier.addHook('afterSanitizeAttributes',node=>{if(node.nodeType===1&&node.hasAttribute('style'))cleanStyle(node as HTMLElement)});
export function cleanHtml(html:string):string {return purifier.sanitize(html,htmlPolicy)}
export function cleanFragment(html:string):DocumentFragment {return purifier.sanitize(html,{...htmlPolicy,RETURN_DOM_FRAGMENT:true})}
export function cleanSvg(svg:string):string {
 const clean=DOMPurify.sanitize(svg,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['foreignObject','script','a','image'],FORBID_ATTR:['href','xlink:href']});
 const template=document.createElement('template');template.innerHTML=clean;
 // Keep local marker/clip references, never network URLs or CSS imports.
 for(const node of template.content.querySelectorAll('*')){for(const attr of [...node.attributes]){if([...attr.value.matchAll(/url\s*\(([^)]*)\)/gi)].some(m=>!/^['"]?#[\w-]+['"]?$/.test(m[1].trim())))node.removeAttribute(attr.name)}}
 for(const style of template.content.querySelectorAll('style')){if(/@import|url\s*\(\s*['"]?(?!#)/i.test(style.textContent??''))style.remove()}
 return template.innerHTML;
}
export function diagramAllowed(source:string){return source.length<=50_000&&!/%%\s*\{|^\s*---|\bclick\s/im.test(source)}
