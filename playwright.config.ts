// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/ui',timeout:30000,use:{baseURL:'http://127.0.0.1:1420',headless:true,channel:'msedge',viewport:{width:1100,height:800},trace:'retain-on-failure'},webServer:{command:'npm run dev -- --mode test',url:'http://127.0.0.1:1420',reuseExistingServer:false},reporter:[['list'],['json',{outputFile:'docs/evidence/ui-results.json'}]]});
