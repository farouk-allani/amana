// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The run a visitor walks through without a wallet, and the ways they can
 * try to cheat it.
 *
 * Everything here is a call into the compiled contract through
 * {@link LocalRegistry}. The people are fictional. The refusals are not
 * scripted: each attempt really runs the circuit with dishonest private
 * state, and the message shown is whatever the contract's assert said.
 *
 * @module
 */

import type { StoredAttestation } from '../../../contract/src/witnesses.js';
import * as utils from '../../../api/src/utils/index.js';
import { LocalRegistry, Refusal, type CircuitName } from './engine.js';

/** Device names. Each is a separate private state, as on separate devices. */
export const WHO = {
  operator: 'operator',
  lenderA: 'lender-a',
  lenderB: 'lender-b',
  newLender: 'lender-c',
  borrower: 'amal',
  friend: 'friend',
  stranger: 'stranger',
} as const;

export const NAMES = {
  borrower: 'Amal',
  lenderA: 'Lender A',
  lenderB: 'Lender B',
  newLender: 'Lender C',
} as const;

export type Story = {
  readonly registry: LocalRegistry;
  /** The 24 months every record and question in the run covers. */
  readonly window: { readonly minPeriod: bigint; readonly maxPeriod: bigint };
  readonly recordA: StoredAttestation;
  readonly recordB: StoredAttestation;
  /** On-time repayments Amal holds across both lenders. */
  readonly held: bigint;
};

/**
 * Deploy a registry, admit two lenders and have each file one record for
 * Amal: 8 of 8 on time at Lender A, 6 of 7 at Lender B. Five circuit calls.
 */
export const openStory = (now = new Date()): Story => {
  const registry = LocalRegistry.deploy(WHO.operator);
  const maxPeriod = utils.currentPeriod(now);
  const window = { minPeriod: maxPeriod - 23n, maxPeriod };
  const span = { periodStart: window.minPeriod, periodEnd: window.maxPeriod };

  registry.call(WHO.operator, 'claimAuthority');
  registry.call(WHO.operator, 'registerLender', registry.lenderKey(WHO.lenderA));
  registry.call(WHO.operator, 'registerLender', registry.lenderKey(WHO.lenderB));
  const recordA = registry.issue(WHO.lenderA, WHO.borrower, { onTime: 8n, total: 8n, ...span }, NAMES.lenderA);
  const recordB = registry.issue(WHO.lenderB, WHO.borrower, { onTime: 6n, total: 7n, ...span }, NAMES.lenderB);

  return { registry, window, recordA, recordB, held: 14n };
};

/** The new lender commits its question. Returns the check's id. */
export const askQuestion = (story: Story, minOnTime: bigint): string =>
  story.registry.ask(WHO.newLender, WHO.borrower, minOnTime, story.window.minPeriod, story.window.maxPeriod);

export type Outcome =
  | { readonly accepted: true; readonly ms: number }
  | { readonly accepted: false; readonly circuit: CircuitName; readonly reason: string; readonly ms: number };

const attempt = (run: () => void): Outcome => {
  const started = performance.now();
  try {
    run();
    return { accepted: true, ms: performance.now() - started };
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    return { accepted: false, circuit: e.circuit, reason: e.reason, ms: performance.now() - started };
  }
};

/** Amal answers honestly, with whichever live records meet the terms. */
export const answerQuestion = (story: Story, checkId: string): Outcome =>
  attempt(() => story.registry.answer(WHO.borrower, checkId));

export type Cheat = {
  readonly id: string;
  readonly title: string;
  /** What the cheater does, in one sentence. */
  readonly attempt: string;
  /** Why it fails, in plain words. */
  readonly why: string;
  /** The assert in `amana.compact` that stops it. */
  readonly expected: string;
  /** Runs the attempt on a copy of the registry; throws a Refusal if stopped. */
  readonly run: (registry: LocalRegistry, story: Story) => void;
};

const bothLeaves = (story: Story): bigint[] => [story.recordA.leafIndex, story.recordB.leafIndex];

export const CHEATS: readonly Cheat[] = [
  {
    id: 'inflate',
    title: 'Edit a record',
    attempt: `${NAMES.newLender} asks for 15. ${NAMES.borrower} holds 14, so she changes ${NAMES.lenderA}’s record from 8 to 9.`,
    why: 'The edited record no longer matches the fingerprint the lender filed.',
    expected: 'attestation is not live in the registry',
    run: (registry, story) => {
      const id = registry.ask(WHO.newLender, WHO.borrower, 15n, story.window.minPeriod, story.window.maxPeriod);
      registry.setDevice(WHO.borrower, (ps) => ({
        ...ps,
        wallet: ps.wallet.map((s) =>
          s.leafIndex === story.recordA.leafIndex
            ? { ...s, attestation: { ...s.attestation, onTime: 9n, total: 9n } }
            : s,
        ),
      }));
      registry.answer(WHO.borrower, id, bothLeaves(story));
    },
  },
  {
    id: 'borrowed',
    title: 'Use someone else’s record',
    attempt: `A friend with no history takes a copy of ${NAMES.borrower}’s two records and presents them as his own.`,
    why: 'Each record is bound to a pseudonym only its owner’s key can produce.',
    expected: 'attestation was not issued to this borrower',
    run: (registry, story) => {
      const id = registry.ask(WHO.newLender, WHO.friend, 14n, story.window.minPeriod, story.window.maxPeriod);
      const copied = registry.device(WHO.borrower).wallet;
      registry.setDevice(WHO.friend, (ps) => ({ ...ps, wallet: copied }));
      registry.answer(WHO.friend, id, bothLeaves(story));
    },
  },
  {
    id: 'cancelled',
    title: 'Use a cancelled record',
    attempt: `${NAMES.lenderB} cancels its record. ${NAMES.borrower} still has her copy and presents it anyway.`,
    why: 'Cancelling removes the fingerprint from the registry, so the copy proves nothing.',
    expected: 'attestation is not live in the registry',
    run: (registry, story) => {
      registry.call(WHO.lenderB, 'revokeAttestation', story.recordB.leafIndex);
      const id = registry.ask(WHO.newLender, WHO.borrower, 14n, story.window.minPeriod, story.window.maxPeriod);
      registry.answer(WHO.borrower, id, bothLeaves(story));
    },
  },
  {
    id: 'double',
    title: 'Count one lender twice',
    attempt: `${NAMES.lenderA} files the same eight repayments a second time. ${NAMES.borrower} presents both copies to reach 16.`,
    why: 'A proof may use one record per lender, so the same history cannot count twice.',
    expected: 'multiple summaries from one lender',
    run: (registry, story) => {
      const again = registry.issue(
        WHO.lenderA,
        WHO.borrower,
        { onTime: 8n, total: 8n, periodStart: story.window.minPeriod, periodEnd: story.window.maxPeriod },
        NAMES.lenderA,
      );
      const id = registry.ask(WHO.newLender, WHO.borrower, 16n, story.window.minPeriod, story.window.maxPeriod);
      registry.answer(WHO.borrower, id, [story.recordA.leafIndex, again.leafIndex]);
    },
  },
  {
    id: 'stranger',
    title: 'Answer for someone else',
    attempt: `A stranger sees the question meant for ${NAMES.borrower} and tries to answer it.`,
    why: 'A question names the one key allowed to answer it.',
    expected: 'check is for a different borrower',
    run: (registry, story) => {
      const id = registry.ask(WHO.newLender, WHO.borrower, 14n, story.window.minPeriod, story.window.maxPeriod);
      registry.answer(WHO.stranger, id, []);
    },
  },
  {
    id: 'twice',
    title: 'Answer the same question twice',
    attempt: `${NAMES.borrower} answers a question, then sends the same answer again.`,
    why: 'Each question accepts one answer.',
    expected: 'check has already been answered',
    run: (registry, story) => {
      const id = registry.ask(WHO.newLender, WHO.borrower, 14n, story.window.minPeriod, story.window.maxPeriod);
      registry.answer(WHO.borrower, id);
      registry.answer(WHO.borrower, id);
    },
  },
];

/**
 * Run one cheat for real, on a copy of the registry, so the honest run the
 * visitor is in the middle of is untouched whatever happens.
 */
export const tryCheat = (story: Story, cheat: Cheat): Outcome =>
  attempt(() => cheat.run(story.registry.fork(), story));
