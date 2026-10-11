// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Report where each transaction is, from inside the provider set.
 *
 * The Midnight SDK submits every call the same way: it runs the circuit on
 * this device, asks the proof provider for a proof, asks the wallet to
 * balance and sign, submits, then watches the indexer until the transaction
 * is final. Wrapping those four providers marks each boundary as the SDK
 * crosses it, which is what the progress panel shows. Nothing about the
 * transaction itself changes.
 *
 * @module
 */

import type { AmanaProviders } from '../../api/src/common-types.js';
import { reportStage, type TxStage } from './transactions.js';

/**
 * Everything the proof provider throws is about the proof server, but its
 * messages rarely say so ("Failed to fetch", "code=502"). Saying so lets the
 * person reading the error know which of the three local pieces to check.
 */
export class ProofServerError extends Error {
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Proof server: ${detail}`, { cause });
    this.name = 'ProofServerError';
  }
}

/** A copy of `target` with one method replaced; everything else, `this` included, is the original's. */
const override = <T extends object, K extends keyof T>(target: T, key: K, value: T[K]): T =>
  Object.assign(Object.create(target) as T, { [key]: value });

export const withStageReporting = (
  providers: AmanaProviders,
  report: (stage: TxStage) => void = reportStage,
): AmanaProviders => {
  const { proofProvider, walletProvider, midnightProvider, publicDataProvider } = providers;
  return {
    ...providers,
    proofProvider: override(proofProvider, 'proveTx', async (tx, config) => {
      report('prove');
      try {
        return await proofProvider.proveTx(tx, config);
      } catch (e) {
        throw new ProofServerError(e);
      }
    }),
    walletProvider: override(walletProvider, 'balanceTx', (tx) => {
      report('approve');
      return walletProvider.balanceTx(tx);
    }),
    midnightProvider: override(midnightProvider, 'submitTx', (tx) => {
      report('submit');
      return midnightProvider.submitTx(tx);
    }),
    publicDataProvider: override(publicDataProvider, 'watchForTxData', (txId) => {
      report('confirm');
      return publicDataProvider.watchForTxData(txId);
    }),
  };
};
