// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { persistentPrivateStateProvider } from './persistent-private-state-provider.js';
import { MemoryStorage } from './vault/memory-storage.js';
import { LockedError, Vault } from './vault/vault.js';

const FAST = 1_000;
const PASS = 'correct horse battery staple';
const ADDRESS = '0200' + 'ab'.repeat(32);
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => 200 - i);
const SECRET_HEX = Array.from(SECRET, (b) => b.toString(16).padStart(2, '0')).join('');

type State = { secretKey: Uint8Array; wallet: { onTime: bigint }[] };

const setup = async () => {
  const storage = new MemoryStorage();
  const vault = new Vault(storage, FAST);
  await vault.create(PASS);
  const provider = persistentPrivateStateProvider<'amanaPrivateStateV2', State>(vault);
  provider.setContractAddress(ADDRESS as never);
  return { storage, vault, provider };
};

describe('persistentPrivateStateProvider on the vault', () => {
  it('round-trips private state, bytes and bigints included', async () => {
    const { provider } = await setup();
    await provider.set('amanaPrivateStateV2', { secretKey: SECRET, wallet: [{ onTime: 8n }] });
    const back = await provider.get('amanaPrivateStateV2');
    expect(back?.secretKey).toEqual(SECRET);
    expect(back?.wallet[0]?.onTime).toBe(8n);
  });

  it('stores neither the identity key nor the records in clear', async () => {
    const { storage, provider } = await setup();
    await provider.set('amanaPrivateStateV2', { secretKey: SECRET, wallet: [{ onTime: 12345n }] });
    await provider.setSigningKey(ADDRESS as never, 'signing-' + SECRET_HEX);
    const everything = storage.dump();
    expect(everything).not.toContain(SECRET_HEX);
    expect(everything).not.toContain('12345');
    expect(everything).toContain(`amana:private-state:${ADDRESS}=amana-enc:v1:`);
    expect(everything).toContain('amana:signing-keys=amana-enc:v1:');
  });

  it('reads back after the browser is reopened and unlocked', async () => {
    const { storage, provider } = await setup();
    await provider.set('amanaPrivateStateV2', { secretKey: SECRET, wallet: [] });
    const reopened = new Vault(storage, FAST);
    await reopened.unlock(PASS);
    const again = persistentPrivateStateProvider<'amanaPrivateStateV2', State>(reopened);
    again.setContractAddress(ADDRESS as never);
    expect((await again.get('amanaPrivateStateV2'))?.secretKey).toEqual(SECRET);
  });

  it('gives nothing away while locked', async () => {
    const { vault, provider } = await setup();
    await provider.set('amanaPrivateStateV2', { secretKey: SECRET, wallet: [] });
    vault.lock();
    await expect(provider.get('amanaPrivateStateV2')).rejects.toBeInstanceOf(LockedError);
  });

  it('refuses to export private state in clear, or under a short password', async () => {
    const { provider } = await setup();
    await provider.set('amanaPrivateStateV2', { secretKey: SECRET, wallet: [] });
    await expect(provider.exportPrivateStates()).rejects.toThrow(/plaintext export is disabled/);
    await expect(provider.exportPrivateStates({ password: 'too short' })).rejects.toThrow(/at least 16/);
    await expect(provider.exportSigningKeys()).rejects.toThrow(/plaintext export is disabled/);
  });

  it('exports encrypted in the SDK’s shape, and imports only with the password', async () => {
    const { provider } = await setup();
    await provider.set('amanaPrivateStateV2', { secretKey: SECRET, wallet: [{ onTime: 8n }] });
    const password = 'a sixteen+ character password';
    const exported = await provider.exportPrivateStates({ password });
    expect(exported.format).toBe('midnight-private-state-export');
    expect(exported.salt).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(exported)).not.toContain(SECRET_HEX);

    const { provider: other } = await setup();
    await expect(other.importPrivateStates(exported, { password: 'the wrong sixteen-char password' })).rejects.toThrow(
      /does not open/,
    );
    expect(await other.importPrivateStates(exported, { password })).toEqual({ imported: 1, skipped: 0, overwritten: 0 });
    expect((await other.get('amanaPrivateStateV2'))?.secretKey).toEqual(SECRET);
  });

  it('keeps signing keys per contract and clears them', async () => {
    const { provider } = await setup();
    await provider.setSigningKey(ADDRESS as never, 'key-a');
    expect(await provider.getSigningKey(ADDRESS as never)).toBe('key-a');
    await provider.clearSigningKeys();
    expect(await provider.getSigningKey(ADDRESS as never)).toBeNull();
  });
});
