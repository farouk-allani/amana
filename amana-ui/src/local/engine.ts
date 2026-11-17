// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The compiled Amana contract, run in this browser with no wallet, no proof
 * server and no network.
 *
 * These are the circuits `compact compile` emitted, the same ones a deployed
 * registry verifies proofs of. Running them here is the first thing every
 * Amana transaction does on a participant's own device: the circuit executes
 * against the ledger and the participant's private state, and every `assert`
 * in the contract is enforced. What does not happen here is the rest of a
 * real transaction: no zero-knowledge proof is built and nothing is sent to
 * a chain. The ledger is a value in memory.
 *
 * Each participant has separate private state, as they would on separate
 * devices. A record moves from a lender to a borrower only through
 * {@link LocalRegistry.issue}, which models the lender handing it over.
 *
 * @module
 */

import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  type ChargedState,
  type CircuitContext,
  type CircuitResults,
} from '@midnight-ntwrk/compact-runtime';

import {
  Contract,
  ledger,
  pureCircuits,
  type Attestation,
  type CheckResult,
  type CheckTerms,
  type ImpureCircuits,
  type Ledger,
} from '../../../contract/src/managed/amana/contract/index.js';
import {
  attestationLeaf,
  createAmanaPrivateState,
  isLiveAttestation,
  selectAttestations,
  witnesses,
  type AmanaPrivateState,
  type StoredAttestation,
} from '../../../contract/src/witnesses.js';
import * as utils from '../../../api/src/utils/index.js';

type Circuits = ImpureCircuits<AmanaPrivateState>;
export type CircuitName = keyof Circuits;
type Args<K extends CircuitName> = Circuits[K] extends (context: never, ...args: infer A) => unknown ? A : never;
type Result<K extends CircuitName> = Awaited<ReturnType<Circuits[K]>>['result'];

const COIN_KEY = '0'.repeat(64);

/** A circuit refused to run to the end: one of the contract's asserts failed. */
export class Refusal extends Error {
  constructor(
    readonly circuit: CircuitName,
    /** The contract's own message, as written in `amana.compact`. */
    readonly reason: string,
  ) {
    super(`${circuit} refused: ${reason}`);
    this.name = 'Refusal';
  }
}

const reasonOf = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e);
  return message.replace(/^failed assert:\s*/i, '');
};

export type RecordCounts = {
  readonly onTime: bigint;
  readonly total: bigint;
  readonly periodStart: bigint;
  readonly periodEnd: bigint;
};

/** One answered or unanswered question, as the public ledger holds it. */
export type PublicCheck = {
  readonly checkId: string;
  readonly terms: CheckTerms;
  readonly result: CheckResult | null;
};

/** Everything the public ledger holds, in the order a reader would ask. */
export type PublicLedger = {
  readonly lenders: readonly string[];
  /** Leaf index and the key of the lender that filed it. Live leaves only. */
  readonly records: readonly { readonly leaf: bigint; readonly filedBy: string }[];
  readonly issued: bigint;
  readonly revoked: bigint;
  readonly checks: readonly PublicCheck[];
  readonly nullifiers: number;
};

export class LocalRegistry {
  private readonly contract = new Contract<AmanaPrivateState>(witnesses);
  private state: ChargedState;
  private devices: Map<string, AmanaPrivateState>;
  /** Checks in the order they were created, since a ledger map has no order. */
  private checkIds: string[];
  /** How many circuits have run to completion. */
  calls: number;

  /** A stand-in address: this registry exists only in this page's memory. */
  readonly address: string;

  private constructor(
    state: ChargedState,
    devices: Map<string, AmanaPrivateState>,
    checkIds: string[],
    calls: number,
    address: string,
  ) {
    this.state = state;
    this.devices = devices;
    this.checkIds = checkIds;
    this.calls = calls;
    this.address = address;
  }

  /** A new registry whose deployment key belongs to `operator`. */
  static async deploy(operator = 'operator'): Promise<LocalRegistry> {
    const contract = new Contract<AmanaPrivateState>(witnesses);
    const initial = createAmanaPrivateState(utils.randomBytes(32));
    const { currentPrivateState, currentContractState } = await contract.initialState(
      createConstructorContext(initial, COIN_KEY),
      pureCircuits.lenderKey(initial.secretKey),
    );
    return new LocalRegistry(currentContractState.data, new Map([[operator, currentPrivateState]]), [], 0,
      sampleContractAddress());
  }

  /**
   * An independent copy of the registry and every device, as of now.
   *
   * What happens on the copy never reaches the original, which is how an
   * attempt to cheat can be run for real without spoiling the honest run.
   * Ledger states are persistent values: a circuit returns a new state and
   * leaves the one it ran against untouched, so a copy shares it safely.
   */
  fork(): LocalRegistry {
    return new LocalRegistry(this.state, new Map(this.devices), [...this.checkIds], this.calls, this.address);
  }

  // --- devices ---------------------------------------------------------------

  /** A participant's private state, created with a fresh key on first use. */
  device(name: string): AmanaPrivateState {
    let ps = this.devices.get(name);
    if (!ps) {
      ps = createAmanaPrivateState(utils.randomBytes(32));
      this.devices.set(name, ps);
    }
    return ps;
  }

  /** Replace a participant's private state, as editing one's own device would. */
  setDevice(name: string, f: (ps: AmanaPrivateState) => AmanaPrivateState): void {
    this.devices.set(name, f(this.device(name)));
  }

  lenderKey(name: string): Uint8Array {
    return pureCircuits.lenderKey(this.device(name).secretKey);
  }

  /** The pseudonym a borrower gives one specific lender, and no other. */
  subjectId(borrower: string, lender: string): Uint8Array {
    return pureCircuits.subjectId(this.device(borrower).secretKey, this.lenderKey(lender));
  }

  // --- the contract ----------------------------------------------------------

  /**
   * Run one circuit as `actor`. On success the ledger and the actor's device
   * move forward; on a failed assert nothing changes and a {@link Refusal}
   * carries the contract's message.
   */
  async call<K extends CircuitName>(actor: string, circuit: K, ...args: Args<K>): Promise<Result<K>> {
    const run = this.contract.impureCircuits[circuit] as unknown as (
      context: CircuitContext<AmanaPrivateState>,
      ...rest: unknown[]
    ) => Promise<CircuitResults<AmanaPrivateState, Result<K>>>;
    const context = createCircuitContext({
      circuitId: circuit,
      contractAddress: this.address,
      coinPublicKeyOrZswapState: COIN_KEY,
      contractState: this.state,
      privateState: this.device(actor),
    });
    let out;
    try {
      out = await run(context, ...args);
    } catch (e) {
      throw new Refusal(circuit, reasonOf(e));
    }
    this.state = out.context.callContext.currentQueryContext.state;
    this.devices.set(actor, out.context.callContext.currentPrivateState ?? this.device(actor));
    this.calls += 1;
    return out.result;
  }

  ledger(): Ledger {
    return ledger(this.state);
  }

  // --- the operations a participant performs ---------------------------------

  /**
   * `lender` files a record for `borrower` and hands them their copy.
   *
   * The borrower first gives the lender a pseudonym made for that lender
   * alone. The lender's circuit publishes one commitment and returns the leaf
   * it was written to; the record itself goes to the borrower off chain.
   */
  async issue(lender: string, borrower: string, counts: RecordCounts, lenderName: string): Promise<StoredAttestation> {
    const attestation: Attestation = {
      lender: this.lenderKey(lender),
      subject: this.subjectId(borrower, lender),
      ...counts,
      nonce: utils.randomBytes(32),
    };
    this.setDevice(lender, (ps) => ({ ...ps, pending: attestation }));
    let leafIndex: bigint;
    try {
      leafIndex = await this.call(lender, 'issueAttestation');
    } finally {
      this.setDevice(lender, (ps) => ({ ...ps, pending: null }));
    }
    const stored: StoredAttestation = { attestation, leafIndex, lenderName };
    this.setDevice(borrower, (ps) => ({ ...ps, wallet: [...ps.wallet, stored] }));
    return stored;
  }

  /** `verifier` commits a question for `borrower` to answer. Returns its id. */
  async ask(verifier: string, borrower: string, minOnTime: bigint, minPeriod: bigint, maxPeriod: bigint): Promise<string> {
    const key = pureCircuits.verifierKey(this.device(verifier).secretKey);
    const nonce = utils.randomBytes(32);
    const id = pureCircuits.requestId(key, nonce);
    const recipient = pureCircuits.checkRecipient(this.device(borrower).secretKey, id);
    await this.call(verifier, 'createCheck', id, nonce, recipient, minOnTime, minPeriod, maxPeriod);
    const checkId = utils.bytesToHex(id);
    this.checkIds.push(checkId);
    return checkId;
  }

  /**
   * `borrower` answers a question.
   *
   * The records to present are the fewest live ones that meet the terms,
   * chosen the way the application chooses them, unless `presenting` names
   * leaves outright, which is how a dishonest borrower is modelled.
   */
  async answer(borrower: string, checkId: string, presenting?: readonly bigint[]): Promise<void> {
    const led = this.ledger();
    const id = utils.keyBytes(checkId);
    const chosen =
      presenting ??
      (led.requestedChecks.member(id)
        ? (() => {
            const terms = led.requestedChecks.lookup(id);
            const live = this.device(borrower).wallet.filter((s) => isLiveAttestation(led, s));
            return selectAttestations(live, terms.minOnTime, terms.minPeriod, terms.maxPeriod);
          })()
        : []);
    this.setDevice(borrower, (ps) => ({ ...ps, presenting: chosen }));
    try {
      await this.call(borrower, 'proveCreditStanding', id);
    } finally {
      this.setDevice(borrower, (ps) => ({ ...ps, presenting: [] }));
    }
  }

  // --- reading ---------------------------------------------------------------

  /** A borrower's records, each marked live or not against the ledger. */
  wallet(borrower: string): (StoredAttestation & { live: boolean })[] {
    const led = this.ledger();
    return this.device(borrower).wallet.map((s) => ({ ...s, live: isLiveAttestation(led, s) }));
  }

  /** The commitment the ledger holds for a record: its only public trace. */
  fingerprint(stored: StoredAttestation): string {
    return utils.bytesToHex(attestationLeaf(stored.attestation));
  }

  check(checkId: string): PublicCheck | null {
    const led = this.ledger();
    const id = utils.keyBytes(checkId);
    if (!led.requestedChecks.member(id)) return null;
    return {
      checkId,
      terms: led.requestedChecks.lookup(id),
      result: led.checks.member(id) ? led.checks.lookup(id) : null,
    };
  }

  /** What anyone watching the chain could read. Nothing else is stored. */
  publicLedger(): PublicLedger {
    const led = this.ledger();
    return {
      lenders: [...led.lenders].map(utils.bytesToHex),
      records: [...led.issuers]
        .map(([leaf, lender]) => ({ leaf, filedBy: utils.bytesToHex(lender) }))
        .sort((a, b) => (a.leaf < b.leaf ? -1 : 1)),
      issued: led.issuedCount,
      revoked: led.revokedCount,
      checks: this.checkIds.map((id) => this.check(id)).filter((c): c is PublicCheck => c !== null),
      nullifiers: Number(led.nullifiers.size()),
    };
  }
}
