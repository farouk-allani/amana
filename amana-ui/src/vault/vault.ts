// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The browser's private data, encrypted at rest under a passphrase.
 *
 * Amana keeps two kinds of private value in browser storage: each registry's
 * private state (the identity key and the records a borrower holds) and the
 * contract signing keys. Both are sealed here before they are written. The
 * passphrase never leaves memory, the derived key is non-extractable, and
 * locking forgets it.
 *
 * Storage layout:
 * - `amana:vault` holds the salt, the iteration count and a sealed check
 *   value, which is how a wrong passphrase is told apart from a right one;
 * - every private value is stored as `amana-enc:v1:` followed by its sealed
 *   form, bound to its own storage key.
 *
 * Public values (the last registry address, a verifier's drafted check IDs,
 * an institution's display name) stay as they are: they are on chain or
 * chosen to be shown, and encrypting them would protect nothing.
 *
 * @module
 */

import { DecryptError, KDF_ITERATIONS, SALT_BYTES, deriveKey, fromHex, open, randomBytes, seal, toHex } from './crypto.js';

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export const VAULT_KEY = 'amana:vault';
export const SIGNING_KEYS_KEY = 'amana:signing-keys';
export const PRIVATE_STATE_PREFIX = 'amana:private-state:';
export const MIN_PASSPHRASE = 12;

const SEALED = 'amana-enc:v1:';
const CHECK_LABEL = 'amana:vault-check';
const CHECK_TEXT = 'amana vault v1';

/** Whether a storage key holds private data that must never be stored in clear. */
export const isPrivateKey = (key: string): boolean =>
  key === SIGNING_KEYS_KEY || key.startsWith(PRIVATE_STATE_PREFIX);

type Header = {
  readonly v: 1;
  readonly kdf: 'PBKDF2-SHA256';
  readonly iterations: number;
  readonly salt: string;
  readonly check: string;
};

export class WrongPassphraseError extends Error {
  constructor(message = 'That passphrase does not unlock this data.') {
    super(message);
    this.name = 'WrongPassphraseError';
  }
}

export class LockedError extends Error {
  constructor() {
    super('Your private data is locked. Unlock it with your passphrase first.');
    this.name = 'LockedError';
  }
}

export const checkPassphrase = (passphrase: string): string | null =>
  passphrase.length < MIN_PASSPHRASE ? `Use at least ${MIN_PASSPHRASE} characters. A few unrelated words work well.` : null;

export class Vault {
  private key: CryptoKey | null = null;

  constructor(
    private readonly storage: KeyValueStore,
    /** Lower only in tests; real vaults always use the full count. */
    private readonly iterations = KDF_ITERATIONS,
  ) {}

  // --- state ---------------------------------------------------------------

  get state(): 'new' | 'locked' | 'unlocked' {
    if (this.key) return 'unlocked';
    return this.header() ? 'locked' : 'new';
  }

  private header(): Header | null {
    const raw = this.storage.getItem(VAULT_KEY);
    if (!raw) return null;
    try {
      const h = JSON.parse(raw) as Header;
      return h && h.v === 1 && typeof h.salt === 'string' && typeof h.check === 'string' ? h : null;
    } catch {
      return null;
    }
  }

  private privateKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k && isPrivateKey(k)) keys.push(k);
    }
    return keys;
  }

  // --- lifecycle -----------------------------------------------------------

  /** Set a passphrase for this browser. */
  async create(passphrase: string): Promise<void> {
    if (this.header()) throw new Error('This browser already has an Amana passphrase. Unlock it instead.');
    const problem = checkPassphrase(passphrase);
    if (problem) throw new Error(problem);
    const salt = randomBytes(SALT_BYTES);
    const key = await deriveKey(passphrase, salt, this.iterations);
    const header: Header = {
      v: 1,
      kdf: 'PBKDF2-SHA256',
      iterations: this.iterations,
      salt: toHex(salt),
      check: await seal(key, CHECK_TEXT, CHECK_LABEL),
    };
    this.storage.setItem(VAULT_KEY, JSON.stringify(header));
    this.key = key;
  }

  /** Unlock with the passphrase. */
  async unlock(passphrase: string): Promise<void> {
    this.key = await this.verify(passphrase);
  }

  /** The key this passphrase derives, if it is the right one. */
  private async verify(passphrase: string): Promise<CryptoKey> {
    const header = this.header();
    if (!header) throw new Error('This browser has no Amana passphrase yet.');
    const key = await deriveKey(passphrase, fromHex(header.salt), header.iterations);
    try {
      if ((await open(key, header.check, CHECK_LABEL)) !== CHECK_TEXT) throw new DecryptError();
    } catch {
      throw new WrongPassphraseError();
    }
    return key;
  }

  /** Forget the key. The data stays encrypted in storage. */
  lock(): void {
    this.key = null;
  }

  /** Remove the passphrase and every private value Amana stored in this browser. */
  erase(): void {
    for (const k of this.privateKeys()) this.storage.removeItem(k);
    this.storage.removeItem(VAULT_KEY);
    this.key = null;
  }

  private requireKey(): CryptoKey {
    if (!this.key) throw new LockedError();
    return this.key;
  }

  // --- values --------------------------------------------------------------

  async get(k: string): Promise<string | null> {
    const key = this.requireKey();
    const raw = this.storage.getItem(k);
    if (raw === null) return null;
    // Written in clear before encryption existed: read as-is, sealed on the next write.
    if (!raw.startsWith(SEALED)) return raw;
    return open(key, raw.slice(SEALED.length), k);
  }

  async set(k: string, value: string): Promise<void> {
    const key = this.requireKey();
    this.storage.setItem(k, SEALED + (await seal(key, value, k)));
  }

  async remove(k: string): Promise<void> {
    this.storage.removeItem(k);
  }
}
