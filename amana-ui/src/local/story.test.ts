// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import * as utils from '../../../api/src/utils/index.js';
import { Refusal } from './engine.js';
import { CHEATS, NAMES, WHO, answerQuestion, askQuestion, openStory, tryCheat } from './story.js';

describe('the no-wallet run', () => {
  it('opens with two lenders admitted and one record from each, by running the circuits', () => {
    const { registry, recordA, recordB } = openStory();
    const pub = registry.publicLedger();
    expect(registry.calls).toBe(5);
    expect(pub.lenders).toHaveLength(2);
    expect(pub.records.map((r) => r.leaf)).toEqual([recordA.leafIndex, recordB.leafIndex]);
    expect(pub.records[0].filedBy).toBe(utils.bytesToHex(registry.lenderKey(WHO.lenderA)));
    expect(registry.wallet(WHO.borrower).map((r) => [r.lenderName, r.attestation.onTime, r.live])).toEqual([
      [NAMES.lenderA, 8n, true],
      [NAMES.lenderB, 6n, true],
    ]);
  });

  it('gives the borrower a different pseudonym at each lender', () => {
    const { recordA, recordB } = openStory();
    expect(utils.bytesToHex(recordA.attestation.subject)).not.toBe(utils.bytesToHex(recordB.attestation.subject));
  });

  it('clears a bar of 14 and records the bar, not the total', () => {
    const story = openStory();
    const id = askQuestion(story, 14n);
    expect(story.registry.check(id)?.result).toBeNull();

    expect(answerQuestion(story, id).accepted).toBe(true);

    const check = story.registry.check(id);
    expect(check?.result?.minOnTime).toBe(14n);
    expect(check?.result?.minPeriod).toBe(story.window.minPeriod);
    expect(check?.result?.maxPeriod).toBe(story.window.maxPeriod);
    expect(story.registry.publicLedger().nullifiers).toBe(1);
  });

  it('clears a lower bar with one record, leaving the same kind of entry', () => {
    const story = openStory();
    const id = askQuestion(story, 8n);
    expect(answerQuestion(story, id).accepted).toBe(true);
    expect(Object.keys(story.registry.check(id)!.result!).sort()).toEqual(
      ['maxPeriod', 'minOnTime', 'minPeriod', 'nullifier'],
    );
  });

  it('refuses a bar the borrower does not reach, and records nothing', () => {
    const story = openStory();
    const id = askQuestion(story, 15n);
    const outcome = answerQuestion(story, id);
    expect(outcome).toMatchObject({
      accepted: false,
      circuit: 'proveCreditStanding',
      reason: 'insufficient on-time repayments',
    });
    expect(story.registry.check(id)?.result).toBeNull();
    expect(story.registry.publicLedger().nullifiers).toBe(0);
  });

  it.each(CHEATS.map((c) => [c.id, c] as const))('refuses the "%s" cheat with the contract’s own message', (_, cheat) => {
    const story = openStory();
    const outcome = tryCheat(story, cheat);
    expect(outcome).toMatchObject({ accepted: false, reason: cheat.expected });
  });

  it('runs a cheat on a copy, so the honest run is untouched', () => {
    const story = openStory();
    const id = askQuestion(story, 14n);
    const before = story.registry.publicLedger();
    const calls = story.registry.calls;

    for (const cheat of CHEATS) tryCheat(story, cheat);

    expect(story.registry.calls).toBe(calls);
    expect(story.registry.publicLedger()).toEqual(before);
    expect(story.registry.wallet(WHO.borrower).every((r) => r.live)).toBe(true);
    // The honest answer still goes through afterwards.
    expect(answerQuestion(story, id).accepted).toBe(true);
  });

  it('leaves the registry as it was when a circuit refuses', () => {
    const { registry } = openStory();
    const before = registry.publicLedger();
    expect(() => registry.call(WHO.stranger, 'registerLender', registry.lenderKey(WHO.stranger))).toThrow(Refusal);
    expect(registry.publicLedger()).toEqual(before);
  });
});
