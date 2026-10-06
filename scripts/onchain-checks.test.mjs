// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './onchain-checks.mjs';

const A = 'aa'.repeat(32), B = 'bb'.repeat(32), C = 'cc'.repeat(32), CONTRACT = 'ff'.repeat(32);
const DEPLOY = '11'.repeat(32), CALL = '22'.repeat(32);
const terms = { minOnTime: 14n, minPeriod: 655n, maxPeriod: 678n };

const evidence = {
  contract: CONTRACT,
  ledger: { protocolVersion: 2, authority: A, lenders: [A, B], issuers: { 0: A, 1: B },
    issuedCount: 2, revokedCount: 0, acceptedCount: 1 },
  transactions: [{ kind: 'deploy', hash: DEPLOY, block: 10 },
    { kind: 'call', circuit: 'issueAttestation', hash: CALL, block: 12 }],
};
const snapshot = () => ({
  protocolVersion: 2n, bootstrapped: true, authority: A, lenders: [A, B],
  issuers: [[0n, A], [1n, B]], nextLeaf: 2n, issuedCount: 2n, revokedCount: 0n, acceptedCount: 1n,
  requestedChecks: [[C, terms]], checks: [[C, terms]], nullifierCount: 1n,
});
const txs = () => new Map([
  [DEPLOY, { block: 10, address: CONTRACT, kind: 'deploy' }],
  [CALL, { block: 12, address: CONTRACT, kind: 'call', circuit: 'issueAttestation' }],
]);
const failures = (s = snapshot(), t = txs()) => evaluate(evidence, s, t).filter((r) => !r.ok).map((r) => r.name);

describe('on-chain evidence checks', () => {
  it('pass for a registry that matches its evidence', () => {
    assert.deepEqual(failures(), []);
  });

  it('treat later public activity as growth, not failure', () => {
    const s = { ...snapshot(), lenders: [A, B, C], issuers: [[0n, A], [1n, B], [2n, C]],
      nextLeaf: 3n, issuedCount: 3n };
    assert.deepEqual(failures(s), []);
  });

  it('accept a recorded leaf that has since been revoked', () => {
    const s = { ...snapshot(), issuers: [[0n, A]], revokedCount: 1n };
    assert.deepEqual(failures(s), []);
  });

  it('flag a different authority', () => {
    assert.ok(failures({ ...snapshot(), authority: B }).some((n) => n.startsWith('authority')));
  });

  it('flag broken leaf accounting', () => {
    assert.ok(failures({ ...snapshot(), nextLeaf: 3n }).includes('one tree leaf per issued record'));
  });

  it('accept live records of a withdrawn institution awaiting voiding', () => {
    // B issued leaf 1 and has since been withdrawn: only the recorded
    // membership differs, and leaf 1 is not an invariant violation.
    const s = { ...snapshot(), lenders: [A] };
    assert.deepEqual(failures(s), ['2 recorded institutions admitted']);
  });

  it('flag an answer whose terms differ from the committed request', () => {
    const s = { ...snapshot(), checks: [[C, { ...terms, minOnTime: 1n }]] };
    assert.ok(failures(s).includes('every answer records exactly the terms its verifier committed'));
  });

  it('flag a counter below the recorded value', () => {
    const s = { ...snapshot(), checks: [], nullifierCount: 0n, acceptedCount: 0n };
    assert.ok(failures(s).includes('acceptedCount at least 1'));
  });

  it('flag a transaction that is missing, in another block, or calling another circuit', () => {
    const t = txs();
    for (const found of [null, { block: 13, address: CONTRACT, kind: 'call', circuit: 'issueAttestation' },
      { block: 12, address: CONTRACT, kind: 'call', circuit: 'revokeAttestation' }]) {
      t.set(CALL, found);
      assert.deepEqual(failures(snapshot(), t), ['issueAttestation 22222222…2222 in block 12']);
    }
  });
});
