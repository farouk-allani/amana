// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';

// Unit tests for the interface's logic run in Node, without the Vite plugins
// the browser build needs for the Midnight runtime.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
