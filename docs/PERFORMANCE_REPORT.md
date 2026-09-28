# 历史性能报告：2026-09-28

原始数据：[2026-09-28.json](benchmarks/2026-09-28.json)。采样为真实 Windows release/WebView2，不是开发服务器。

- AMD Ryzen 9 9950X3D、32 逻辑处理器、约 31 GiB RAM，Windows 11 build 26100、WebView2 152.0.4191.62。
- 被测 EXE SHA-256：`6d573d31033bbccef619970075ecc2457b83bea704c2e9a494b3161018656c54`。后来更新图标、许可和重新编译的 EXE 不是此测量构建。
- 100 KiB fixture；1 个预热样本不计入汇总，20 个暖启动样本全部保留，nearest-rank p50/p95。
- 从启动进程到正文提交后双 requestAnimationFrame，是可读帧估计，不是屏幕光学测量；没有冷启动成绩。

| 指标 | 结果 | 目标 |
|---|---:|---:|
| 暖启动 p50 / p95 | 503.90 / 555.70 ms | ≤500 / ≤1000 ms |
| 模式切换 p95，60 次 | 76.10 ms | ≤150 ms |
| 输入事务到下一帧 p95，30 次 | 3.90 ms | 不含 OS/IME/按键传输 |
| 普通文档进程树私有工作集 | 191.82 MiB | ≤180 MiB |
| 当时 EXE | 6.16 MiB | 不含系统 WebView2 |
| 首屏观测 JS gzip | 70,639 B | ≤250 KiB；已含 Worker |

启动 p50 与内存未达目标，没有去掉慢样本。100 次光标移动没有增加 Markdown parseStarted / serialized；20 次模式循环 DOM 数稳定在 4313，不构成长期无泄漏证明。

额外单次观测：长列表/长单行/1 MiB 均可编辑撤销，不截断；1 MiB 预览约 1098 ms，首次源码约 4210 ms。长列表静置约 30.5 秒的相关进程 CPU 增量 5.36 秒，约单核 17.57% / 32 逻辑核整机 0.55%，包含 WebView2，不是只算 Rust PID。

## 重测

```powershell
npm run tauri -- build --no-bundle
npm run perf
node scripts/native-boundaries.mjs
node scripts/report-performance.mjs
```

新输出在 docs/evidence，汇总为 docs/evidence/performance-summary.md，不覆盖本历史报告。脚本临时启用测试子进程 CDP，按父子 PID 汇总内存；无冷启动或长期泄漏结论。不同硬件、系统状态和构建之间不能直接归因比较。
