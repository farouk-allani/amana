// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Development only: a sample registry held in memory, for previewing every
 * screen without Lace, a proof server or a network.
 *
 * Nothing here touches a chain. Institutions are fictional ("Institution A"),
 * keys are made up, and transactions are simulated by reporting the same
 * stages the real provider set reports, on a shortened clock. The module is
 * only ever loaded behind `import.meta.env.DEV`, so production builds do not
 * contain it.
 *
 * Query parameters, read once at start:
 * - `sample=empty`: a new participant with nothing issued or held;
 * - `realtime`: real durations (about 100 s per proof, 25 s otherwise);
 * - `fail=<stage>`: every transaction fails at that stage, to preview errors.
 *
 * @module
 */

import { BehaviorSubject, type Observable } from 'rxjs';

import type {
  AmanaDerivedState,
  CheckDraft,
  CheckOutcome,
  CheckPolicy,
  IssuedAttestation,
  RepaymentRecord,
  StoredAttestation,
  WalletEntry,
} from '../../../api/src/index.js';
import { utils } from '../../../api/src/index.js';
import { provableTotal, selectAttestations } from '../../../contract/src/witnesses.js';
import type { AmanaClient } from '../client.js';
import { ProofServerError } from '../stage-reporting.js';
import { reportStage, type TxStage } from '../transactions.js';

/** A made-up but stable 32-byte value, as hex. */
const fake = (...parts: string[]): string => {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const out: string[] = [];
  const text = parts.join('|');
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < text.length; j++) {
      h1 = Math.imul(h1 ^ text.charCodeAt(j), 16777619) >>> 0;
      h2 = Math.imul(h2 + text.charCodeAt(j) + i, 2246822519) >>> 0;
    }
    out.push(((h1 ^ h2) >>> 0).toString(16).padStart(8, '0'));
    h1 = Math.imul(h1, 2654435761) >>> 0;
  }
  return out.join('');
};

const bytes = (hex: string): Uint8Array => utils.hexToBytes(hex);
const hex = (b: Uint8Array): string => utils.bytesToHex(b);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const params = new URLSearchParams(window.location.search);
const scenario = params.get('sample') === 'empty' ? 'empty' : 'full';
const realtime = params.has('realtime');
const failAt = params.get('fail') as TxStage | null;

/**
 * Walk the five stages on a clock. Proofs take about 100 seconds for real;
 * here 9 seconds unless `realtime` is set.
 */
const simulate = async (kind: 'proof' | 'transaction'): Promise<void> => {
  const total = (kind === 'proof' ? 100 : 25) * 1000 * (realtime ? 1 : 0.09);
  const plan: [TxStage, number][] = [
    ['prepare', 0.06],
    ['prove', kind === 'proof' ? 0.66 : 0.5],
    ['approve', 0.1],
    ['submit', 0.06],
    ['confirm', 0.12],
  ];
  for (const [stage, share] of plan) {
    reportStage(stage);
    await sleep(total * share);
    if (failAt === stage) {
      // The same errors the real provider set produces at each stage.
      throw stage === 'prove'
        ? new ProofServerError(
            new Error('Failed Proof Server response: url="http://localhost:6300/prove", code="502", status="Bad Gateway"'),
          )
        : stage === 'approve'
          ? Object.assign(new Error('The user rejected the request'), { type: 'DAppConnectorAPIError', code: 'Rejected' })
          : new Error('Indexer websocket closed before the transaction was seen');
    }
  }
};

const ME = fake('this device');
const LENDER_B = fake('institution b');
const LENDER_C = fake('institution c');
const LENDER_D = fake('institution d');
const REGISTRY = fake('sample registry');
const PENDING_CHECK = fake('check', 'pending');
const ANSWERED_CHECK = fake('check', 'answered');

// For screenshots and manual testing in development: the sample's check IDs.
(window as unknown as { amanaSample?: object }).amanaSample = { pendingCheck: PENDING_CHECK, answeredCheck: ANSWERED_CHECK };

/** Period index of a UTC year and month (1–12). */
const month = (year: number, m: number): bigint => BigInt((year - 1970) * 12 + (m - 1));

const record = (lender: string, onTime: bigint, total: bigint, from: bigint, to: bigint, seed: string) => ({
  lender: bytes(lender),
  subject: bytes(fake('subject', lender)),
  onTime,
  total,
  periodStart: from,
  periodEnd: to,
  nonce: bytes(fake('nonce', seed)),
});

type Check = { terms: NonNullable<CheckOutcome['terms']>; result?: NonNullable<CheckOutcome['result']> };

class SampleRegistry implements AmanaClient {
  readonly deployedContractAddress = REGISTRY;

  private authority = ME;
  private pending: string | null = null;
  private bootstrapped = true;
  private lenders: string[] = [ME, LENDER_B];
  private issuers = new Map<bigint, string>();
  private issued = 0n;
  private revoked = 0n;
  private answered = 0n;
  private wallet: (StoredAttestation & { live: boolean })[] = [];
  private checks = new Map<string, Check>();
  private readonly subject = new BehaviorSubject<AmanaDerivedState>(null as unknown as AmanaDerivedState);
  readonly state$: Observable<AmanaDerivedState> = this.subject.asObservable();

  constructor() {
    if (scenario === 'full') {
      // Institution A is this device, so the issuer screen has records too.
      const a = record(ME, 8n, 8n, month(2025, 1), month(2025, 12), 'a');
      const b = record(LENDER_B, 6n, 7n, month(2025, 1), month(2025, 12), 'b');
      const c = record(LENDER_C, 5n, 6n, month(2024, 1), month(2024, 6), 'c');
      this.issuers.set(0n, ME);
      this.issuers.set(1n, LENDER_B);
      // Leaf 2 (Institution C) was revoked by its issuer: gone from the map.
      // Leaf 3 belongs to Institution D, since withdrawn, awaiting voiding.
      this.issuers.set(3n, LENDER_D);
      this.issued = 4n;
      this.revoked = 1n;
      this.answered = 1n;
      // One check already committed to this device, and one answered, so the
      // borrower's review and the verifier's receipt can be seen at once.
      const now = utils.currentPeriod();
      const terms = (id: string) => ({
        verifier: bytes(fake('verifier', ME)),
        recipient: bytes(fake('recipient', id, ME)),
        minOnTime: 14n,
        minPeriod: now - 23n,
        maxPeriod: now,
      });
      this.checks.set(PENDING_CHECK, { terms: terms(PENDING_CHECK) });
      this.checks.set(ANSWERED_CHECK, {
        terms: terms(ANSWERED_CHECK),
        result: { minOnTime: 14n, minPeriod: now - 23n, maxPeriod: now, nullifier: bytes(fake('nullifier')) },
      });
      this.wallet = [
        { attestation: a, leafIndex: 0n, lenderName: 'Institution A', live: true },
        { attestation: b, leafIndex: 1n, lenderName: 'Institution B', live: true },
        { attestation: c, leafIndex: 2n, lenderName: 'Institution C', live: false },
      ];
    } else {
      this.lenders = [LENDER_B];
      this.authority = LENDER_B;
    }
    this.emit();
  }

  private emit(): void {
    const entries: WalletEntry[] = this.wallet.map((w) => ({ ...w }));
    const live = entries.filter((e) => e.live);
    this.subject.next({
      registry: {
        bootstrapped: this.bootstrapped,
        authority: this.authority,
        lenders: [...this.lenders],
        attestationsIssued: this.issued,
        attestationsRevoked: this.revoked,
        checksAnswered: this.answered,
        nextLeaf: this.issued,
        issuers: new Map(this.issuers),
        pendingAuthority: this.pending,
        orphanedLeaves: [...this.issuers].filter(([, l]) => !this.lenders.includes(l)).map(([leaf]) => leaf),
      },
      identity: {
        lenderKey: ME,
        isRegisteredLender: this.lenders.includes(ME),
        isAuthority: this.authority === ME,
        isPendingAuthority: this.pending === ME,
      },
      wallet: {
        attestations: entries,
        liveCount: live.length,
        provableOnTime: provableTotal(live, 0n, utils.currentPeriod()),
      },
    });
  }

  async subjectIdFor(lenderKeyHex: string): Promise<string> {
    await sleep(150);
    return fake('subject', lenderKeyHex.toLowerCase());
  }

  async claimAuthority(): Promise<void> {
    await simulate('transaction');
    this.bootstrapped = true;
    this.authority = ME;
    this.emit();
  }

  async registerLender(key: string): Promise<void> {
    await simulate('transaction');
    if (!this.lenders.includes(key)) this.lenders.push(key);
    this.emit();
  }

  async removeLender(key: string): Promise<void> {
    if (!this.lenders.includes(key)) throw new Error('That institution is not admitted.');
    await simulate('transaction');
    this.lenders = this.lenders.filter((l) => l !== key);
    this.emit();
  }

  async revokeOrphanedAttestation(leafIndex: bigint): Promise<void> {
    await simulate('transaction');
    this.issuers.delete(leafIndex);
    this.revoked += 1n;
    this.emit();
  }

  async proposeAuthority(key: string): Promise<void> {
    await simulate('transaction');
    this.pending = key;
    this.emit();
  }

  async acceptAuthority(): Promise<void> {
    await simulate('transaction');
    this.authority = ME;
    this.pending = null;
    this.emit();
  }

  async issueAttestation(r: RepaymentRecord): Promise<IssuedAttestation> {
    if (!this.lenders.includes(ME)) throw new Error('failed assert: lender is not registered');
    await simulate('transaction');
    const leafIndex = this.issued;
    this.issued += 1n;
    this.issuers.set(leafIndex, ME);
    this.emit();
    return {
      leafIndex,
      attestation: {
        lender: bytes(ME),
        subject: bytes(r.subject),
        onTime: r.onTime,
        total: r.total,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        nonce: utils.randomBytes(32),
      },
    };
  }

  async revokeAttestation(leafIndex: bigint): Promise<void> {
    if (this.issuers.get(leafIndex) !== ME) throw new Error('failed assert: only the issuing lender may revoke');
    await simulate('transaction');
    this.issuers.delete(leafIndex);
    this.revoked += 1n;
    this.wallet = this.wallet.map((w) => (w.leafIndex === leafIndex ? { ...w, live: false } : w));
    this.emit();
  }

  async importCredential(text: string): Promise<void> {
    await sleep(300);
    const c = utils.decodeCredential(text);
    if (c.contractAddress !== REGISTRY) throw new Error('This credential was issued by a different registry.');
    if (this.wallet.some((w) => w.leafIndex === c.leafIndex)) throw new Error('This credential is already in your wallet.');
    this.wallet.push({
      attestation: c.attestation,
      leafIndex: c.leafIndex,
      lenderName: c.lenderName,
      live: this.issuers.has(c.leafIndex),
    });
    this.emit();
  }

  async draftCheck(): Promise<CheckDraft> {
    await sleep(150);
    const nonce = hex(utils.randomBytes(32));
    return { checkId: fake('check', nonce), nonce, verifier: fake('verifier', ME) };
  }

  async checkRecipientFor(checkId: string): Promise<string> {
    await sleep(150);
    return fake('recipient', checkId.toLowerCase(), ME);
  }

  async createCheck(draft: CheckDraft, policy: CheckPolicy, recipient: string): Promise<void> {
    if (this.checks.has(draft.checkId)) throw new Error('failed assert: check already exists');
    await simulate('transaction');
    this.checks.set(draft.checkId, {
      terms: {
        verifier: bytes(draft.verifier),
        recipient: bytes(recipient),
        minOnTime: policy.minOnTime,
        minPeriod: policy.minPeriod,
        maxPeriod: policy.maxPeriod,
      },
    });
    this.emit();
  }

  async proveCreditStanding(checkId: string): Promise<void> {
    const check = this.checks.get(checkId);
    if (!check) throw new Error('The verifier has not committed this check yet.');
    if (check.result) throw new Error('This check has already been answered.');
    if (hex(check.terms.recipient) !== (await this.checkRecipientFor(checkId)))
      throw new Error('This check is for a different borrower.');
    const live = this.wallet.filter((w) => w.live);
    if (provableTotal(live, check.terms.minPeriod, check.terms.maxPeriod) < check.terms.minOnTime)
      throw new Error('Your live summaries do not meet the committed threshold and reporting window.');
    void selectAttestations(live, check.terms.minOnTime, check.terms.minPeriod, check.terms.maxPeriod);
    await simulate('proof');
    check.result = {
      minOnTime: check.terms.minOnTime,
      minPeriod: check.terms.minPeriod,
      maxPeriod: check.terms.maxPeriod,
      nullifier: utils.randomBytes(32),
    };
    this.answered += 1n;
    this.emit();
  }

  async readCheck(checkId: string): Promise<CheckOutcome> {
    await sleep(200);
    const check = this.checks.get(checkId);
    if (!check) return { checkId, exists: false, answered: false };
    return check.result
      ? { checkId, exists: true, answered: true, terms: check.terms, result: check.result }
      : { checkId, exists: true, answered: false, terms: check.terms };
  }
}

export const createSampleClient = (): AmanaClient => new SampleRegistry();
