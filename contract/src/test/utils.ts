// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';

/** Random bytes, for nonces and check identifiers. */
export const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

/**
 * A deterministic 32-byte key for a named test participant.
 *
 * Deterministic on purpose: a test that fails should fail the same way the
 * next time it runs. Randomness belongs in nonces, not identities.
 */
export const deriveKey = (name: string): Uint8Array =>
  new Uint8Array(createHash('sha256').update(`amana:test:${name}`).digest());

/** A stable check identifier derived from a label. */
export const checkId = (label: string): Uint8Array =>
  new Uint8Array(createHash('sha256').update(`amana:test:check:${label}`).digest());

export const toHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
