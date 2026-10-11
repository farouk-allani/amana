// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import type { AmanaProviders } from '../../api/src/common-types.js';
import { ProofServerError, withStageReporting } from './stage-reporting.js';
import type { TxStage } from './transactions.js';

/** Providers that record what was called, in the shapes the SDK uses. */
const fakes = (proveFails = false) => {
  const calls: string[] = [];
  class Indexer {
    constructor(private readonly name: string) {}
    queryContractState() {
      calls.push(`query:${this.name}`);
      return Promise.resolve(null);
    }
    watchForTxData(id: string) {
      calls.push(`watch:${id}:${this.name}`);
      return Promise.resolve({ txId: id });
    }
  }
  const providers = {
    privateStateProvider: { marker: 'private' },
    zkConfigProvider: { marker: 'zk' },
    proofProvider: {
      proveTx: (tx: string) => {
        calls.push(`prove:${tx}`);
        return proveFails ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(`proven(${tx})`);
      },
    },
    walletProvider: {
      getCoinPublicKey: () => 'coin-key',
      balanceTx: (tx: string) => {
        calls.push(`balance:${tx}`);
        return Promise.resolve(`balanced(${tx})`);
      },
    },
    midnightProvider: {
      submitTx: (tx: string) => {
        calls.push(`submit:${tx}`);
        return Promise.resolve('tx-1');
      },
    },
    publicDataProvider: new Indexer('indexer'),
  };
  return { calls, providers: providers as unknown as AmanaProviders };
};

/** The order the SDK's submitTx follows. */
const submitLikeTheSdk = async (p: AmanaProviders) => {
  const proven = await p.proofProvider.proveTx('tx' as never);
  const balanced = await p.walletProvider.balanceTx(proven as never);
  const id = await p.midnightProvider.submitTx(balanced as never);
  return p.publicDataProvider.watchForTxData(id);
};

describe('withStageReporting', () => {
  it('reports each stage as the SDK reaches it, before handing over', async () => {
    const { calls, providers } = fakes();
    const seen: string[] = [];
    const wrapped = withStageReporting(providers, (stage: TxStage) => {
      seen.push(stage);
      calls.push(`stage:${stage}`);
    });
    await submitLikeTheSdk(wrapped);
    expect(seen).toEqual(['prove', 'approve', 'submit', 'confirm']);
    expect(calls).toEqual([
      'stage:prove',
      'prove:tx',
      'stage:approve',
      'balance:proven(tx)',
      'stage:submit',
      'submit:balanced(proven(tx))',
      'stage:confirm',
      'watch:tx-1:indexer',
    ]);
  });

  it('changes nothing else about the providers', async () => {
    const { calls, providers } = fakes();
    const wrapped = withStageReporting(providers, () => undefined);
    expect(wrapped.walletProvider.getCoinPublicKey()).toBe('coin-key');
    expect(wrapped.privateStateProvider).toBe(providers.privateStateProvider);
    expect(wrapped.zkConfigProvider).toBe(providers.zkConfigProvider);
    // A class-based provider keeps its prototype methods and its `this`.
    await wrapped.publicDataProvider.queryContractState('addr' as never);
    expect(calls).toEqual(['query:indexer']);
  });

  it('marks a proving failure as the proof server’s, keeping the cause', async () => {
    const { providers } = fakes(true);
    const wrapped = withStageReporting(providers, () => undefined);
    const failure = await wrapped.proofProvider.proveTx('tx' as never).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ProofServerError);
    expect((failure as Error).message).toBe('Proof server: Failed to fetch');
    expect((failure as Error).cause).toBeInstanceOf(TypeError);
  });
});
