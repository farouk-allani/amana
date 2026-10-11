// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * A private state provider that persists in the browser.
 *
 * The reference examples keep private state in memory, which is fine for a
 * bulletin board and wrong for a credit wallet: a borrower who refreshes the
 * page would lose every attestation they had been issued, and there is no way
 * to get them back — the lender wrote a hash to the chain, not the record.
 *
 * Persistence is therefore not a convenience here, it is the difference
 * between a credential the holder owns and one they merely borrowed for the
 * length of a browser session.
 *
 * Storage is per contract address, so joining a different registry does not
 * mix wallets. Every value goes through a `PrivateStore`; in the browser that
 * is the unlocked vault, which seals it under the person's passphrase before
 * it reaches storage (AUD-02).
 *
 * @module
 */

import type {
  ContractAddress,
  SigningKey,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { deriveKey, fromHex, open, randomBytes, seal, toHex } from './vault/crypto.js';
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from '@midnight-ntwrk/midnight-js-types';

/**
 * `JSON.stringify` cannot represent either of the two types Amana's private
 * state is made of. `Uint8Array` degrades to an object with numeric keys, and
 * `bigint` throws outright. Both are tagged explicitly rather than guessed at
 * on the way back in, so a byte array of digits can never be revived as a
 * number.
 */
type Tagged = { __amana: 'bytes'; hex: string } | { __amana: 'bigint'; value: string };

const replacer = (_key: string, value: unknown): unknown => {
  if (value instanceof Uint8Array) {
    return {
      __amana: 'bytes',
      hex: Array.from(value, (b) => b.toString(16).padStart(2, '0')).join(''),
    } satisfies Tagged;
  }
  if (typeof value === 'bigint') {
    return { __amana: 'bigint', value: value.toString() } satisfies Tagged;
  }
  return value;
};

const reviver = (_key: string, value: unknown): unknown => {
  if (typeof value === 'object' && value !== null && '__amana' in value) {
    const tagged = value as Tagged;
    if (tagged.__amana === 'bytes') {
      const out = new Uint8Array(tagged.hex.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(tagged.hex.slice(i * 2, i * 2 + 2), 16);
      }
      return out;
    }
    if (tagged.__amana === 'bigint') return BigInt(tagged.value);
  }
  return value;
};

export const encodePrivateState = <T>(value: T): string => JSON.stringify(value, replacer);
export const decodePrivateState = <T>(value: string): T => JSON.parse(value, reviver) as T;

const NAMESPACE = 'amana:private-state';
const SIGNING_NAMESPACE = 'amana:signing-keys';

/** The SDK's interface asks export passwords to be at least this long. */
const MIN_EXPORT_PASSWORD = 16;

/**
 * Exports are always encrypted. The SDK lets a provider fall back to its
 * storage password when none is given; Amana has no such password to fall
 * back on, and will not hand out private state in clear, so it refuses.
 */
const requirePassword = (password: string | undefined, what: string): string => {
  if (!password) throw new Error(`Amana does not export ${what} without a password; plaintext export is disabled.`);
  if (password.length < MIN_EXPORT_PASSWORD)
    throw new Error(`Use an export password of at least ${MIN_EXPORT_PASSWORD} characters.`);
  return password;
};

/** Seal an export in the SDK's shape: base64 AES-256-GCM payload, hex 32-byte salt. */
const sealExport = async (password: string, label: string, body: string) => {
  const salt = randomBytes(32);
  return { encryptedPayload: await seal(await deriveKey(password, salt), body, label), salt: toHex(salt) };
};

const openExport = async (password: string, label: string, exported: { encryptedPayload: string; salt: string }) => {
  try {
    return await open(await deriveKey(password, fromHex(exported.salt)), exported.encryptedPayload, label);
  } catch {
    throw new Error('That password does not open this export, or the export was changed.');
  }
};

const STATES_LABEL = 'midnight-private-state-export';
const KEYS_LABEL = 'midnight-signing-key-export';

/** Where values are kept: the unlocked vault in the browser, memory in tests. */
export type PrivateStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export const persistentPrivateStateProvider = <
  PSI extends PrivateStateId,
  PS = unknown,
>(store: PrivateStore): PrivateStateProvider<PSI, PS> => {
  let contractAddress: ContractAddress | null = null;

  const requireContractAddress = (): ContractAddress => {
    if (contractAddress === null) {
      throw new Error(
        'Amana: contract address not set; call setContractAddress() before touching private state',
      );
    }
    return contractAddress;
  };

  const stateKey = (address: ContractAddress): string => `${NAMESPACE}:${address}`;

  const readScope = async (address: ContractAddress): Promise<Record<string, unknown>> => {
    const raw = await store.get(stateKey(address));
    if (raw === null) return {};
    try {
      return decodePrivateState<Record<string, unknown>>(raw);
    } catch {
      throw new Error('Amana: private state is unreadable. Restore a backup; the stored data has been preserved.');
    }
  };

  const writeScope = (address: ContractAddress, scope: Record<string, unknown>): Promise<void> =>
    store.set(stateKey(address), encodePrivateState(scope));

  const readSigningKeys = async (): Promise<Record<ContractAddress, SigningKey>> => {
    const raw = await store.get(SIGNING_NAMESPACE);
    if (raw === null) return {};
    try {
      return decodePrivateState<Record<ContractAddress, SigningKey>>(raw);
    } catch {
      return {};
    }
  };

  const writeSigningKeys = (keys: Record<ContractAddress, SigningKey>): Promise<void> =>
    store.set(SIGNING_NAMESPACE, encodePrivateState(keys));

  return {
    setContractAddress(address: ContractAddress): void {
      contractAddress = address;
    },

    async set(key: PSI, state: PS): Promise<void> {
      const address = requireContractAddress();
      const scope = await readScope(address);
      scope[key] = state;
      await writeScope(address, scope);
    },

    async get(key: PSI): Promise<PS | null> {
      const scope = await readScope(requireContractAddress());
      return (scope[key] as PS | undefined) ?? null;
    },

    async remove(key: PSI): Promise<void> {
      const address = requireContractAddress();
      const scope = await readScope(address);
      delete scope[key];
      await writeScope(address, scope);
    },

    clear(): Promise<void> {
      return store.remove(stateKey(requireContractAddress()));
    },

    async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      const keys = await readSigningKeys();
      keys[address] = signingKey;
      await writeSigningKeys(keys);
    },

    async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      return (await readSigningKeys())[address] ?? null;
    },

    async removeSigningKey(address: ContractAddress): Promise<void> {
      const keys = await readSigningKeys();
      delete keys[address];
      await writeSigningKeys(keys);
    },

    clearSigningKeys(): Promise<void> {
      return store.remove(SIGNING_NAMESPACE);
    },

    async exportPrivateStates(options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      const password = requirePassword(options?.password, 'private state');
      const address = requireContractAddress();
      const scope = await readScope(address);
      const body = encodePrivateState({
        contractAddress: address,
        states: Object.fromEntries(Object.entries(scope).map(([id, value]) => [id, encodePrivateState(value)])),
      });
      return { format: 'midnight-private-state-export', ...(await sealExport(password, STATES_LABEL, body)) };
    },

    async importPrivateStates(
      exportData: PrivateStateExport,
      options?: ImportPrivateStatesOptions,
    ): Promise<ImportPrivateStatesResult> {
      const address = requireContractAddress();
      const conflictStrategy = options?.conflictStrategy ?? 'error';
      const password = requirePassword(options?.password, 'private state');
      const payload = decodePrivateState<{ states?: Record<string, string> }>(
        await openExport(password, STATES_LABEL, exportData),
      );
      const incoming = payload.states ?? {};
      const scope = await readScope(address);

      let imported = 0;
      let skipped = 0;
      let overwritten = 0;

      for (const [stateId, serialized] of Object.entries(incoming)) {
        const exists = Object.prototype.hasOwnProperty.call(scope, stateId);
        if (exists) {
          if (conflictStrategy === 'skip') {
            skipped += 1;
            continue;
          }
          if (conflictStrategy === 'error') {
            throw new Error(`Amana: private state conflict for '${stateId}'`);
          }
          overwritten += 1;
        } else {
          imported += 1;
        }
        scope[stateId] = decodePrivateState(serialized);
      }

      await writeScope(address, scope);
      return { imported, skipped, overwritten };
    },

    async exportSigningKeys(options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      const password = requirePassword(options?.password, 'signing keys');
      const body = encodePrivateState({ keys: await readSigningKeys() });
      return { format: 'midnight-signing-key-export', ...(await sealExport(password, KEYS_LABEL, body)) };
    },

    async importSigningKeys(
      exportData: SigningKeyExport,
      options?: ImportSigningKeysOptions,
    ): Promise<ImportSigningKeysResult> {
      const conflictStrategy = options?.conflictStrategy ?? 'error';
      const password = requirePassword(options?.password, 'signing keys');
      const payload = decodePrivateState<{ keys?: Record<ContractAddress, SigningKey> }>(
        await openExport(password, KEYS_LABEL, exportData),
      );
      const incoming = payload.keys ?? {};
      const keys = await readSigningKeys();

      let imported = 0;
      let skipped = 0;
      let overwritten = 0;

      for (const [address, signingKey] of Object.entries(incoming)) {
        const exists = Object.prototype.hasOwnProperty.call(keys, address);
        if (exists) {
          if (conflictStrategy === 'skip') {
            skipped += 1;
            continue;
          }
          if (conflictStrategy === 'error') {
            throw new Error(`Amana: signing key conflict for '${address}'`);
          }
          overwritten += 1;
        } else {
          imported += 1;
        }
        keys[address] = signingKey;
      }

      await writeSigningKeys(keys);
      return { imported, skipped, overwritten };
    },
  };
};
