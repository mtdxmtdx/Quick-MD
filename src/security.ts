// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import DOMPurify from 'dompurify';
const htmlPolicy={USE_PROFILES:{html:true},FORBID_TAGS:['img','iframe','object','embed','input','form','style'],FORBID_ATTR:['src','srcset']};
export function cleanHtml(html:string):string {return DOMPurify.sanitize(html,htmlPolicy)}
export function cleanFragment(html:string):DocumentFragment {return DOMPurify.sanitize(html,{...htmlPolicy,RETURN_DOM_FRAGMENT:true})}
export function cleanSvg(svg:string):string {
 const clean=DOMPurify.sanitize(svg,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['foreignObject','script','a','image'],FORBID_ATTR:['href','xlink:href']});
 const template=document.createElement('template');template.innerHTML=clean;
 // Keep local marker/clip references, never network URLs or CSS imports.
 for(const node of template.content.querySelectorAll('*')){for(const attr of [...node.attributes]){if([...attr.value.matchAll(/url\s*\(([^)]*)\)/gi)].some(m=>!/^['"]?#[\w-]+['"]?$/.test(m[1].trim())))node.removeAttribute(attr.name)}}
 for(const style of template.content.querySelectorAll('style')){if(/@import|url\s*\(\s*['"]?(?!#)/i.test(style.textContent??''))style.remove()}
 return template.innerHTML;
}
export function diagramAllowed(source:string){return source.length<=50_000&&!/%%\s*\{|^\s*---|\bclick\s/im.test(source)}
