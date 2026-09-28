# 实现说明

## 模块

| 模块 | 职责 |
|---|---|
| `src/document-session.ts` | 唯一源文、不可变保存快照、revision、撤销判脏 |
| `src/editor.ts` / `src/live-preview.ts` | 共享 CodeMirror、语法装饰、复杂 widget、composition 保护 |
| `src/markdown.ts` / `src/render-client.ts` | Markdown/数学解析、完整身份校验、1 执行 + 1 最新等待任务 |
| `src/hydrate.ts` / `src/security.ts` | 按视口加载 KaTeX/Mermaid、串行图表与 8 待处理、DOM 清洗 |
| `src/main.ts` | 三模式、文件保护、候选提交、焦点与 surface 生命周期 |
| `src-tauri/src/document.rs` | UTF-8/BOM/换行、指纹、临时文件同步与替换 |
| `src-tauri/src/main.rs` | 原生对话框、受限命令、短状态锁、导航保护 |

普通文字保留真实文本节点；复杂范围才替换为 widget。源码是唯一数据，不从 HTML 反向构造 Markdown。编辑/源码复用一个编辑器和撤销历史。

解析是有界的整篇 Worker 解析，不是增量解析。身份包含 docId、revision、requestId、surfaceEpoch、themeEpoch；废弃结果不回填。主题变化和离开模式会失效 surface。离开预览释放隐藏 DOM，返回时从解析缓存重建；没有 DOM 虚拟化。

保存使用快照；写入期间继续输入不会被旧保存结果标成已保存。原生路径只来自选择器和启动参数。Rust I/O 放在 blocking 任务中，不持 Session 锁等待用户选择。

## 公开仓库结构

README 是使用入口；本说明记录架构；验证报告记录证据边界；性能报告明确测量构建身份。示例在 examples，自动测试在 tests，构建与测量脚本在 scripts。

会话提示、重复计划、一次性故障副本和本机日志仅在原工作区保留并被 Git 忽略，不作为公开工程的现役文档。没有创建额外 Agent 规则或写入全局/生成记忆。
