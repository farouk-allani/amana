// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Browser shims the Midnight SDK's Node-oriented dependencies expect.
 * Imported for side effects before anything else.
 */

import { Buffer } from 'buffer';

// Several transitive dependencies branch on `process.env.NODE_ENV`. The shim
// is deliberately partial — NODE_ENV is the only field any of them read.
const g = globalThis as unknown as {
  process?: { env: Record<string, string | undefined> };
  Buffer?: typeof Buffer;
};

g.process ??= { env: { NODE_ENV: import.meta.env.MODE } };
g.Buffer ??= Buffer;
