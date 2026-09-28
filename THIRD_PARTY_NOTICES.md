# Third-party notices

Quick MD original source is GPL-3.0-only. Third-party packages and the system WebView2 runtime retain their own licenses. The repository uses lockfiles rather than vendoring their implementation code; preserve upstream notices when distributing dependencies or compiled packages.

| Component | Upstream license |
|---|---|
| Tauri / tauri-build / Tauri JavaScript API | MIT OR Apache-2.0 |
| CodeMirror 6 / Lezer | MIT |
| markdown-it / @mdit/plugin-tex | MIT |
| KaTeX | MIT; font notices remain with the package |
| Mermaid | MIT; transitive dependencies retain their own licenses |
| DOMPurify | Apache-2.0 OR MPL-2.0; Apache-2.0 option used here |
| serde / sha2 / tempfile / uuid | MIT OR Apache-2.0 |
| rfd | MIT |

Exact versions and transitive dependencies are pinned in `package-lock.json` and `src-tauri/Cargo.lock`. Installed license files and upstream crate metadata are authoritative for individual components. Vite, TypeScript, Vitest and Playwright are development tools, not bundled application runtime components.

Microsoft WebView2 is separately installed and is not distributed in this repository. The application icon source is `src-tauri/icons/source.png`, included with this project's supplied resources.
