# 验证报告

## 2026-09-28 本地验证基线

环境：Windows 11 x64 build 26100，WebView2 152.0.4191.62，Node 22.22.3 / npm 10.9.8，Rust 1.92.0，VS 2022。

| 命令/检查 | 实际结果与范围 |
|---|---|
| npm ci | 安装锁定依赖成功；本地安装报告 0 vulnerabilities，不承诺将来状态 |
| npm run test | 31 项通过；快照、dirty、语法/偏移、完整身份、解析背压 |
| npm run test:ui | 22 项全量通过；隐藏预览 DOM 改动后另有 4 项针对回归通过 |
| npm run build | 完整 TypeScript 类型检查、Vite 构建成功 |
| cargo test --locked --manifest-path src-tauri/Cargo.toml | 10 项通过；含 Windows 独占锁、只读、写入故障注入 |
| npm run tauri -- dev | 真实启动 WebView2 并正常关闭 |
| npm run tauri -- build --no-bundle | Windows release 构建成功 |
| node scripts/native-smoke.mjs | 原生保存、BOM/CRLF、暂停保存后继续输入、冲突拒绝、取消与退出通过 |
| node scripts/native-boundaries.mjs | 长列表、长单行、1 MiB 文档编辑/撤销、原生新建焦点通过 |

实际 Windows 拼音测试完成候选选择、退格、中文标点、粗体/链接内输入、关闭取消后继续输入和组合时 Ctrl+3 不抢输入的子集；不是用合成 composition 或 Unicode 直输代替系统输入法。

自动异步故障检查包括：旧解析身份拒绝；真实 IPC fetch 边界暂停保存，磁盘为旧快照而新输入保持 dirty；图表 A 延迟到文档 B 后完成，拒绝回填 B。

图标更新后的 EXE 已重新构建、提取图标核对并通过原生 smoke。性能测量来自更早构建，见单独报告，不把后来 EXE 的体积/哈希与旧性能样本混用。

## 开源整理验证

本次整理后实际执行：npm run test 31 项通过；cargo test --locked --manifest-path src-tauri/Cargo.toml 10 项通过；npm run test:ui 22 项通过；npm run build 类型检查与前端构建成功。公开清单 76 个文件的许可、机器路径、常见凭据模式和文档相对链接检查无问题；性能摘要脚本运行成功，仍明确引用历史构建。

源码、文档、示例与 GPL-3.0-only 元数据已对齐；既有验证历史保留在本地忽略目录。没有新增项目规则或跨项目记忆，也未修改全局配置。构建缓存、二进制、会话提示与临时回滚材料不进入 Git。GitHub 上传不等于 CI、重新测量性能或全部人工验收通过。

## 未验证与已知限制

- 完整 IME 交错：公式内部候选位置、候选打开时点击模式、延迟图表与真实组合输入同时返回。
- 复杂高度变化下全部滚动/拖选、不同 DPI/触屏、Win10/ARM64/旧 WebView2。
- 极端模块加载失败、缓存压力矩阵、合法超长路径、全部 NTFS 元数据保持。
- 重启后的冷启动、长期泄漏/CPU 趋势、极端文件输入延迟分位。
- 历史样本暖启动 p50 503.90 ms、普通文档私有工作集 191.82 MiB，略超 500 ms / 180 MiB 目标；1 MiB 首次源码约 4.21 秒。
- 指纹预检与替换之间存在跨进程竞争窗口；图表 Promise 失效不终止已开始的同步布局 CPU 工作。

本地原始日志和历史副本保留在被忽略的 docs/evidence 与 docs/local-history；公开性能样本去除了机器绝对路径。其他人可使用仓库脚本产生自己的证据，不能将本机历史结果外推到所有环境。
