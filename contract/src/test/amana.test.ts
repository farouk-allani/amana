// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { AmanaSimulator } from './amana-simulator.js';
import { checkId, toHex } from './utils.js';
import { pureCircuits } from '../managed/amana/contract/index.js';
import { isLiveAttestation, selectAttestations, provableTotal } from '../witnesses.js';
const NOW = 680n, FLOOR = NOW - 23n;
const record = (onTime = 14n, periodStart = FLOOR, periodEnd = NOW) =>
  ({ onTime, total: onTime, periodStart, periodEnd });
const setup = async (...lenders: string[]) => {
  const s = await AmanaSimulator.create();
  await s.claimAuthority();
  for (const l of lenders) await s.registerLender(s.lenderKeyOf(l));
  return s;
};
const request = (s: AmanaSimulator, n = 'check', borrower = 'amina', threshold = 14n) =>
  s.as('verifier').createCheck(checkId(n), borrower, threshold, FLOOR, NOW);

describe('deployment and issuing authority', () => {
  it('commits authority at deployment and rejects a front-run claim', async () => {
    const s = await AmanaSimulator.create();
    expect(s.getLedger().protocolVersion).toBe(3n);
    await expect(s.as('stranger').claimAuthority()).rejects.toThrow('only the deployment authority');
    expect((await s.as('authority').claimAuthority()).bootstrapped).toBe(true);
  });
  it('refuses activation twice', async () => {
    const s = await setup();
    await expect(s.claimAuthority()).rejects.toThrow('already has an authority');
  });
  it('requires activation before lender admission', async () => {
    const s = await AmanaSimulator.create();
    await expect(s.registerLender(s.lenderKeyOf('A'))).rejects.toThrow('registry has no authority');
  });
  it('restricts lender admission to the authority', async () => {
    const s = await setup();
    await expect(s.as('stranger').registerLender(s.lenderKeyOf('A'))).rejects.toThrow('only the authority');
  });
  it('issues a commitment at the returned live index', async () => {
    const s = await setup('A');
    const a = await s.as('A').issueTo('amina', record());
    const l = s.getLedger();
    expect(l.issuedCount).toBe(1n);
    expect(toHex(l.issuers.lookup(0n))).toBe(toHex(s.lenderKeyOf('A')));
    expect(isLiveAttestation(l, s.walletOf('amina')[0])).toBe(true);
    expect(l.attestations.findPathForLeaf(pureCircuits.attestationCommitment(a))).toBeDefined();
  });
  it('rejects unregistered issuers', async () => {
    const s = await setup();
    await expect(s.as('A').issueTo('amina', record())).rejects.toThrow('not a registered lender');
  });
  it('rejects impersonated issuer keys', async () => {
    const s = await setup('A', 'B');
    const a = await s.as('A').issueTo('amina', record());
    await expect(s.as('B').issueRaw(a)).rejects.toThrow('not bound to the issuing lender');
  });
  it('rejects inflated counts', async () => {
    const s = await setup('A');
    await expect(s.as('A').issueTo('amina', { ...record(), total: 1n })).rejects.toThrow('on-time repayments exceed');
  });
  it('rejects reversed reporting intervals', async () => {
    const s = await setup('A');
    await expect(s.as('A').issueTo('amina', record(14n, NOW, FLOOR))).rejects.toThrow('invalid reporting interval');
  });
});

describe('handing over the registry', () => {
  const ZERO = new Uint8Array(32);
  it('changes authority only when the offered key accepts', async () => {
    const s = await setup();
    const successor = s.lenderKeyOf('successor');
    expect(toHex((await s.as('authority').proposeAuthority(successor)).pendingAuthority)).toBe(toHex(successor));
    expect(toHex(s.getLedger().authority)).toBe(toHex(s.lenderKeyOf('authority')));
    await expect(s.as('stranger').acceptAuthority()).rejects.toThrow('only the offered key');
    const l = await s.as('successor').acceptAuthority();
    expect(toHex(l.authority)).toBe(toHex(successor));
    expect(toHex(l.pendingAuthority)).toBe(toHex(ZERO));
    await expect(s.as('authority').registerLender(s.lenderKeyOf('A'))).rejects.toThrow('only the authority');
    expect((await s.as('successor').registerLender(s.lenderKeyOf('A'))).lenders.member(s.lenderKeyOf('A'))).toBe(true);
  });
  it('lets only the authority make an offer, and never to the zero key', async () => {
    const s = await setup();
    await expect(s.as('stranger').proposeAuthority(s.lenderKeyOf('stranger'))).rejects.toThrow('only the authority may hand over');
    await expect(s.as('authority').proposeAuthority(ZERO)).rejects.toThrow('must not be zero');
  });
  it('refuses acceptance when nothing is offered', async () => {
    const s = await setup();
    await expect(s.as('authority').acceptAuthority()).rejects.toThrow('no handover is pending');
  });
  it('replaces an earlier offer with a later one', async () => {
    const s = await setup();
    await s.as('authority').proposeAuthority(s.lenderKeyOf('first'));
    await s.proposeAuthority(s.lenderKeyOf('second'));
    await expect(s.as('first').acceptAuthority()).rejects.toThrow('only the offered key');
    expect(toHex((await s.as('second').acceptAuthority()).authority)).toBe(toHex(s.lenderKeyOf('second')));
  });
});

describe('withdrawing an issuer', () => {
  it('lets only the authority remove an institution', async () => {
    const s = await setup('A');
    await expect(s.as('stranger').removeLender(s.lenderKeyOf('A'))).rejects.toThrow('only the authority may remove');
    await expect(s.as('authority').removeLender(s.lenderKeyOf('B'))).rejects.toThrow('not a registered lender');
    expect((await s.removeLender(s.lenderKeyOf('A'))).lenders.member(s.lenderKeyOf('A'))).toBe(false);
  });
  it('stops a removed institution issuing or revoking', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record());
    await s.as('authority').removeLender(s.lenderKeyOf('A'));
    await expect(s.as('A').issueTo('amina', record())).rejects.toThrow('not a registered lender');
    await expect(s.as('A').revokeAttestation(0n)).rejects.toThrow('not a registered lender');
  });
  it('keeps its records live until the authority voids them, then refuses them', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record());
    await s.as('authority').removeLender(s.lenderKeyOf('A'));
    expect(isLiveAttestation(s.getLedger(), s.walletOf('amina')[0])).toBe(true);
    const l = await s.as('authority').revokeOrphanedAttestation(0n);
    expect(l.revokedCount).toBe(1n);
    expect(isLiveAttestation(l, s.walletOf('amina')[0])).toBe(false);
    const id = await request(s);
    await expect(s.as('amina').proveWithSelection(id, [0n])).rejects.toThrow('not live');
  });
  it('leaves the records of admitted institutions to their issuer', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record());
    await expect(s.as('authority').revokeOrphanedAttestation(0n)).rejects.toThrow('still admitted');
  });
  it('lets only the authority void orphaned records', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record());
    await s.as('authority').removeLender(s.lenderKeyOf('A'));
    await expect(s.as('stranger').revokeOrphanedAttestation(0n)).rejects.toThrow('only the authority may void');
    await expect(s.as('authority').revokeOrphanedAttestation(1n)).rejects.toThrow('no attestation at that index');
  });
});

describe('verifier-owned immutable checks', () => {
  it('rejects nonexistent checks without consuming a result', async () => {
    const s = await setup('A'), id = checkId('absent');
    await expect(s.as('amina').proveCreditStanding(id)).rejects.toThrow('check does not exist');
    expect(s.getLedger().acceptedCount).toBe(0n);
  });
  it('rejects squatting a known verifier ID even with its nonce', async () => {
    const s = await setup();
    const nonce = checkId('nonce');
    const id = pureCircuits.requestId(pureCircuits.verifierKey(s.secretKeyOf('verifier')), nonce);
    const recipient = pureCircuits.checkRecipient(s.secretKeyOf('amina'), id);
    await expect(s.as('attacker').createCheckRaw(id, nonce, recipient, 1n, 0n, NOW)).rejects.toThrow('not owned by this verifier');
    await s.as('verifier').createCheckRaw(id, nonce, recipient, 14n, FLOOR, NOW);
    expect(s.getLedger().requestedChecks.lookup(id).minOnTime).toBe(14n);
  });
  it('does not permit the owner to rewrite committed terms', async () => {
    const s = await setup(), id = await request(s);
    await expect(s.createCheckRaw(id, checkId('check'), s.getLedger().requestedChecks.lookup(id).recipient, 1n, 0n, NOW)).rejects.toThrow('check already exists');
    expect(s.getLedger().requestedChecks.lookup(id).minOnTime).toBe(14n);
  });
  it('rejects zero thresholds that would allow empty proofs', async () => {
    const s = await setup();
    await expect(request(s, 'zero', 'amina', 0n)).rejects.toThrow('threshold must be positive');
  });
  it('rejects zero recipient keys', async () => {
    const s = await setup(), nonce = checkId('zero');
    const id = pureCircuits.requestId(pureCircuits.verifierKey(s.getPrivateState().secretKey), nonce);
    await expect(s.createCheckRaw(id, nonce, new Uint8Array(32), 1n, FLOOR, NOW)).rejects.toThrow('recipient key must not be zero');
  });
  it('rejects reversed check windows', async () => {
    const s = await setup();
    await expect(s.createCheck(checkId('reverse'), 'amina', 1n, NOW, FLOOR)).rejects.toThrow('invalid check window');
  });
  it.each([-1n, 65536n])('rejects out-of-range thresholds (%s)', async (threshold) => {
    const s = await setup();
    await expect(request(s, 'bounds', 'amina', threshold)).rejects.toThrow();
  });
  it('prevents a credentialed observer intercepting a public check', async () => {
    const s = await setup('A');
    await s.as('A').issueTo('amina', record());
    await s.as('A').issueTo('attacker', record(50n));
    const id = await request(s);
    await expect(s.as('attacker').proveCreditStanding(id)).rejects.toThrow('different borrower');
    expect(s.getLedger().checks.member(id)).toBe(false);
    expect((await s.as('amina').proveCreditStanding(id)).checks.member(id)).toBe(true);
  });
  it('an empty outsider cannot consume a stronger check', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record());
    const id = await request(s);
    await expect(s.as('outsider').proveWithSelection(id, [])).rejects.toThrow('different borrower');
    expect(s.getLedger().requestedChecks.lookup(id).minOnTime).toBe(14n);
    await s.as('amina').proveCreditStanding(id);
  });
});

describe('private standing proofs', () => {
  it('aggregates 8 + 6 from two lenders against exact committed terms', async () => {
    const s = await setup('A', 'B');
    await s.as('A').issueTo('amina', record(8n)); await s.as('B').issueTo('amina', record(6n));
    const id = await request(s), result = (await s.as('amina').proveCreditStanding(id)).checks.lookup(id);
    expect(result.minOnTime).toBe(14n); expect(result.minPeriod).toBe(FLOOR); expect(result.maxPeriod).toBe(NOW);
    expect(Object.keys(result).sort()).toEqual(['maxPeriod', 'minOnTime', 'minPeriod', 'nullifier']);
  });
  it('records the threshold without disclosing the margin', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record(40n));
    const id = await request(s);
    expect((await s.as('amina').proveCreditStanding(id)).checks.lookup(id).minOnTime).toBe(14n);
  });
  it('fails one repayment short', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record(13n));
    const id = await request(s);
    await expect(s.as('amina').proveCreditStanding(id)).rejects.toThrow('insufficient on-time');
    expect(s.getLedger().checks.member(id)).toBe(false);
  });
  it('fails an empty intended borrower', async () => {
    const s = await setup(), id = await request(s);
    await expect(s.as('amina').proveCreditStanding(id)).rejects.toThrow('insufficient on-time');
  });
  it.each([[FLOOR - 1n, NOW], [FLOOR, NOW + 1n]])('rejects a summary outside either boundary (%s, %s)', async (start, end) => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record(14n, start, end));
    const id = await request(s);
    await expect(s.as('amina').proveWithSelection(id, [0n])).rejects.toThrow('outside the check window');
  });
  it('does not let a recent final payment make lifetime counts recent', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record(100n, 0n, NOW));
    const id = await request(s);
    await expect(s.as('amina').proveCreditStanding(id)).rejects.toThrow('insufficient on-time');
  });
  it('rejects another borrower credential even on a check addressed to the thief', async () => {
    const s = await setup('A'), a = await s.as('A').issueTo('amina', record());
    s.deliver('thief', a, 0n);
    const id = await request(s, 'theft', 'thief');
    await expect(s.as('thief').proveWithSelection(id, [0n])).rejects.toThrow('not issued to this borrower');
  });
  it('rejects modified repayment counts without a matching commitment', async () => {
    const s = await setup('A'), a = await s.as('A').issueTo('amina', record(1n));
    s.as('amina').privateState = { ...s.getPrivateState(), wallet: [{ attestation: { ...a, onTime: 99n, total: 99n }, leafIndex: 0n, lenderName: 'A' }] };
    const id = await request(s);
    await expect(s.as('amina').proveWithSelection(id, [0n])).rejects.toThrow('not live');
  });
  it('rejects counting a leaf twice', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record(8n)); const id = await request(s);
    await expect(s.as('amina').proveWithSelection(id, [0n, 0n])).rejects.toThrow('multiple summaries from one lender');
  });
  it('rejects overlapping snapshots from the same lender with different nonces', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record(8n)); await s.as('A').issueTo('amina', record(8n));
    const id = await request(s);
    await expect(s.as('amina').proveWithSelection(id, [0n, 1n])).rejects.toThrow('multiple summaries from one lender');
    expect(provableTotal(s.walletOf('amina'), FLOOR, NOW)).toBe(8n);
  });
  it('accepts independent lenders even if they use the same nonce', async () => {
    const s = await setup('A', 'B'), nonce = checkId('shared nonce');
    await s.as('A').issueTo('amina', record(8n), nonce); await s.as('B').issueTo('amina', record(6n), nonce);
    const id = await request(s); await s.as('amina').proveCreditStanding(id);
  });
  it('supports all four slots and caps automatic selection at four lenders', async () => {
    const s = await setup('A', 'B', 'C', 'D', 'E');
    for (const l of ['A', 'B', 'C', 'D', 'E']) await s.as(l).issueTo('amina', record(4n));
    const id = await request(s, 'four', 'amina', 16n);
    await s.as('amina').proveCreditStanding(id);
    expect(selectAttestations(s.walletOf('amina'), 20n, FLOOR, NOW)).toHaveLength(4);
    expect(provableTotal(s.walletOf('amina'), FLOOR, NOW)).toBe(16n);
  });
});

describe('revocation, selection, and replay', () => {
  it('rejects a revoked witness but retains a historical accepted check', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record());
    const before = await request(s, 'before'); await s.as('amina').proveCreditStanding(before);
    await s.as('A').revokeAttestation(0n);
    const after = await request(s, 'after');
    await expect(s.as('amina').proveWithSelection(after, [0n])).rejects.toThrow('not live');
    expect(s.getLedger().checks.member(before)).toBe(true);
  });
  it('only lets the issuer revoke, once', async () => {
    const s = await setup('A', 'B'); await s.as('A').issueTo('amina', record());
    await expect(s.as('B').revokeAttestation(0n)).rejects.toThrow('only the issuing lender');
    await s.as('A').revokeAttestation(0n);
    await expect(s.revokeAttestation(0n)).rejects.toThrow('no attestation at that index');
  });
  it('filters revoked stronger summaries and selects a sufficient live alternative', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record(99n)); await s.as('A').issueTo('amina', record());
    await s.as('A').revokeAttestation(0n); const id = await request(s);
    await s.as('amina').proveCreditStanding(id);
    expect(s.getPrivateState().presenting).toEqual([1n]);
  });
  it('accepts a proof built before another lender issued', async () => {
    const s = await setup('A', 'B'); await s.as('A').issueTo('amina', record());
    const id = await request(s);
    const view = s.getLedger();
    await s.as('B').issueTo('other', record());
    expect(s.getLedger().attestations.root()).not.toEqual(view.attestations.root());
    expect((await s.as('amina').proveAgainst(id, view)).checks.member(id)).toBe(true);
  });
  it('refuses a proof built before any revocation, even of another record', async () => {
    const s = await setup('A', 'B'); await s.as('A').issueTo('amina', record()); await s.as('B').issueTo('other', record());
    const id = await request(s);
    const view = s.getLedger();
    await s.as('B').revokeAttestation(1n);
    await expect(s.as('amina').proveAgainst(id, view)).rejects.toThrow('not live');
  });
  it('refuses a proof built before its own record was revoked', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record());
    const id = await request(s);
    const view = s.getLedger();
    await s.as('A').issueTo('other', record());
    await s.revokeAttestation(0n);
    await expect(s.as('amina').proveAgainst(id, view)).rejects.toThrow('not live');
  });
  it('does not consider the right commitment at the wrong index live', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record());
    expect(isLiveAttestation(s.getLedger(), { ...s.walletOf('amina')[0], leafIndex: 1n })).toBe(false);
  });
  it('cannot answer a check twice', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record()); const id = await request(s);
    await s.as('amina').proveCreditStanding(id);
    await expect(s.proveCreditStanding(id)).rejects.toThrow('already been answered');
  });
  it('uses distinct check recipients and nullifiers and separate verifier/lender key domains', async () => {
    const s = await setup('A'); await s.as('A').issueTo('amina', record());
    const a = await request(s, 'a'), b = await request(s, 'b');
    const ra = (await s.as('amina').proveCreditStanding(a)).checks.lookup(a);
    const rb = (await s.as('amina').proveCreditStanding(b)).checks.lookup(b);
    expect(toHex(ra.nullifier)).not.toBe(toHex(rb.nullifier));
    expect(toHex(s.getLedger().requestedChecks.lookup(a).recipient)).not.toBe(toHex(s.getLedger().requestedChecks.lookup(b).recipient));
    const sk = s.secretKeyOf('verifier');
    expect(toHex(pureCircuits.verifierKey(sk))).not.toBe(toHex(pureCircuits.lenderKey(sk)));
  });
  it('derives stable per-lender pseudonyms without a shared public borrower key', async () => {
    const s = await setup();
    expect(toHex(s.subjectIdOf('amina', 'A'))).toBe(toHex(s.subjectIdOf('amina', 'A')));
    expect(toHex(s.subjectIdOf('amina', 'A'))).not.toBe(toHex(s.subjectIdOf('amina', 'B')));
    expect(toHex(s.subjectIdOf('amina', 'A'))).not.toBe(toHex(s.subjectIdOf('other', 'A')));
  });
});

describe('public transcript privacy regression', () => {
  it('has an identical public transcript for one or four records satisfying the same check', async () => {
    const s = await setup('A', 'B', 'C', 'D', 'E');
    await s.as('A').issueTo('amina', record(14n));
    for (const l of ['B', 'C', 'D', 'E']) await s.as(l).issueTo('amina', record(4n));
    const id = await request(s);
    s.as('amina');
    const base = s.getPrivateState();
    const run = async (presenting: bigint[]) => {
      const context = s.contextFor('proveCreditStanding', { ...base, presenting });
      const results = await s.contract.impureCircuits.proveCreditStanding(context, id);
      return results.context.callProofDataTrace.at(-1)!;
    };
    const one = await run([0n]), four = await run([1n, 2n, 3n, 4n]);
    expect(one.publicTranscript).toEqual(four.publicTranscript);
    expect(one.input).toEqual(four.input);
    expect(one.privateTranscriptOutputs).not.toEqual(four.privateTranscriptOutputs);
  });
});
