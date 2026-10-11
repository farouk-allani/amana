// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Passphrase-based encryption for private state, on WebCrypto alone.
 *
 * The parameters match the Midnight SDK's own encrypted private-state
 * provider: PBKDF2 with SHA-256 at 600,000 iterations derives a 256-bit
 * AES-GCM key from the passphrase and a random 32-byte salt. Every value is
 * sealed with a fresh 96-bit IV, and bound to a label (its storage key) as
 * additional authenticated data, so a sealed value moved to another slot
 * fails to open rather than being read as the wrong thing.
 *
 * @module
 */

export const KDF_ITERATIONS = 600_000;
export const SALT_BYTES = 32;
const IV_BYTES = 12;

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('This browser does not provide WebCrypto, which Amana needs to encrypt your data.');
  return s;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

export const randomBytes = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));

export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string): Uint8Array => {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error('Invalid hexadecimal value.');
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
};

export const toBase64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

export const fromBase64 = (text: string): Uint8Array => {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

/** Derive a non-extractable AES-GCM key from a passphrase. */
export const deriveKey = async (
  passphrase: string,
  salt: Uint8Array,
  iterations = KDF_ITERATIONS,
): Promise<CryptoKey> => {
  const base = await subtle().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

/** Seal text under `key`, bound to `label`. Returns base64 of IV ‖ ciphertext ‖ tag. */
export const seal = async (key: CryptoKey, plaintext: string, label: string): Promise<string> => {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(label) as BufferSource },
      key,
      enc.encode(plaintext) as BufferSource,
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toBase64(out);
};

export class DecryptError extends Error {
  constructor(message = 'Could not decrypt: the passphrase is wrong, or the data was changed.') {
    super(message);
    this.name = 'DecryptError';
  }
}

/** Open a value sealed by `seal` with the same key and label. */
export const open = async (key: CryptoKey, sealed: string, label: string): Promise<string> => {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(sealed);
  } catch {
    throw new DecryptError('The encrypted data is damaged.');
  }
  if (bytes.length <= IV_BYTES + 16) throw new DecryptError('The encrypted data is damaged.');
  try {
    const pt = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: bytes.subarray(0, IV_BYTES) as BufferSource,
        additionalData: enc.encode(label) as BufferSource,
      },
      key,
      bytes.subarray(IV_BYTES) as BufferSource,
    );
    return dec.decode(pt);
  } catch {
    throw new DecryptError();
  }
};
