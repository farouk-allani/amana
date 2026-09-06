// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject, firstValueFrom, filter, timeout } from 'rxjs';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { AmanaAPI, amanaPrivateStateKey, utils, type AmanaPrivateState, type AmanaProviders } from '../src/index.js';
import { AmanaSimulator } from '../../contract/src/test/amana-simulator.js';
import { createAmanaPrivateState } from '../../contract/src/witnesses.js';
vi.mock('@midnight-ntwrk/midnight-js-contracts', async (original) => ({
  ...await original<object>(), findDeployedContract: vi.fn(),
}));
setNetworkId('undeployed');
const address = 'ab'.repeat(32), now = 680n;
const rec = { onTime: 14n, total: 14n, periodStart: now - 23n, periodEnd: now };
const policy = { minOnTime: 14n, minPeriod: now - 23n, maxPeriod: now };

/** Real compiled circuits; network/finalization are simulated, not cryptographic proof generation. */
const harness = async () => {
  const sim = new AmanaSimulator();
  const ledger$ = new BehaviorSubject({ data: sim.circuitContext.currentQueryContext.state });
  const clients = new Map<string, { api: AmanaAPI; ps: AmanaPrivateState | null; calls: Record<string, ReturnType<typeof vi.fn>> }>();
  const client = async (actor: string) => {
    if (clients.has(actor)) return clients.get(actor)!;
    const box = { ps: createAmanaPrivateState(sim.secretKeyOf(actor)) as AmanaPrivateState | null };
    const calls: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const name of Object.keys(sim.contract.impureCircuits)) {
      calls[name] = vi.fn(async (...args: unknown[]) => {
        sim.as(actor);
        sim.circuitContext.currentPrivateState = box.ps!;
        const circuit = sim.contract.impureCircuits[name as keyof typeof sim.contract.impureCircuits];
        const result = (circuit as Function)(sim.circuitContext, ...args);
        sim.circuitContext = result.context;
        box.ps = result.context.currentPrivateState;
        ledger$.next({ data: sim.circuitContext.currentQueryContext.state });
        return { private: { result: result.result } };
      });
    }
    const found = { deployTxData: { public: { contractAddress: address } }, callTx: calls };
    vi.mocked(findDeployedContract).mockResolvedValueOnce(found as never);
    const providers = {
      privateStateProvider: { setContractAddress: vi.fn(), get: vi.fn(async () => box.ps),
        set: vi.fn(async (key: string, ps: AmanaPrivateState) => { expect(key).toBe(amanaPrivateStateKey); box.ps = ps; }) },
      publicDataProvider: { queryContractState: vi.fn(async () => ({ data: sim.circuitContext.currentQueryContext.state })),
        contractStateObservable: () => ledger$ },
    } as unknown as AmanaProviders;
    const api = await AmanaAPI.join(providers, address);
    const c = { api, get ps() { return box.ps; }, set ps(v) { box.ps = v; }, calls };
    clients.set(actor, c);
    return c;
  };
  const authority = await client('authority'); await authority.api.claimAuthority();
  const a = await client('A'), b = await client('B'), borrower = await client('amina'), verifier = await client('verifier');
  await authority.api.registerLender(await a.api.lenderKey()); await authority.api.registerLender(await b.api.lenderKey());
  const issue = async (who = a, counts = rec) => {
    const result = await who.api.issueAttestation({ ...counts, subject: await borrower.api.subjectIdFor(await who.api.lenderKey()) });
    return { ...result, text: utils.encodeCredential(result.attestation, result.leafIndex, 'Demo lender', address) };
  };
  const check = async () => {
    const draft = await verifier.api.draftCheck();
    const recipient = await borrower.api.checkRecipientFor(draft.checkId);
    await verifier.api.createCheck(draft, policy, recipient);
    return draft;
  };
  return { sim, client, authority, a, b, borrower, verifier, issue, check, ledger$ };
};

describe('API with compiled circuit integration', () => {
  it('runs admission, two-lender issuance, import, immutable check, proof, read, and revocation', async () => {
    const h = await harness();
    const a = await h.issue(h.a, { ...rec, onTime: 8n, total: 8n });
    const b = await h.issue(h.b, { ...rec, onTime: 6n, total: 7n });
    expect([a.leafIndex, b.leafIndex]).toEqual([0n, 1n]);
    await h.borrower.api.importCredential(a.text); await h.borrower.api.importCredential(b.text);
    const draft = await h.check();
    await h.borrower.api.proveCreditStanding(draft.checkId);
    expect(h.borrower.calls.proveCreditStanding).toHaveBeenCalledWith(utils.keyBytes(draft.checkId));
    expect(h.borrower.ps?.presenting).toEqual([]);
    const outcome = await h.verifier.api.readCheck(draft.checkId);
    expect(outcome.answered).toBe(true); expect(outcome.result?.minOnTime).toBe(14n);
    await h.a.api.revokeAttestation(a.leafIndex);
    const next = await h.check();
    await expect(h.borrower.api.proveCreditStanding(next.checkId)).rejects.toThrow('do not meet');
    expect((await h.verifier.api.readCheck(draft.checkId)).answered).toBe(true);
  });
  it('emits an updated wallet immediately after import without a ledger event', async () => {
    const h = await harness(), issued = await h.issue();
    const updated = firstValueFrom(h.borrower.api.state$.pipe(filter((s) => s.wallet.liveCount === 1), timeout(2000)));
    await h.borrower.api.importCredential(issued.text);
    expect((await updated).wallet.attestations[0].leafIndex).toBe(0n);
  });
  it('updates liveness on a public revocation event', async () => {
    const h = await harness(), issued = await h.issue(); await h.borrower.api.importCredential(issued.text);
    const updated = firstValueFrom(h.borrower.api.state$.pipe(filter((s) => s.wallet.liveCount === 0 && s.wallet.attestations.length === 1), timeout(2000)));
    await h.a.api.revokeAttestation(issued.leafIndex);
    expect((await updated).wallet.attestations[0].live).toBe(false);
  });
  it('rejects duplicate imports', async () => {
    const h = await harness(), issued = await h.issue(); await h.borrower.api.importCredential(issued.text);
    await expect(h.borrower.api.importCredential(issued.text)).rejects.toThrow('already in your wallet');
    expect(h.borrower.ps?.wallet).toHaveLength(1);
  });
  it('rejects another borrower and another registry', async () => {
    const h = await harness(), issued = await h.issue();
    const thief = await h.client('thief');
    await expect(thief.api.importCredential(issued.text)).rejects.toThrow('different borrower');
    const p = JSON.parse(issued.text); p.contractAddress = 'cd'.repeat(32);
    await expect(h.borrower.api.importCredential(JSON.stringify(p))).rejects.toThrow('different registry');
  });
  it('rejects revoked and wrong-index credentials', async () => {
    const h = await harness(), issued = await h.issue();
    await h.issue(h.b);
    await expect(h.borrower.api.receiveAttestation(issued.attestation, 1n)).rejects.toThrow('not live');
    await h.a.api.revokeAttestation(issued.leafIndex);
    await expect(h.borrower.api.importCredential(issued.text)).rejects.toThrow('not live');
  });
  it('distinguishes missing, pending, and answered checks', async () => {
    const h = await harness(), d = await h.verifier.api.draftCheck();
    expect((await h.verifier.api.readCheck(d.checkId)).exists).toBe(false);
    await h.verifier.api.createCheck(d, policy, await h.borrower.api.checkRecipientFor(d.checkId));
    const pending = await h.verifier.api.readCheck(d.checkId);
    expect(pending.exists).toBe(true); expect(pending.answered).toBe(false); expect(pending.terms?.minOnTime).toBe(14n);
  });
  it('rejects an outsider before spending a proof transaction', async () => {
    const h = await harness(), draft = await h.check(), outsider = await h.client('outsider');
    await expect(outsider.api.proveCreditStanding(draft.checkId)).rejects.toThrow('different borrower');
    expect(outsider.calls.proveCreditStanding).not.toHaveBeenCalled();
  });
  it('filters revoked strong records before choosing a live summary', async () => {
    const h = await harness();
    const strong = await h.issue(h.a, { ...rec, onTime: 99n, total: 99n }), normal = await h.issue();
    await h.borrower.api.importCredential(strong.text); await h.borrower.api.importCredential(normal.text);
    await h.a.api.revokeAttestation(strong.leafIndex);
    const d = await h.check(); await h.borrower.api.proveCreditStanding(d.checkId);
    expect((await h.verifier.api.readCheck(d.checkId)).answered).toBe(true);
  });
  it('clears private presentation state after a transaction failure', async () => {
    const h = await harness(), issued = await h.issue(); await h.borrower.api.importCredential(issued.text);
    const d = await h.check(); h.borrower.calls.proveCreditStanding.mockRejectedValueOnce(new Error('network failed'));
    await expect(h.borrower.api.proveCreditStanding(d.checkId)).rejects.toThrow('network failed');
    expect(h.borrower.ps?.presenting).toEqual([]);
    await h.borrower.api.proveCreditStanding(d.checkId);
  });
  it('clears pending issuance and recovers the operation queue after failure', async () => {
    const h = await harness(); h.a.calls.issueAttestation.mockRejectedValueOnce(new Error('cancelled'));
    await expect(h.issue()).rejects.toThrow('cancelled'); expect(h.a.ps?.pending).toBeNull();
    expect((await h.issue()).leafIndex).toBe(0n);
  });
  it('serializes simultaneous issues so private witnesses cannot overwrite each other', async () => {
    const h = await harness();
    const results = await Promise.all([h.issue(h.a, { ...rec, onTime: 8n }), h.issue(h.a, { ...rec, onTime: 6n })]);
    expect(results.map((r) => r.leafIndex)).toEqual([0n, 1n]);
    for (const r of results) await h.borrower.api.importCredential(r.text);
    expect(h.borrower.ps?.wallet.map((s) => s.attestation.onTime)).toEqual([8n, 6n]);
  });
  it('does not silently replace a missing private identity', async () => {
    const h = await harness(); h.borrower.ps = null;
    await expect(h.borrower.api.lenderKey()).rejects.toThrow('private state is missing');
  });
});

describe('credential input boundary', () => {
  it.each(['zz'.repeat(32), 'a'.repeat(63), '1g'.repeat(32)])('rejects malformed keys (%s)', (key) => {
    expect(() => utils.keyBytes(key)).toThrow();
  });
  it.each(['', '-1', '1.2', '1e5', '65536'])('handles partial or invalid numeric input (%s)', (value) => {
    expect(utils.parseUint(value)).toBeNull();
  });
  it('rejects version 1 credentials instead of inventing a reporting start', () => {
    expect(() => utils.decodeCredential('{"v":1,"attestation":{}}')).toThrow('reissuance');
  });
  it('rejects malformed credential counts, intervals, and leaf indices', async () => {
    const h = await harness(), issued = await h.issue();
    for (const mutate of [
      (p: any) => { p.attestation.onTime = '65536'; },
      (p: any) => { p.attestation.periodStart = '999'; },
      (p: any) => { p.leafIndex = '1024'; },
      (p: any) => { p.attestation.total = null; },
    ]) { const p = JSON.parse(issued.text); mutate(p); expect(() => utils.decodeCredential(JSON.stringify(p))).toThrow(); }
  });
});
