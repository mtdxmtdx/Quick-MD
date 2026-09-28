# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 mtdxmtdx and contributors.
param([int]$RootPid)
$ErrorActionPreference='Stop'
$all=Get-CimInstance Win32_Process
$ids=[System.Collections.Generic.HashSet[int]]::new();[void]$ids.Add($RootPid)
do {$added=$false;foreach($p in $all){if($ids.Contains([int]$p.ParentProcessId)-and $ids.Add([int]$p.ProcessId)){$added=$true}}}while($added)
@($ids | ForEach-Object { $p=Get-Process -Id $_ -ErrorAction SilentlyContinue; if($p){[pscustomobject]@{pid=$p.Id;name=$p.ProcessName;cpuSeconds=$p.CPU;workingSet=$p.WorkingSet64;privateBytes=$p.PrivateMemorySize64}}}) | ConvertTo-Json -Compress
