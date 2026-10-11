// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/** This browser's vault, over localStorage. One per page. */

import { Vault } from './vault.js';

let vault: Vault | null = null;

/**
 * The vault, or null when the browser refuses storage (some private modes),
 * in which case Amana cannot keep a key between visits at all.
 */
export const browserVault = (): Vault | null => {
  if (vault) return vault;
  try {
    const storage = window.localStorage;
    storage.getItem('amana:vault');
    vault = new Vault(storage);
    return vault;
  } catch {
    return null;
  }
};
