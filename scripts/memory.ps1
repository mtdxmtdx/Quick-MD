# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 mtdxmtdx and contributors.
param([int]$RootPid)
$ErrorActionPreference='Stop'
$all=Get-CimInstance Win32_Process
$ids=[System.Collections.Generic.HashSet[int]]::new();[void]$ids.Add($RootPid)
do {$added=$false;foreach($p in $all){if($ids.Contains([int]$p.ParentProcessId)-and $ids.Add([int]$p.ProcessId)){$added=$true}}}while($added)
$counters=Get-CimInstance Win32_PerfFormattedData_PerfProc_Process
@($counters | Where-Object {$ids.Contains([int]$_.IDProcess)} | ForEach-Object {[pscustomobject]@{pid=$_.IDProcess;name=$_.Name;privateWorkingSet=$_.WorkingSetPrivate;privateBytes=$_.PrivateBytes;workingSet=$_.WorkingSet}}) | ConvertTo-Json -Compress
