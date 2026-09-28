// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';
const dir=path.resolve('tests/fixtures');await mkdir(dir,{recursive:true});
const basic='# 标题 Heading\n\n普通中文 English，**粗体** *斜体* ~~删除线~~ `code`。你好，世界 👩‍💻 😀 é。\n\n> 引用一\n> 引用二\n\n1. 第一项\n2. 第二项\n   - 子项\n\n[链接](https://example.com) [引用][ref]\n\n| 列一 | 列二 |\n| --- | --- |\n| 中文 | `code` |\n\n```text\n$not_math$\n\n# not heading\n```\n\n---\n\n[ref]: https://example.com/reference\n';
const math=String.raw`# 数学测试

行内 $E=mc^2$，以及 \(a^2+b^2=c^2\)。

$$
A=\begin{bmatrix}
1 & 2 \\
3 & 4
\end{bmatrix}
$$

\[
\int_0^1 x^2\,dx=\frac{1}{3}
\]

$$
\begin{aligned}
f(x)&=x^2+2x+1\\
&=(x+1)^2
\end{aligned}
$$

错误 $\definitelyUnsupportedCommand{x}$。未闭合 $a+b
`;
const diagrams=['flowchart LR\n A[打开文件] --> B{选择模式}\n B --> C[编辑]\n B --> D[源码]\n B --> E[预览]','sequenceDiagram\n participant U as 用户\n participant E as 编辑器\n U->>E: 输入内容\n E-->>U: 更新显示','classDiagram\n class Document {\n +string id\n +save()\n }','stateDiagram-v2\n [*] --> Preview\n Preview --> Live\n Live --> Source\n Source --> Preview','erDiagram\n DOCUMENT ||--o{ BLOCK : contains'];
const fence=s=>'```mermaid\n'+s+'\n```\n';
const fixtures={'empty.md':'','basic.md':basic,'unicode.md':'汉字 日本語 👩‍💻 😀 é\n','math.md':math,'diagrams.md':diagrams.map(fence).join('\n'),'invalid-diagram.md':fence(diagrams[0])+fence('invalidDiagram')+'\n正常段落\n','references.md':'[使用在前][ref]\n\n```txt\na\n\nb\n```\n\n[ref]: https://example.com','utf8-bom-crlf.md':'\ufeff# BOM\r\n你好😀\r\n','mixed-eol.md':'a\r\nb\nc\rd','security.md':'<script>window.pwned=1</script>\n\n[x](javascript:alert(1))\n\n'+fence('%%{init: {securityLevel: "loose"}}%%\nflowchart LR\nA-->B'),'many-formulas.md':Array.from({length:200},(_,i)=>`$x_${i}^2$\n\n`).join(''),'many-diagrams.md':Array.from({length:20},(_,i)=>'# 图 '+i+'\n\n'+fence(diagrams[0])+'\n段落\n\n'.repeat(20)).join(''),'huge-list.md':Array.from({length:10000},(_,i)=>'- item '+i+'\n').join(''),'long-line.md':'中文😀'.repeat(30000)};
for(const size of [10240,102400,1048576]){const line='ordinary Markdown text for performance fixture.\n\n';fixtures[`plain-${size}.md`]=('# Performance\n\n'+line.repeat(Math.ceil(size/line.length))).slice(0,size)}
const manifest=[];for(const [name,text] of Object.entries(fixtures)){const data=Buffer.from(text);await writeFile(path.join(dir,name),data);manifest.push({name,bytes:data.length,utf16:text.length,lines:text.split('\n').length,sha256:createHash('sha256').update(data).digest('hex')})}
await writeFile(path.join(dir,'invalid-utf8.md'),Buffer.from([255,254,97]));await writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));console.log(`Generated ${manifest.length+1} fixtures in ${dir}`);
