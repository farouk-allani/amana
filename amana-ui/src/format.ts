// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/** Small formatting helpers shared by the role screens. */

// The utilities alone: the API's index pulls in the Midnight runtime.
import * as utils from '../../api/src/utils/index.js';

/** "Jan 2025". */
export const month = (period: bigint): string => utils.formatPeriod(period);

/** "Jan 2025 – Dec 2025", or one month when both ends match. */
export const span = (from: bigint, to: bigint): string =>
  from === to ? month(from) : `${month(from)} – ${month(to)}`;

/** "1 record", "3 records". */
export const count = (n: number | bigint, one: string, many = `${one}s`): string =>
  `${n.toString()} ${BigInt(n) === 1n ? one : many}`;

/** "A, B and C". */
export const list = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Read and write small per-registry values; storage may be unavailable. */
export const remember = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Not persisting is acceptable: the value is still on screen.
    }
  },
};
