// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Wiring to the Midnight Lace wallet and the network providers.
 *
 * @module
 */

import { ConnectedAPI, type InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Binding,
  FinalizedTransaction,
  Proof,
  SignatureEnabled,
  Transaction,
  TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import semver from 'semver';
import type { Logger } from 'pino';

import type { AmanaCircuitKeys, AmanaProviders, PrivateStateId } from '../../api/src/common-types.js';
import type { AmanaPrivateState } from '../../contract/src/index.js';
import { persistentPrivateStateProvider } from './persistent-private-state-provider.js';

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

/** The first installed wallet whose connector API we can actually speak to. */
const findWallet = (): InitialAPI | undefined => {
  if (!window.midnight) return undefined;
  return Object.values(window.midnight).find(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === 'object' &&
      'apiVersion' in wallet &&
      semver.satisfies((wallet as InitialAPI).apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );
};

export class WalletMissingError extends Error {
  constructor() {
    super('No compatible Midnight Lace wallet was found. Is the extension installed and enabled?');
    this.name = 'WalletMissingError';
  }
}

/**
 * Wait for the wallet extension to inject itself, then connect.
 *
 * The extension is not guaranteed to be present when the page's scripts run,
 * so this polls briefly rather than failing on the first look.
 */
export const connectToWallet = async (
  networkId: string,
  logger?: Logger,
  timeoutMs = 8_000,
): Promise<ConnectedAPI> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const initial = findWallet();
    if (initial) {
      logger?.info('compatible wallet found; requesting authorisation');
      return await initial.connect(networkId);
    }
    if (Date.now() > deadline) throw new WalletMissingError();
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
};

/**
 * Assemble the provider set Amana needs.
 *
 * The wallet configures the proof-server URI. That prover receives witness data;
 * it may be remote. Use a trusted local prover for the demo. Ledger privacy does
 * not protect against an untrusted prover or a compromised browser.
 */
export const initialiseProviders = async (
  networkId: string,
  logger?: Logger,
): Promise<AmanaProviders> => {
  const wallet = await connectToWallet(networkId, logger);
  const config = await wallet.getConfiguration();
  const shielded = await wallet.getShieldedAddresses();

  // Proving and verifying key material is served from this app's own origin;
  // `npm run build` copies it out of the contract workspace into `public/`.
  const zkConfigProvider = new FetchZkConfigProvider<AmanaCircuitKeys>(
    window.location.origin,
    fetch.bind(window),
  );

  if (!config.proverServerUri) {
    throw new Error(
      'Amana: the connected wallet has no proof server configured. In Lace, open Settings » Midnight and select a proof server.',
    );
  }

  return {
    privateStateProvider: persistentPrivateStateProvider<PrivateStateId, AmanaPrivateState>(),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri,
      // SDK's Node default uses ws.WebSocket; select the native browser transport explicitly.
      globalThis.WebSocket as unknown as NonNullable<Parameters<typeof indexerPublicDataProvider>[2]>),
    walletProvider: {
      getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const balanced = await wallet.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(balanced.tx),
        );
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await wallet.submitTransaction(toHex(tx.serialize()));
        const [txId] = tx.identifiers();
        logger?.info({ submitted: txId });
        return txId as TransactionId;
      },
    },
  };
};
