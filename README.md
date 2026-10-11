# Quick MD

<img src="src-tauri/icons/icon.png" width="96" alt="Quick MD icon">

Windows 本地 Markdown 阅读与编辑器。Tauri 2 / WebView2、TypeScript 和 CodeMirror 6；没有账号、同步、遥测或 Node sidecar。

## 功能

- **编辑 / Live**：普通文字可原位编辑，光标或选区进入语法范围时展开 Markdown 标记；公式、表格和图表可整体展开。
- **源码 / Source**：完整 Markdown 源文，保留同一文档的撤销历史。
- **预览 / Preview**：只读、可选择复制；打开默认预览，新建默认编辑。
- 常用 Markdown、四种 LaTeX 定界符、矩阵及多行公式；Mermaid 流程、时序、类、状态和 ER 图。
- 原生打开/保存/另存为、启动参数打开、未保存保护、外部修改检测、UTF-8/BOM 与换行保留。
- 复杂引擎按需加载，解析和图表队列有界；原始 HTML 不执行，图片为占位，外链不导航。

示例：[数学与 Mermaid](examples/math-and-mermaid.md)。

| 快捷键 | 操作 |
|---|---|
| Ctrl+1 / Ctrl+2 / Ctrl+3 | 编辑 / 源码 / 预览 |
| Ctrl+N / Ctrl+O / Ctrl+S | 新建 / 打开 / 保存 |
| Ctrl+Shift+S | 另存为 |

## 构建运行

已验证 Windows 11 x64。需要 Node.js 22、Rust stable、Visual Studio 2022 C++ 构建工具和 Windows SDK，以及 Microsoft Edge WebView2 Runtime。

```powershell
git clone https://github.com/mtdxmtdx/Quick-MD.git
cd Quick-MD
npm ci
npm run tauri -- dev
```

构建供使用的 EXE：

```powershell
npm run tauri -- build --no-bundle
& .\src-tauri\target\release\quick-md.exe .\examples\math-and-mermaid.md
```

产物为 `src-tauri/target/release/quick-md.exe`，依赖系统 WebView2。仓库不提交编译产物；当前没有安装器，不自动修改文件关联。

## 测试与交付

```powershell
npm run test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run test:ui
# 以下命令需要先构建 Windows release
node scripts/native-smoke.mjs
node scripts/native-boundaries.mjs
npm run perf
```

UI 测试使用已安装的 Edge；原生检查启动真实 EXE，只写测试 fixture，仅给测试子进程设置 CDP 环境变量。证据输出到被 Git 忽略的 `docs/evidence/`。`node scripts/fixtures.mjs` 可重新生成语法与性能样本。

源码提交后，可运行 `./scripts/package-release.ps1` 打包当前 HEAD 的源码和对应已构建 EXE；脚本拒绝未提交源码，避免交付包与源文不一致。

项目级 `.npmrc` 使用 `legacy-peer-deps=true`，处理 npm 10 的可选 peer 解析问题，不修改全局配置。

## 边界与验证状态

- 仅接受 `.md/.markdown/.txt`、严格 UTF-8，可带 BOM，上限 20 MiB；内部 LF，保存恢复 BOM 和单一换行格式，混合换行写入前确认。
- 渲染阈值为 2,097,152 UTF-16 单元，跨阈值转源码并关闭自动换行，正文不截断。
- KaTeX 不是完整 LaTeX/TikZ；Mermaid 配置和 click 指令拒绝，文本上限 50,000，边上限 500，不承诺硬 CPU 中止。
- 外部修改预检不是跨进程原子 CAS；不承诺全部 NTFS 元数据保留。
- Win10/ARM64/旧 WebView2、完整 IME/复杂滚动矩阵、冷启动和长期泄漏仍待验证。
- 图片、全文查找、单实例、草稿、文件关联安装器和 DOM 虚拟化尚未实现。

详见 [验证报告](docs/VALIDATION_REPORT.md)、[历史性能样本](docs/PERFORMANCE_REPORT.md) 和 [实现说明](docs/IMPLEMENTATION_STATUS.md)。历史性能结果不自动适用于每次重编译产物。

## 许可

Copyright (C) 2026 mtdxmtdx and contributors.

项目原创代码与随附原创资源采用 **GNU General Public License v3.0 only**（SPDX：`GPL-3.0-only`），不是 GPL v3 或后续版本。你可以依照该许可使用、修改和再分发；本软件不附带任何担保。完整条款见 [LICENSE](LICENSE)。第三方组件保留各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
