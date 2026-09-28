// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["startup_document", "prepare_open", "commit_document", "prepare_new", "save_document"])
    )).expect("Tauri build");
}
