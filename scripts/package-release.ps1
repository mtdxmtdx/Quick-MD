# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 mtdxmtdx and contributors.
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
try {
    $status=git status --porcelain
    if($LASTEXITCODE -ne 0){throw 'A Git checkout is required'}
    if($status){throw 'Commit source changes before packaging'}
    $commit=git rev-parse HEAD
    if($LASTEXITCODE -ne 0){throw 'A committed HEAD is required'}
    npm run tauri -- build --no-bundle
    if($LASTEXITCODE -ne 0){throw 'Release build failed'}
    $out=Join-Path $root 'release'
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    $zip=Join-Path $out 'quick-md-source.zip'
    git archive --format=zip --output=$zip HEAD
    if($LASTEXITCODE -ne 0){throw 'Source archive failed'}
    $exe=Join-Path $out 'quick-md.exe'
    Copy-Item -LiteralPath (Join-Path $root 'src-tauri\target\release\quick-md.exe') -Destination $exe -Force
    Copy-Item -LiteralPath (Join-Path $root 'LICENSE'),(Join-Path $root 'THIRD_PARTY_NOTICES.md') -Destination $out -Force
    $artifacts=@($exe,$zip) | ForEach-Object {[pscustomobject]@{file=(Split-Path -Leaf $_);bytes=(Get-Item -LiteralPath $_).Length;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}}
    [pscustomobject]@{created=(Get-Date).ToString('o');commit=$commit;license='GPL-3.0-only';performance='Not measured by packaging; historical benchmark identity is separate';artifacts=$artifacts} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out 'artifacts.json') -Encoding UTF8
    Get-Content -LiteralPath (Join-Path $out 'artifacts.json') -Raw -Encoding UTF8
} finally {Pop-Location}
