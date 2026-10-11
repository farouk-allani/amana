// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/** Tests only: an in-memory stand-in for localStorage. */

import type { KeyValueStore } from './vault.js';

export class MemoryStorage implements KeyValueStore {
  private readonly items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(i: number) {
    return [...this.items.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.items.set(k, String(v));
  }
  removeItem(k: string) {
    this.items.delete(k);
  }
  /** Everything stored, joined, for searching for leaked secrets. */
  dump() {
    return [...this.items].map(([k, v]) => `${k}=${v}`).join('\n');
  }
}

