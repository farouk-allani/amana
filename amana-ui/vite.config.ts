// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// The Midnight runtime is WASM with top-level await, which needs both plugins
// and an `esnext` target. The zero-knowledge key material is copied out of the
// contract workspace so the browser can fetch it from this app's own origin —
// that is what `FetchZkConfigProvider` reads.
export default defineConfig({
  cacheDir: './.vite',
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('onchain-runtime') ? 'midnight-runtime' : undefined),
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: ['.js', '.cjs'],
      ignoreDynamicRequires: true,
    },
  },
  plugins: [
    react(),
    wasm(),
    topLevelAwait({
      promiseExportName: '__tla',
      promiseImportName: (i) => `__tla_${i}`,
    }),
    viteStaticCopy({
      targets: [
        { src: '../contract/src/managed/amana/keys', dest: '.' },
        { src: '../contract/src/managed/amana/zkir', dest: '.' },
        { src: '../contract/src/managed/amana/compiler', dest: '.' },
      ],
    }),
  ],
  // Vite 8 optimizes dependencies with Rolldown, which takes its target from
  // `build.target` above — there is no separate esbuild options block.
  optimizeDeps: {
    include: ['@midnight-ntwrk/compact-runtime', 'buffer'],
    exclude: ['@midnight-ntwrk/onchain-runtime-v3'],
  },
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
    mainFields: ['browser', 'module', 'main'],
  },
});
