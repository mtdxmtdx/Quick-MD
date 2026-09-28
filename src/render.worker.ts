// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {parseMarkdown} from './markdown';
self.onmessage=(e:MessageEvent)=>{const {identity,text}=e.data;try{self.postMessage({identity,result:parseMarkdown(text)})}catch(error){self.postMessage({identity,error:String(error)})}};
