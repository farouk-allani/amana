// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * A private state provider backed by `localStorage`.
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
 * mix wallets.
 *
 * @module
 */

import type {
  ContractAddress,
  SigningKey,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
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

export const persistentPrivateStateProvider = <
  PSI extends PrivateStateId,
  PS = unknown,
>(): PrivateStateProvider<PSI, PS> => {
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

  const readScope = (address: ContractAddress): Record<string, unknown> => {
    const raw = localStorage.getItem(stateKey(address));
    if (raw === null) return {};
    try {
      return decodePrivateState<Record<string, unknown>>(raw);
    } catch {
      // A corrupt blob must not brick the wallet on every subsequent load.
      console.warn('Amana: discarding unreadable private state for', address);
      return {};
    }
  };

  const writeScope = (address: ContractAddress, scope: Record<string, unknown>): void => {
    localStorage.setItem(stateKey(address), encodePrivateState(scope));
  };

  const readSigningKeys = (): Record<ContractAddress, SigningKey> => {
    const raw = localStorage.getItem(SIGNING_NAMESPACE);
    if (raw === null) return {};
    try {
      return decodePrivateState<Record<ContractAddress, SigningKey>>(raw);
    } catch {
      return {};
    }
  };

  const writeSigningKeys = (keys: Record<ContractAddress, SigningKey>): void => {
    localStorage.setItem(SIGNING_NAMESPACE, encodePrivateState(keys));
  };

  return {
    setContractAddress(address: ContractAddress): void {
      contractAddress = address;
    },

    set(key: PSI, state: PS): Promise<void> {
      const address = requireContractAddress();
      const scope = readScope(address);
      scope[key] = state;
      writeScope(address, scope);
      return Promise.resolve();
    },

    get(key: PSI): Promise<PS | null> {
      const scope = readScope(requireContractAddress());
      return Promise.resolve((scope[key] as PS | undefined) ?? null);
    },

    remove(key: PSI): Promise<void> {
      const address = requireContractAddress();
      const scope = readScope(address);
      delete scope[key];
      writeScope(address, scope);
      return Promise.resolve();
    },

    clear(): Promise<void> {
      localStorage.removeItem(stateKey(requireContractAddress()));
      return Promise.resolve();
    },

    setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      const keys = readSigningKeys();
      keys[address] = signingKey;
      writeSigningKeys(keys);
      return Promise.resolve();
    },

    getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      return Promise.resolve(readSigningKeys()[address] ?? null);
    },

    removeSigningKey(address: ContractAddress): Promise<void> {
      const keys = readSigningKeys();
      delete keys[address];
      writeSigningKeys(keys);
      return Promise.resolve();
    },

    clearSigningKeys(): Promise<void> {
      localStorage.removeItem(SIGNING_NAMESPACE);
      return Promise.resolve();
    },

    exportPrivateStates(options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      void options;
      const address = requireContractAddress();
      const scope = readScope(address);
      return Promise.resolve({
        format: 'midnight-private-state-export',
        encryptedPayload: encodePrivateState({
          contractAddress: address,
          states: Object.fromEntries(
            Object.entries(scope).map(([id, value]) => [id, encodePrivateState(value)]),
          ),
        }),
        salt: 'amana-persistent-private-state-provider',
      });
    },

    importPrivateStates(
      exportData: PrivateStateExport,
      options?: ImportPrivateStatesOptions,
    ): Promise<ImportPrivateStatesResult> {
      const address = requireContractAddress();
      const conflictStrategy = options?.conflictStrategy ?? 'error';
      const payload = decodePrivateState<{ states?: Record<string, string> }>(
        exportData.encryptedPayload,
      );
      const incoming = payload.states ?? {};
      const scope = readScope(address);

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
            return Promise.reject(new Error(`Amana: private state conflict for '${stateId}'`));
          }
          overwritten += 1;
        } else {
          imported += 1;
        }
        scope[stateId] = decodePrivateState(serialized);
      }

      writeScope(address, scope);
      return Promise.resolve({ imported, skipped, overwritten });
    },

    exportSigningKeys(options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      void options;
      return Promise.resolve({
        format: 'midnight-signing-key-export',
        encryptedPayload: encodePrivateState({ keys: readSigningKeys() }),
        salt: 'amana-persistent-signing-key-provider',
      });
    },

    importSigningKeys(
      exportData: SigningKeyExport,
      options?: ImportSigningKeysOptions,
    ): Promise<ImportSigningKeysResult> {
      const conflictStrategy = options?.conflictStrategy ?? 'error';
      const payload = decodePrivateState<{ keys?: Record<ContractAddress, SigningKey> }>(
        exportData.encryptedPayload,
      );
      const incoming = payload.keys ?? {};
      const keys = readSigningKeys();

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
            return Promise.reject(new Error(`Amana: signing key conflict for '${address}'`));
          }
          overwritten += 1;
        } else {
          imported += 1;
        }
        keys[address] = signingKey;
      }

      writeSigningKeys(keys);
      return Promise.resolve({ imported, skipped, overwritten });
    },
  };
};
