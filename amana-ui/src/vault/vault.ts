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
const BACKUP_LABEL = 'amana-backup:v1';

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

type Backup = {
  readonly format: 'amana-backup';
  readonly v: 1;
  readonly created: string;
  readonly kdf: 'PBKDF2-SHA256';
  readonly iterations: number;
  readonly salt: string;
  readonly payload: string;
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

export type ImportResult = { readonly imported: number; readonly skipped: number; readonly overwritten: number };

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

  /** Private values still stored in clear, from before encryption existed. */
  plaintextKeys(): string[] {
    return this.privateKeys().filter((k) => !(this.storage.getItem(k) ?? '').startsWith(SEALED));
  }

  // --- lifecycle -----------------------------------------------------------

  /** Set a passphrase for this browser, then encrypt anything stored in clear. */
  async create(passphrase: string): Promise<{ migrated: number }> {
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
    return { migrated: await this.migrate() };
  }

  /** Unlock with the passphrase, then encrypt anything stored in clear since. */
  async unlock(passphrase: string): Promise<{ migrated: number }> {
    this.key = await this.verify(passphrase);
    return { migrated: await this.migrate() };
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

  /** Seal every private value still stored in clear. Returns how many. */
  async migrate(): Promise<number> {
    const key = this.requireKey();
    const pending = this.plaintextKeys();
    for (const k of pending) {
      const value = this.storage.getItem(k);
      if (value !== null) this.storage.setItem(k, SEALED + (await seal(key, value, k)));
    }
    return pending.length;
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
    if (!raw.startsWith(SEALED)) {
      // Written in clear by something older: seal it now, then return it.
      if (isPrivateKey(k)) this.storage.setItem(k, SEALED + (await seal(key, raw, k)));
      return raw;
    }
    return open(key, raw.slice(SEALED.length), k);
  }

  async set(k: string, value: string): Promise<void> {
    const key = this.requireKey();
    this.storage.setItem(k, SEALED + (await seal(key, value, k)));
  }

  async remove(k: string): Promise<void> {
    this.storage.removeItem(k);
  }

  // --- backup --------------------------------------------------------------

  /**
   * Every private value, re-encrypted under a fresh salt as one file. The
   * passphrase must be this browser's: asking for it again at export time is
   * what makes sure the person can still open the backup when they need it.
   */
  async exportBackup(passphrase: string): Promise<string> {
    this.requireKey();
    await this.verify(passphrase);
    const entries: Record<string, string> = {};
    for (const k of this.privateKeys()) {
      const v = await this.get(k);
      if (v !== null) entries[k] = v;
    }
    const salt = randomBytes(SALT_BYTES);
    const key = await deriveKey(passphrase, salt, this.iterations);
    const backup: Backup = {
      format: 'amana-backup',
      v: 1,
      created: new Date().toISOString(),
      kdf: 'PBKDF2-SHA256',
      iterations: this.iterations,
      salt: toHex(salt),
      payload: await seal(key, JSON.stringify({ entries }), BACKUP_LABEL),
    };
    return JSON.stringify(backup, null, 2);
  }

  /** Restore a backup made by `exportBackup`, encrypting it under this browser's key. */
  async importBackup(text: string, passphrase: string, overwrite = false): Promise<ImportResult> {
    this.requireKey();
    let backup: Backup;
    try {
      backup = JSON.parse(text) as Backup;
    } catch {
      throw new Error('That file is not an Amana backup.');
    }
    if (
      backup?.format !== 'amana-backup' ||
      backup.v !== 1 ||
      typeof backup.payload !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(String(backup.salt)) ||
      // A file chooses its own work factor; bound it, so a crafted one
      // cannot stall the browser in key derivation.
      !Number.isInteger(backup.iterations) ||
      backup.iterations < 1_000 ||
      backup.iterations > 5_000_000
    )
      throw new Error('That file is not an Amana backup.');
    const key = await deriveKey(passphrase, fromHex(backup.salt), backup.iterations);
    let entries: Record<string, unknown>;
    try {
      entries = (JSON.parse(await open(key, backup.payload, BACKUP_LABEL)) as { entries: Record<string, unknown> }).entries;
    } catch {
      throw new WrongPassphraseError('That passphrase does not open this backup.');
    }
    let imported = 0;
    let skipped = 0;
    let overwritten = 0;
    for (const [k, v] of Object.entries(entries ?? {})) {
      if (!isPrivateKey(k) || typeof v !== 'string') continue;
      if (this.storage.getItem(k) !== null) {
        if (!overwrite) {
          skipped++;
          continue;
        }
        overwritten++;
      } else {
        imported++;
      }
      await this.set(k, v);
    }
    return { imported, skipped, overwritten };
  }
}
