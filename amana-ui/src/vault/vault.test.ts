// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { DecryptError, KDF_ITERATIONS, deriveKey, open, randomBytes, seal } from './crypto.js';
import { MemoryStorage } from './memory-storage.js';
import { LockedError, VAULT_KEY, Vault, WrongPassphraseError, isPrivateKey } from './vault.js';

// Fast derivation for tests; the real vault uses KDF_ITERATIONS.
const FAST = 1_000;
const PASS = 'correct horse battery staple';
const SECRET = 'f00dfacecafebabe'.repeat(4);
const STATE_KEY = 'amana:private-state:abc';

describe('seal and open', () => {
  it('match the SDK provider’s key derivation strength', () => {
    expect(KDF_ITERATIONS).toBe(600_000);
  });

  it('round-trip, and never produce the same ciphertext twice', async () => {
    const key = await deriveKey(PASS, randomBytes(32), FAST);
    const a = await seal(key, SECRET, 'label');
    const b = await seal(key, SECRET, 'label');
    expect(a).not.toBe(b);
    expect(await open(key, a, 'label')).toBe(SECRET);
  });

  it('refuse a value moved to another label, or changed at all', async () => {
    const key = await deriveKey(PASS, randomBytes(32), FAST);
    const sealed = await seal(key, SECRET, 'amana:private-state:one');
    await expect(open(key, sealed, 'amana:private-state:two')).rejects.toBeInstanceOf(DecryptError);
    const bytes = atob(sealed);
    const flipped = btoa(bytes.slice(0, 20) + String.fromCharCode(bytes.charCodeAt(20) ^ 1) + bytes.slice(21));
    await expect(open(key, flipped, 'amana:private-state:one')).rejects.toBeInstanceOf(DecryptError);
  });

  it('refuse a key derived from another passphrase', async () => {
    const salt = randomBytes(32);
    const sealed = await seal(await deriveKey(PASS, salt, FAST), SECRET, 'x');
    await expect(open(await deriveKey('another passphrase entirely', salt, FAST), sealed, 'x')).rejects.toBeInstanceOf(
      DecryptError,
    );
  });
});

describe('Vault', () => {
  it('starts new, and stores nothing private in clear once a passphrase is set', async () => {
    const storage = new MemoryStorage();
    const vault = new Vault(storage, FAST);
    expect(vault.state).toBe('new');
    await vault.create(PASS);
    expect(vault.state).toBe('unlocked');
    await vault.set(STATE_KEY, JSON.stringify({ secretKey: SECRET }));
    expect(storage.dump()).not.toContain(SECRET);
    expect(await vault.get(STATE_KEY)).toBe(JSON.stringify({ secretKey: SECRET }));
  });

  it('opens again only with the same passphrase', async () => {
    const storage = new MemoryStorage();
    await new Vault(storage, FAST).create(PASS);
    const writer = new Vault(storage, FAST);
    await writer.unlock(PASS);
    await writer.set(STATE_KEY, SECRET);

    const reader = new Vault(storage, FAST);
    expect(reader.state).toBe('locked');
    await expect(reader.unlock('not the passphrase at all')).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(reader.state).toBe('locked');
    await reader.unlock(PASS);
    expect(await reader.get(STATE_KEY)).toBe(SECRET);
  });

  it('refuses reads and writes while locked', async () => {
    const vault = new Vault(new MemoryStorage(), FAST);
    await vault.create(PASS);
    vault.lock();
    await expect(vault.get(STATE_KEY)).rejects.toBeInstanceOf(LockedError);
    await expect(vault.set(STATE_KEY, 'x')).rejects.toBeInstanceOf(LockedError);
  });

  it('rejects a short passphrase and a second one', async () => {
    const vault = new Vault(new MemoryStorage(), FAST);
    await expect(vault.create('short')).rejects.toThrow(/at least 12 characters/);
    await vault.create(PASS);
    await expect(vault.create(PASS)).rejects.toThrow(/already has/);
  });

  it('detects a value swapped between registries', async () => {
    const storage = new MemoryStorage();
    const vault = new Vault(storage, FAST);
    await vault.create(PASS);
    await vault.set('amana:private-state:one', 'one');
    await vault.set('amana:private-state:two', 'two');
    storage.setItem('amana:private-state:two', storage.getItem('amana:private-state:one')!);
    await expect(vault.get('amana:private-state:two')).rejects.toBeInstanceOf(DecryptError);
  });

  it('erases the passphrase and every private value, and nothing else', async () => {
    const storage = new MemoryStorage();
    const vault = new Vault(storage, FAST);
    await vault.create(PASS);
    await vault.set(STATE_KEY, SECRET);
    await vault.set('amana:signing-keys', SECRET);
    storage.setItem('amana:last-contract-address', 'public');
    vault.erase();
    expect(vault.state).toBe('new');
    expect(storage.getItem(VAULT_KEY)).toBeNull();
    expect(storage.getItem(STATE_KEY)).toBeNull();
    expect(storage.getItem('amana:signing-keys')).toBeNull();
    expect(storage.getItem('amana:last-contract-address')).toBe('public');
  });

  it('seals private data an earlier version stored in clear, on first passphrase', async () => {
    const storage = new MemoryStorage();
    storage.setItem(STATE_KEY, JSON.stringify({ secretKey: SECRET }));
    storage.setItem('amana:signing-keys', JSON.stringify({ k: SECRET }));
    storage.setItem('amana:last-contract-address', 'public, left alone');
    const vault = new Vault(storage, FAST);
    expect(vault.plaintextKeys().sort()).toEqual(['amana:private-state:abc', 'amana:signing-keys']);
    expect(await vault.create(PASS)).toEqual({ migrated: 2 });
    expect(vault.plaintextKeys()).toEqual([]);
    expect(storage.dump()).not.toContain(SECRET);
    expect(storage.getItem('amana:last-contract-address')).toBe('public, left alone');
    expect(await vault.get(STATE_KEY)).toBe(JSON.stringify({ secretKey: SECRET }));
  });

  it('seals data written in clear while locked, at the next unlock', async () => {
    const storage = new MemoryStorage();
    const vault = new Vault(storage, FAST);
    await vault.create(PASS);
    vault.lock();
    storage.setItem('amana:private-state:late', SECRET);
    const again = new Vault(storage, FAST);
    expect(await again.unlock(PASS)).toEqual({ migrated: 1 });
    expect(storage.dump()).not.toContain(SECRET);
    expect(await again.get('amana:private-state:late')).toBe(SECRET);
  });

  it('seals a value in clear as soon as it is read', async () => {
    const storage = new MemoryStorage();
    const vault = new Vault(storage, FAST);
    await vault.create(PASS);
    storage.setItem(STATE_KEY, SECRET);
    expect(await vault.get(STATE_KEY)).toBe(SECRET);
    expect(storage.getItem(STATE_KEY)?.startsWith('amana-enc:v1:')).toBe(true);
  });

  it('knows which keys hold private data', () => {
    expect(isPrivateKey('amana:private-state:0200ab')).toBe(true);
    expect(isPrivateKey('amana:signing-keys')).toBe(true);
    expect(isPrivateKey('amana:last-contract-address')).toBe(false);
    expect(isPrivateKey('amana:check-draft:v2:0200ab')).toBe(false);
  });
});
