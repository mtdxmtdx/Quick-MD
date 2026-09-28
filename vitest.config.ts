// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/*.test.ts'],environment:'node'}});
