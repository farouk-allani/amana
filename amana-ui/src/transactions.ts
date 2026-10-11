// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Where an on-chain operation has got to.
 *
 * Every Amana transaction follows the same path through the Midnight SDK:
 * the circuit runs on this device, the proof server builds a zero-knowledge
 * proof, the wallet balances and signs, the transaction is submitted, and the
 * SDK waits until the indexer sees it final. A proof takes about 100 seconds
 * and everything else about 25, so a spinner tells a person nothing.
 *
 * The provider set in `providers.ts` reports each boundary here as the SDK
 * crosses it. The stages a person sees are therefore real, not a timer
 * dressed up as progress.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type TxStage = 'prepare' | 'prove' | 'approve' | 'submit' | 'confirm';

export const TX_STAGES: readonly TxStage[] = ['prepare', 'prove', 'approve', 'submit', 'confirm'];

type Listener = (stage: TxStage) => void;
const listeners = new Set<Listener>();

/** Called by the provider wrappers as the SDK reaches each stage. */
export const reportStage = (stage: TxStage): void => {
  for (const listener of listeners) listener(stage);
};

/** Subscribe to stage reports. Returns the unsubscribe function. */
export const onStage = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export type TxStatus =
  | { readonly phase: 'idle' }
  | { readonly phase: 'running'; readonly stage: TxStage; readonly startedAt: number }
  | { readonly phase: 'done'; readonly startedAt: number; readonly finishedAt: number }
  | {
      readonly phase: 'failed';
      readonly stage: TxStage;
      readonly error: unknown;
      readonly startedAt: number;
      readonly finishedAt: number;
    };

/**
 * Run one on-chain operation and follow its stages.
 *
 * `run` resolves to the operation's result, or `undefined` if it failed; the
 * failure itself is kept in `status` for the progress panel to explain. The
 * API runs one operation per device at a time, so a single shared stage
 * channel is enough.
 */
export const useTransaction = () => {
  const [status, setStatus] = useState<TxStatus>({ phase: 'idle' });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
    const startedAt = Date.now();
    let stage: TxStage = 'prepare';
    const update = (next: TxStatus) => {
      if (mounted.current) setStatus(next);
    };
    update({ phase: 'running', stage, startedAt });
    const off = onStage((next) => {
      stage = next;
      update({ phase: 'running', stage, startedAt });
    });
    try {
      const result = await operation();
      update({ phase: 'done', startedAt, finishedAt: Date.now() });
      return result;
    } catch (error) {
      update({ phase: 'failed', stage, error, startedAt, finishedAt: Date.now() });
      return undefined;
    } finally {
      off();
    }
  }, []);

  const reset = useCallback(() => setStatus({ phase: 'idle' }), []);

  return { status, run, reset, busy: status.phase === 'running' };
};

export type Transaction = ReturnType<typeof useTransaction>;
