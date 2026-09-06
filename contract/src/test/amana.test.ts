// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { AmanaSimulator } from './amana-simulator.js';
import { checkId, toHex } from './utils.js';
import { pureCircuits } from '../managed/amana/contract/index.js';
import { isLiveAttestation, selectAttestations, provableTotal } from '../witnesses.js';
setNetworkId('undeployed');
const NOW = 680n, FLOOR = NOW - 23n;
const record = (onTime = 14n, periodStart = FLOOR, periodEnd = NOW) =>
  ({ onTime, total: onTime, periodStart, periodEnd });
const setup = (...lenders: string[]) => {
  const s = new AmanaSimulator();
  s.claimAuthority();
  for (const l of lenders) s.registerLender(s.lenderKeyOf(l));
  return s;
};
const request = (s: AmanaSimulator, n = 'check', borrower = 'amina', threshold = 14n) =>
  s.as('verifier').createCheck(checkId(n), borrower, threshold, FLOOR, NOW);

describe('deployment and issuing authority', () => {
  it('commits authority at deployment and rejects a front-run claim', () => {
    const s = new AmanaSimulator();
    expect(s.getLedger().protocolVersion).toBe(2n);
    expect(() => s.as('stranger').claimAuthority()).toThrow('only the deployment authority');
    expect(s.as('authority').claimAuthority().bootstrapped).toBe(true);
  });
  it('refuses activation twice', () => {
    const s = setup();
    expect(() => s.claimAuthority()).toThrow('already has an authority');
  });
  it('requires activation before lender admission', () => {
    const s = new AmanaSimulator();
    expect(() => s.registerLender(s.lenderKeyOf('A'))).toThrow('registry has no authority');
  });
  it('restricts lender admission to the authority', () => {
    const s = setup();
    expect(() => s.as('stranger').registerLender(s.lenderKeyOf('A'))).toThrow('only the authority');
  });
  it('issues a commitment at the returned live index', () => {
    const s = setup('A');
    const a = s.as('A').issueTo('amina', record());
    const l = s.getLedger();
    expect(l.issuedCount).toBe(1n);
    expect(toHex(l.issuers.lookup(0n))).toBe(toHex(s.lenderKeyOf('A')));
    expect(isLiveAttestation(l, s.walletOf('amina')[0])).toBe(true);
    expect(l.attestations.findPathForLeaf(pureCircuits.attestationCommitment(a))).toBeDefined();
  });
  it('rejects unregistered issuers', () => {
    const s = setup();
    expect(() => s.as('A').issueTo('amina', record())).toThrow('not a registered lender');
  });
  it('rejects impersonated issuer keys', () => {
    const s = setup('A', 'B');
    const a = s.as('A').issueTo('amina', record());
    expect(() => s.as('B').issueRaw(a)).toThrow('not bound to the issuing lender');
  });
  it('rejects inflated counts', () => {
    const s = setup('A');
    expect(() => s.as('A').issueTo('amina', { ...record(), total: 1n })).toThrow('on-time repayments exceed');
  });
  it('rejects reversed reporting intervals', () => {
    const s = setup('A');
    expect(() => s.as('A').issueTo('amina', record(14n, NOW, FLOOR))).toThrow('invalid reporting interval');
  });
});

describe('verifier-owned immutable checks', () => {
  it('rejects nonexistent checks without consuming a result', () => {
    const s = setup('A'), id = checkId('absent');
    expect(() => s.as('amina').proveCreditStanding(id)).toThrow('check does not exist');
    expect(s.getLedger().acceptedCount).toBe(0n);
  });
  it('rejects squatting a known verifier ID even with its nonce', () => {
    const s = setup();
    const nonce = checkId('nonce');
    const id = pureCircuits.requestId(pureCircuits.verifierKey(s.secretKeyOf('verifier')), nonce);
    const recipient = pureCircuits.checkRecipient(s.secretKeyOf('amina'), id);
    expect(() => s.as('attacker').createCheckRaw(id, nonce, recipient, 1n, 0n, NOW)).toThrow('not owned by this verifier');
    s.as('verifier').createCheckRaw(id, nonce, recipient, 14n, FLOOR, NOW);
    expect(s.getLedger().requestedChecks.lookup(id).minOnTime).toBe(14n);
  });
  it('does not permit the owner to rewrite committed terms', () => {
    const s = setup(), id = request(s);
    expect(() => s.createCheckRaw(id, checkId('check'), s.getLedger().requestedChecks.lookup(id).recipient, 1n, 0n, NOW)).toThrow('check already exists');
    expect(s.getLedger().requestedChecks.lookup(id).minOnTime).toBe(14n);
  });
  it('rejects zero thresholds that would allow empty proofs', () => {
    const s = setup();
    expect(() => request(s, 'zero', 'amina', 0n)).toThrow('threshold must be positive');
  });
  it('rejects zero recipient keys', () => {
    const s = setup(), nonce = checkId('zero');
    const id = pureCircuits.requestId(pureCircuits.verifierKey(s.getPrivateState().secretKey), nonce);
    expect(() => s.createCheckRaw(id, nonce, new Uint8Array(32), 1n, FLOOR, NOW)).toThrow('recipient key must not be zero');
  });
  it('rejects reversed check windows', () => {
    const s = setup();
    expect(() => s.createCheck(checkId('reverse'), 'amina', 1n, NOW, FLOOR)).toThrow('invalid check window');
  });
  it.each([-1n, 65536n])('rejects out-of-range thresholds (%s)', (threshold) => {
    const s = setup();
    expect(() => request(s, 'bounds', 'amina', threshold)).toThrow();
  });
  it('prevents a credentialed observer intercepting a public check', () => {
    const s = setup('A');
    s.as('A').issueTo('amina', record());
    s.as('A').issueTo('attacker', record(50n));
    const id = request(s);
    expect(() => s.as('attacker').proveCreditStanding(id)).toThrow('different borrower');
    expect(s.getLedger().checks.member(id)).toBe(false);
    expect(s.as('amina').proveCreditStanding(id).checks.member(id)).toBe(true);
  });
  it('an empty outsider cannot consume a stronger check', () => {
    const s = setup('A'); s.as('A').issueTo('amina', record());
    const id = request(s);
    expect(() => s.as('outsider').proveWithSelection(id, [])).toThrow('different borrower');
    expect(s.getLedger().requestedChecks.lookup(id).minOnTime).toBe(14n);
    s.as('amina').proveCreditStanding(id);
  });
});

describe('private standing proofs', () => {
  it('aggregates 8 + 6 from two lenders against exact committed terms', () => {
    const s = setup('A', 'B');
    s.as('A').issueTo('amina', record(8n)); s.as('B').issueTo('amina', record(6n));
    const id = request(s), result = s.as('amina').proveCreditStanding(id).checks.lookup(id);
    expect(result.minOnTime).toBe(14n); expect(result.minPeriod).toBe(FLOOR); expect(result.maxPeriod).toBe(NOW);
    expect(Object.keys(result).sort()).toEqual(['maxPeriod', 'minOnTime', 'minPeriod', 'nullifier']);
  });
  it('records the threshold without disclosing the margin', () => {
    const s = setup('A'); s.as('A').issueTo('amina', record(40n));
    const id = request(s);
    expect(s.as('amina').proveCreditStanding(id).checks.lookup(id).minOnTime).toBe(14n);
  });
  it('fails one repayment short', () => {
    const s = setup('A'); s.as('A').issueTo('amina', record(13n));
    const id = request(s);
    expect(() => s.as('amina').proveCreditStanding(id)).toThrow('insufficient on-time');
    expect(s.getLedger().checks.member(id)).toBe(false);
  });
  it('fails an empty intended borrower', () => {
    const s = setup(), id = request(s);
    expect(() => s.as('amina').proveCreditStanding(id)).toThrow('insufficient on-time');
  });
  it.each([[FLOOR - 1n, NOW], [FLOOR, NOW + 1n]])('rejects a summary outside either boundary (%s, %s)', (start, end) => {
    const s = setup('A'); s.as('A').issueTo('amina', record(14n, start, end));
    const id = request(s);
    expect(() => s.as('amina').proveWithSelection(id, [0n])).toThrow('outside the check window');
  });
  it('does not let a recent final payment make lifetime counts recent', () => {
    const s = setup('A'); s.as('A').issueTo('amina', record(100n, 0n, NOW));
    const id = request(s);
    expect(() => s.as('amina').proveCreditStanding(id)).toThrow('insufficient on-time');
  });
  it('rejects another borrower credential even on a check addressed to the thief', () => {
    const s = setup('A'), a = s.as('A').issueTo('amina', record());
    s.deliver('thief', a, 0n);
    const id = request(s, 'theft', 'thief');
    expect(() => s.as('thief').proveWithSelection(id, [0n])).toThrow('not issued to this borrower');
  });
  it('rejects modified repayment counts without a matching commitment', () => {
    const s = setup('A'), a = s.as('A').issueTo('amina', record(1n));
    s.circuitContext.currentPrivateState = { ...s.as('amina').getPrivateState(), wallet: [{ attestation: { ...a, onTime: 99n, total: 99n }, leafIndex: 0n, lenderName: 'A' }] };
    const id = request(s);
    expect(() => s.as('amina').proveWithSelection(id, [0n])).toThrow('not live');
  });
  it('rejects counting a leaf twice', () => {
    const s = setup('A'); s.as('A').issueTo('amina', record(8n)); const id = request(s);
    expect(() => s.as('amina').proveWithSelection(id, [0n, 0n])).toThrow('multiple summaries from one lender');
  });
  it('rejects overlapping snapshots from the same lender with different nonces', () => {
    const s = setup('A'); s.as('A').issueTo('amina', record(8n)); s.as('A').issueTo('amina', record(8n));
    const id = request(s);
    expect(() => s.as('amina').proveWithSelection(id, [0n, 1n])).toThrow('multiple summaries from one lender');
    expect(provableTotal(s.walletOf('amina'), FLOOR, NOW)).toBe(8n);
  });
  it('accepts independent lenders even if they use the same nonce', () => {
    const s = setup('A', 'B'), nonce = checkId('shared nonce');
    s.as('A').issueTo('amina', record(8n), nonce); s.as('B').issueTo('amina', record(6n), nonce);
    const id = request(s); s.as('amina').proveCreditStanding(id);
  });
  it('supports all four slots and caps automatic selection at four lenders', () => {
    const s = setup('A', 'B', 'C', 'D', 'E');
    for (const l of ['A', 'B', 'C', 'D', 'E']) s.as(l).issueTo('amina', record(4n));
    const id = request(s, 'four', 'amina', 16n);
    s.as('amina').proveCreditStanding(id);
    expect(selectAttestations(s.walletOf('amina'), 20n, FLOOR, NOW)).toHaveLength(4);
    expect(provableTotal(s.walletOf('amina'), FLOOR, NOW)).toBe(16n);
  });
});

describe('revocation, selection, and replay', () => {
  it('rejects a revoked witness but retains a historical accepted check', () => {
    const s = setup('A'); s.as('A').issueTo('amina', record());
    const before = request(s, 'before'); s.as('amina').proveCreditStanding(before);
    s.as('A').revokeAttestation(0n);
    const after = request(s, 'after');
    expect(() => s.as('amina').proveWithSelection(after, [0n])).toThrow('not live');
    expect(s.getLedger().checks.member(before)).toBe(true);
  });
  it('only lets the issuer revoke, once', () => {
    const s = setup('A', 'B'); s.as('A').issueTo('amina', record());
    expect(() => s.as('B').revokeAttestation(0n)).toThrow('only the issuing lender');
    s.as('A').revokeAttestation(0n);
    expect(() => s.revokeAttestation(0n)).toThrow('no attestation at that index');
  });
  it('filters revoked stronger summaries and selects a sufficient live alternative', () => {
    const s = setup('A'); s.as('A').issueTo('amina', record(99n)); s.as('A').issueTo('amina', record());
    s.as('A').revokeAttestation(0n); const id = request(s);
    s.as('amina').proveCreditStanding(id);
    expect(s.getPrivateState().presenting).toEqual([1n]);
  });
  it('does not consider the right commitment at the wrong index live', () => {
    const s = setup('A'); s.as('A').issueTo('amina', record());
    expect(isLiveAttestation(s.getLedger(), { ...s.walletOf('amina')[0], leafIndex: 1n })).toBe(false);
  });
  it('cannot answer a check twice', () => {
    const s = setup('A'); s.as('A').issueTo('amina', record()); const id = request(s);
    s.as('amina').proveCreditStanding(id);
    expect(() => s.proveCreditStanding(id)).toThrow('already been answered');
  });
  it('uses distinct check recipients and nullifiers and separate verifier/lender key domains', () => {
    const s = setup('A'); s.as('A').issueTo('amina', record());
    const a = request(s, 'a'), b = request(s, 'b');
    const ra = s.as('amina').proveCreditStanding(a).checks.lookup(a);
    const rb = s.as('amina').proveCreditStanding(b).checks.lookup(b);
    expect(toHex(ra.nullifier)).not.toBe(toHex(rb.nullifier));
    expect(toHex(s.getLedger().requestedChecks.lookup(a).recipient)).not.toBe(toHex(s.getLedger().requestedChecks.lookup(b).recipient));
    const sk = s.secretKeyOf('verifier');
    expect(toHex(pureCircuits.verifierKey(sk))).not.toBe(toHex(pureCircuits.lenderKey(sk)));
  });
  it('derives stable per-lender pseudonyms without a shared public borrower key', () => {
    const s = setup();
    expect(toHex(s.subjectIdOf('amina', 'A'))).toBe(toHex(s.subjectIdOf('amina', 'A')));
    expect(toHex(s.subjectIdOf('amina', 'A'))).not.toBe(toHex(s.subjectIdOf('amina', 'B')));
    expect(toHex(s.subjectIdOf('amina', 'A'))).not.toBe(toHex(s.subjectIdOf('other', 'A')));
  });
});



describe('public transcript privacy regression', () => {
  it('has an identical public transcript for one or four records satisfying the same check', () => {
    const s = setup('A', 'B', 'C', 'D', 'E');
    s.as('A').issueTo('amina', record(14n));
    for (const l of ['B', 'C', 'D', 'E']) s.as(l).issueTo('amina', record(4n));
    const id = request(s);
    s.as('amina');
    const base = s.circuitContext;
    const run = (presenting: bigint[]) => s.contract.impureCircuits.proveCreditStanding({
      ...base, currentPrivateState: { ...base.currentPrivateState, presenting },
    }, id).proofData;
    const one = run([0n]), four = run([1n, 2n, 3n, 4n]);
    expect(one.publicTranscript).toEqual(four.publicTranscript);
    expect(one.input).toEqual(four.input);
    expect(one.privateTranscriptOutputs).not.toEqual(four.privateTranscriptOutputs);
  });
});
