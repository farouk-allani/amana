// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { AmanaSimulator } from './amana-simulator.js';
import { checkId, randomBytes, toHex } from './utils.js';
import { pureCircuits } from '../managed/amana/contract/index.js';
import { selectAttestations, provableTotal, type StoredAttestation } from '../witnesses.js';

setNetworkId('undeployed');

// Period indices are months since a fixed epoch. `NOW` stands in for the
// month a test runs in; a 24-month recency window is `NOW - 24`.
const NOW = 320n;
const TWO_YEARS = NOW - 24n;

/** A registry with an authority and two registered microfinance institutions. */
const registryWithLenders = (...lenders: string[]): AmanaSimulator => {
  const sim = new AmanaSimulator('authority');
  sim.as('authority').claimAuthority();
  for (const lender of lenders) {
    sim.as('authority').registerLender(sim.lenderKeyOf(lender));
  }
  return sim;
};

describe('registry governance', () => {
  it('gives the registry to whoever claims it first', () => {
    const sim = new AmanaSimulator('authority');
    const led = sim.as('authority').claimAuthority();
    expect(led.bootstrapped).toBe(true);
    expect(toHex(led.authority)).toEqual(toHex(sim.lenderKeyOf('authority')));
  });

  it('refuses a second claim', () => {
    const sim = new AmanaSimulator('authority');
    sim.as('authority').claimAuthority();
    expect(() => sim.as('usurper').claimAuthority()).toThrow(
      'failed assert: registry already has an authority',
    );
  });

  it('will not register a lender before an authority exists', () => {
    const sim = new AmanaSimulator('authority');
    expect(() => sim.as('authority').registerLender(sim.lenderKeyOf('enda'))).toThrow(
      'failed assert: registry has no authority yet',
    );
  });

  it('lets only the authority admit lenders', () => {
    const sim = new AmanaSimulator('authority');
    sim.as('authority').claimAuthority();
    expect(() => sim.as('impostor').registerLender(sim.lenderKeyOf('impostor'))).toThrow(
      'failed assert: only the authority may register lenders',
    );
  });

  it('admits a lender to the issuing set', () => {
    const sim = registryWithLenders('enda');
    expect(sim.getLedger().lenders.member(sim.lenderKeyOf('enda'))).toBe(true);
    expect(sim.getLedger().lenders.member(sim.lenderKeyOf('stranger'))).toBe(false);
  });
});

describe('issuance', () => {
  it('records a commitment and nothing else', () => {
    const sim = registryWithLenders('enda');
    sim.as('enda').issueTo('amina', { onTime: 14n, total: 14n, period: NOW - 1n });

    const led = sim.getLedger();
    expect(led.issuedCount).toEqual(1n);
    expect(led.nextLeaf).toEqual(1n);
    expect(led.issuers.member(0n)).toBe(true);
    expect(toHex(led.issuers.lookup(0n))).toEqual(toHex(sim.lenderKeyOf('enda')));
  });

  it('refuses an unregistered institution', () => {
    const sim = registryWithLenders('enda');
    expect(() =>
      sim.as('loanshark').issueTo('amina', { onTime: 99n, total: 99n, period: NOW }),
    ).toThrow('failed assert: not a registered lender');
  });

  it('refuses an on-time count larger than the number of repayments', () => {
    const sim = registryWithLenders('enda');
    expect(() =>
      sim.as('enda').issueTo('amina', { onTime: 15n, total: 14n, period: NOW }),
    ).toThrow('failed assert: on-time repayments exceed total repayments');
  });

  it('refuses a record a lender tried to attribute to a different lender', () => {
    const sim = registryWithLenders('enda', 'taysir');
    // `enda` signs the transaction, but the record names `taysir` as issuer.
    const forged = {
      lender: sim.lenderKeyOf('taysir'),
      subject: sim.subjectIdOf('amina', 'taysir'),
      onTime: 20n,
      total: 20n,
      period: NOW,
      nonce: randomBytes(32),
    };
    expect(() => sim.as('enda').issueRaw(forged)).toThrow(
      'failed assert: attestation is not bound to the issuing lender',
    );
  });

  it('never writes an amount, a term, or a subject to the ledger', () => {
    const sim = registryWithLenders('enda');
    sim.as('enda').issueTo('amina', { onTime: 14n, total: 14n, period: NOW - 1n });

    // The full public state, serialised. If any private field leaked into the
    // ledger it would have to appear here.
    const led = sim.getLedger();
    const publicView = JSON.stringify(
      {
        authority: toHex(led.authority),
        bootstrapped: led.bootstrapped,
        lenders: [...led.lenders].map(toHex),
        issuers: [...led.issuers].map(([k, v]) => [k.toString(), toHex(v)]),
        nextLeaf: led.nextLeaf.toString(),
        nullifiers: [...led.nullifiers].map(toHex),
        checks: [...led.checks].map(([k]) => toHex(k)),
        issuedCount: led.issuedCount.toString(),
        revokedCount: led.revokedCount.toString(),
        acceptedCount: led.acceptedCount.toString(),
      },
      null,
      0,
    );

    const record = sim.walletOf('amina')[0]!.attestation;
    // The borrower's pseudonym at this lender is private state, not ledger state.
    expect(publicView).not.toContain(toHex(record.subject));
    expect(publicView).not.toContain(toHex(record.nonce));
    // And the tree stores the commitment, never the preimage.
    expect(publicView).not.toContain(toHex(pureCircuits.attestationCommitment(record)));
  });
});

describe('proving a credit standing', () => {
  it('clears a bar it exactly meets', () => {
    const sim = registryWithLenders('enda');
    sim.as('enda').issueTo('amina', { onTime: 14n, total: 14n, period: NOW - 1n });

    const id = checkId('taysir-loan-1');
    const led = sim.as('amina').proveCreditStanding(id, 14n, TWO_YEARS);

    expect(led.acceptedCount).toEqual(1n);
    expect(led.checks.member(id)).toBe(true);
    expect(led.checks.lookup(id).minOnTime).toEqual(14n);
  });

  it('fails one repayment short of the bar', () => {
    const sim = registryWithLenders('enda');
    sim.as('enda').issueTo('amina', { onTime: 13n, total: 14n, period: NOW - 1n });

    expect(() =>
      sim.as('amina').proveCreditStanding(checkId('short'), 14n, TWO_YEARS),
    ).toThrow('failed assert: insufficient on-time repayments');
  });

  it('adds up records from institutions that cannot see each other', () => {
    const sim = registryWithLenders('enda', 'taysir');
    sim.as('enda').issueTo('amina', { onTime: 8n, total: 8n, period: NOW - 2n });
    sim.as('taysir').issueTo('amina', { onTime: 6n, total: 7n, period: NOW - 1n });

    const led = sim.as('amina').proveCreditStanding(checkId('third-lender'), 14n, TWO_YEARS);
    expect(led.acceptedCount).toEqual(1n);
  });

  it('rejects a record older than the verifier is willing to accept', () => {
    const sim = registryWithLenders('enda');
    // Repaid, but the last repayment was more than two years ago.
    sim.as('enda').issueTo('amina', { onTime: 20n, total: 20n, period: NOW - 30n });

    expect(() =>
      sim.as('amina').proveCreditStanding(checkId('stale'), 14n, TWO_YEARS),
    ).toThrow(/outside the recency window|insufficient on-time repayments/);
  });

  it('will not let a borrower present another borrower\'s record', () => {
    const sim = registryWithLenders('enda');
    sim.as('enda').issueTo('amina', { onTime: 20n, total: 20n, period: NOW });

    // Youssef obtains a copy of Amina's record — the exact bytes, and its real
    // leaf index. It is committed on chain and perfectly valid. It is simply
    // not his.
    const aminas = sim.walletOf('amina')[0]!;
    sim.deliver('youssef', aminas.attestation, aminas.leafIndex, 'enda');

    expect(() =>
      sim.as('youssef').proveCreditStanding(checkId('theft'), 14n, TWO_YEARS),
    ).toThrow('failed assert: attestation was not issued to this borrower');
  });

  it('will not count one record twice', () => {
    const sim = registryWithLenders('enda');
    sim.as('enda').issueTo('amina', { onTime: 8n, total: 8n, period: NOW });

    // An honest client would never do this, so the test reaches past it.
    expect(() =>
      sim
        .as('amina')
        .proveWithSelection(checkId('double'), 16n, TWO_YEARS, [0n, 0n]),
    ).toThrow(/duplicate attestation|insufficient on-time repayments/);
  });

  it('cannot prove anything from an empty wallet', () => {
    const sim = registryWithLenders('enda');
    expect(() =>
      sim.as('nobody').proveCreditStanding(checkId('empty'), 1n, TWO_YEARS),
    ).toThrow('failed assert: insufficient on-time repayments');
  });

  it('records the bar that was cleared, never the margin', () => {
    const sim = registryWithLenders('enda');
    sim.as('enda').issueTo('amina', { onTime: 40n, total: 40n, period: NOW });

    const id = checkId('margin');
    const led = sim.as('amina').proveCreditStanding(id, 14n, TWO_YEARS);

    const result = led.checks.lookup(id);
    expect(result.minOnTime).toEqual(14n); // the bar
    expect(result.minOnTime).not.toEqual(40n); // not the true total
  });
});

describe('revocation', () => {
  it('stops a revoked record from being provable', () => {
    const sim = registryWithLenders('enda');
    sim.as('enda').issueTo('amina', { onTime: 14n, total: 14n, period: NOW });

    // The record proves fine before revocation.
    sim.as('amina').proveCreditStanding(checkId('before'), 14n, TWO_YEARS);

    sim.as('enda').revokeAttestation(0n);
    expect(sim.getLedger().revokedCount).toEqual(1n);

    expect(() =>
      sim.as('amina').proveCreditStanding(checkId('after'), 14n, TWO_YEARS),
    ).toThrow('failed assert: attestation is not live in the registry');
  });

  it('lets only the issuing lender revoke', () => {
    const sim = registryWithLenders('enda', 'taysir');
    sim.as('enda').issueTo('amina', { onTime: 14n, total: 14n, period: NOW });

    expect(() => sim.as('taysir').revokeAttestation(0n)).toThrow(
      'failed assert: only the issuing lender may revoke',
    );
  });

  it('refuses to revoke a leaf that was never issued', () => {
    const sim = registryWithLenders('enda');
    expect(() => sim.as('enda').revokeAttestation(7n)).toThrow(
      'failed assert: no attestation at that index',
    );
  });

  it('leaves other borrowers unaffected', () => {
    const sim = registryWithLenders('enda');
    sim.as('enda').issueTo('amina', { onTime: 14n, total: 14n, period: NOW });
    sim.as('enda').issueTo('youssef', { onTime: 14n, total: 14n, period: NOW });

    sim.as('enda').revokeAttestation(0n); // Amina's

    const led = sim.as('youssef').proveCreditStanding(checkId('unaffected'), 14n, TWO_YEARS);
    expect(led.acceptedCount).toEqual(1n);
  });
});

describe('nullifiers', () => {
  it('stops a borrower answering the same check twice', () => {
    const sim = registryWithLenders('enda');
    sim.as('enda').issueTo('amina', { onTime: 14n, total: 14n, period: NOW });

    const id = checkId('once');
    sim.as('amina').proveCreditStanding(id, 14n, TWO_YEARS);

    expect(() => sim.as('amina').proveCreditStanding(id, 14n, TWO_YEARS)).toThrow(
      'failed assert: check has already been answered',
    );
  });

  it('burns a different nullifier for every check', () => {
    const sim = registryWithLenders('enda');
    sim.as('enda').issueTo('amina', { onTime: 14n, total: 14n, period: NOW });

    const a = checkId('lender-a');
    const b = checkId('lender-b');
    sim.as('amina').proveCreditStanding(a, 14n, TWO_YEARS);
    sim.as('amina').proveCreditStanding(b, 14n, TWO_YEARS);

    const led = sim.getLedger();
    const nullA = toHex(led.checks.lookup(a).nullifier);
    const nullB = toHex(led.checks.lookup(b).nullifier);

    // Two answers by the same person, with nothing on chain linking them.
    expect(nullA).not.toEqual(nullB);
    expect(led.nullifiers.size()).toEqual(2n);
    expect(led.acceptedCount).toEqual(2n);
  });
});

describe('unlinkability of borrower pseudonyms', () => {
  it('shows a different identifier to every lender', () => {
    const sim = new AmanaSimulator('authority');
    const atEnda = sim.subjectIdOf('amina', 'enda');
    const atTaysir = sim.subjectIdOf('amina', 'taysir');

    // Two institutions comparing their customer books learn nothing.
    expect(toHex(atEnda)).not.toEqual(toHex(atTaysir));
  });

  it('is stable for the same borrower at the same lender', () => {
    const sim = new AmanaSimulator('authority');
    expect(toHex(sim.subjectIdOf('amina', 'enda'))).toEqual(
      toHex(sim.subjectIdOf('amina', 'enda')),
    );
  });

  it('distinguishes two borrowers at one lender', () => {
    const sim = new AmanaSimulator('authority');
    expect(toHex(sim.subjectIdOf('amina', 'enda'))).not.toEqual(
      toHex(sim.subjectIdOf('youssef', 'enda')),
    );
  });
});

describe('selection policy', () => {
  const stored = (leafIndex: bigint, onTime: bigint, period: bigint): StoredAttestation => ({
    leafIndex,
    lenderName: 'test',
    attestation: {
      lender: new Uint8Array(32),
      subject: new Uint8Array(32),
      onTime,
      total: onTime,
      period,
      nonce: new Uint8Array(32),
    },
  });

  it('presents as few records as clear the bar', () => {
    const wallet = [stored(0n, 10n, NOW), stored(1n, 8n, NOW), stored(2n, 6n, NOW)];
    // 10 alone clears a bar of 9.
    expect(selectAttestations(wallet, 9n, TWO_YEARS)).toEqual([0n]);
    // 10 + 8 are needed for 17.
    expect(selectAttestations(wallet, 17n, TWO_YEARS)).toEqual([0n, 1n]);
  });

  it('drops records outside the recency window before choosing', () => {
    const wallet = [stored(0n, 30n, NOW - 40n), stored(1n, 8n, NOW)];
    expect(selectAttestations(wallet, 5n, TWO_YEARS)).toEqual([1n]);
  });

  it('never presents more than the circuit has slots for', () => {
    const wallet = [
      stored(0n, 1n, NOW),
      stored(1n, 1n, NOW),
      stored(2n, 1n, NOW),
      stored(3n, 1n, NOW),
      stored(4n, 1n, NOW),
    ];
    expect(selectAttestations(wallet, 99n, TWO_YEARS).length).toBeLessThanOrEqual(4);
  });

  it('reports what a wallet could prove', () => {
    const wallet = [stored(0n, 10n, NOW), stored(1n, 8n, NOW - 40n)];
    expect(provableTotal(wallet, TWO_YEARS)).toEqual(10n);
  });
});
