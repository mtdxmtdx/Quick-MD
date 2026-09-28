// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {defineConfig} from 'vite';
export default defineConfig({clearScreen:false,server:{port:1420,strictPort:true},optimizeDeps:{include:['@codemirror/state','@codemirror/view','@codemirror/commands','@codemirror/lang-markdown','@codemirror/language','@lezer/markdown','katex','mermaid','markdown-it','@mdit/plugin-tex']},build:{target:'es2022'},worker:{format:'es'}});
