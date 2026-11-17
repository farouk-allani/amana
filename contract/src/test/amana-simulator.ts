// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * A test bed that runs the Amana circuits against a real ledger, with each
 * participant holding genuinely separate private state.
 *
 * The separation is the point. A lender's device and a borrower's device are
 * distinct `AmanaPrivateState` values here, and the only way a record moves
 * from one to the other is {@link AmanaSimulator.issueTo}, which models the
 * lender handing the borrower a copy out of band. Nothing in these tests can
 * accidentally prove a fact using data the prover was never given.
 */

import {
  type ChargedState,
  type CircuitContext,
  type CircuitResults,
  type ProofData,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  type Attestation,
  type ImpureCircuits,
  type Ledger,
  ledger,
  pureCircuits,
} from '../managed/amana/contract/index.js';
import {
  type AmanaPrivateState,
  type StoredAttestation,
  createAmanaPrivateState,
  selectAttestations,
  isLiveAttestation,
  witnesses,
} from '../witnesses.js';
import { randomBytes, deriveKey } from './utils.js';

/** The parts of an attestation a test actually cares about stating. */
export type RepaymentRecord = {
  onTime: bigint;
  total: bigint;
  periodStart: bigint;
  periodEnd: bigint;
};

type Circuit = keyof ImpureCircuits<AmanaPrivateState>;
type ArgsOf<K extends Circuit> = ImpureCircuits<AmanaPrivateState>[K] extends (
  ctx: CircuitContext<AmanaPrivateState>,
  ...rest: infer A
) => unknown
  ? A
  : never;

const COIN_KEY = '0'.repeat(64);

export class AmanaSimulator {
  readonly contract: Contract<AmanaPrivateState>;
  readonly address = sampleContractAddress();
  /** The registry's public state, as the chain would hold it. */
  state: ChargedState;
  /** The active participant's private state. */
  privateState: AmanaPrivateState;

  /** One private state per participant, keyed by a test-friendly name. */
  private readonly devices = new Map<string, AmanaPrivateState>();
  private active: string;

  private constructor(
    contract: Contract<AmanaPrivateState>,
    state: ChargedState,
    actor: string,
    privateState: AmanaPrivateState,
  ) {
    this.contract = contract;
    this.state = state;
    this.active = actor;
    this.privateState = privateState;
    this.devices.set(actor, privateState);
  }

  /** Deploy a fresh registry with `initialActor` as its committed authority. */
  static async create(initialActor = 'authority'): Promise<AmanaSimulator> {
    const contract = new Contract<AmanaPrivateState>(witnesses);
    const initial = createAmanaPrivateState(deriveKey(initialActor));
    const { currentPrivateState, currentContractState } = await contract.initialState(
      createConstructorContext(initial, COIN_KEY),
      pureCircuits.lenderKey(initial.secretKey),
    );
    return new AmanaSimulator(contract, currentContractState.data, initialActor, currentPrivateState);
  }

  // --- participants --------------------------------------------------------

  /**
   * Act as `name` from here on, creating their device on first use.
   *
   * Keys are derived deterministically from the name so that a failing test
   * reproduces exactly rather than differently.
   */
  as(name: string): this {
    this.save();
    if (!this.devices.has(name)) {
      this.devices.set(name, createAmanaPrivateState(deriveKey(name)));
    }
    this.active = name;
    this.privateState = this.devices.get(name)!;
    return this;
  }

  /** Persist the active device's state back into its slot. */
  private save(): void {
    this.devices.set(this.active, this.privateState);
  }

  private mutate(f: (ps: AmanaPrivateState) => AmanaPrivateState): void {
    this.privateState = f(this.privateState);
  }

  /** The secret key of a participant. */
  secretKeyOf(name: string): Uint8Array {
    if (!this.devices.has(name)) {
      this.devices.set(name, createAmanaPrivateState(deriveKey(name)));
    }
    return this.devices.get(name)!.secretKey;
  }

  /** The public registry key of a participant acting as a lender. */
  lenderKeyOf(name: string): Uint8Array {
    return pureCircuits.lenderKey(this.secretKeyOf(name));
  }

  /** The pseudonym a borrower presents to one specific lender. */
  subjectIdOf(borrower: string, lender: string): Uint8Array {
    return pureCircuits.subjectId(this.secretKeyOf(borrower), this.lenderKeyOf(lender));
  }

  deviceOf(name: string): AmanaPrivateState {
    this.save();
    return this.devices.get(name)!;
  }

  walletOf(name: string): readonly StoredAttestation[] {
    return this.deviceOf(name).wallet;
  }

  // --- state ---------------------------------------------------------------

  getLedger(): Ledger {
    return ledger(this.state);
  }

  getPrivateState(): AmanaPrivateState {
    return this.privateState;
  }

  /** A fresh context for one call, against the current ledger and device. */
  contextFor(circuitId: Circuit, privateState = this.privateState): CircuitContext<AmanaPrivateState> {
    return createCircuitContext({
      circuitId,
      contractAddress: this.address,
      coinPublicKeyOrZswapState: COIN_KEY,
      contractState: this.state,
      privateState,
    });
  }

  /**
   * Run one circuit as the active participant and adopt its outcome. A
   * refused call throws and leaves both the ledger and the device untouched.
   */
  async run<K extends Circuit>(
    circuit: K,
    ...args: ArgsOf<K>
  ): Promise<CircuitResults<AmanaPrivateState, unknown> & { proofData: ProofData }> {
    return this.runWith(this.contract, circuit, ...args);
  }

  private async runWith<K extends Circuit>(
    contract: Contract<AmanaPrivateState>,
    circuit: K,
    ...args: ArgsOf<K>
  ): Promise<CircuitResults<AmanaPrivateState, unknown> & { proofData: ProofData }> {
    const fn = contract.impureCircuits[circuit] as unknown as (
      ctx: CircuitContext<AmanaPrivateState>,
      ...rest: unknown[]
    ) => Promise<CircuitResults<AmanaPrivateState, unknown>>;
    const results = await fn(this.contextFor(circuit), ...args);
    this.state = results.context.callContext.currentQueryContext.state;
    this.privateState = results.context.callContext.currentPrivateState ?? this.privateState;
    this.save();
    return { ...results, proofData: results.context.callProofDataTrace.at(-1)! };
  }

  // --- circuits ------------------------------------------------------------

  async claimAuthority(): Promise<Ledger> {
    await this.run('claimAuthority');
    return this.getLedger();
  }

  async registerLender(lenderPublicKey: Uint8Array): Promise<Ledger> {
    await this.run('registerLender', lenderPublicKey);
    return this.getLedger();
  }

  async proposeAuthority(newAuthority: Uint8Array): Promise<Ledger> {
    await this.run('proposeAuthority', newAuthority);
    return this.getLedger();
  }

  async acceptAuthority(): Promise<Ledger> {
    await this.run('acceptAuthority');
    return this.getLedger();
  }

  async removeLender(lenderPublicKey: Uint8Array): Promise<Ledger> {
    await this.run('removeLender', lenderPublicKey);
    return this.getLedger();
  }

  /**
   * Issue an attestation, as the currently active lender, to `borrower`.
   *
   * Models the whole out-of-band exchange: the borrower has already given the
   * lender their per-lender pseudonym, the lender writes a commitment to the
   * chain, and hands the borrower back the record and its leaf index.
   */
  async issueTo(borrower: string, record: RepaymentRecord, nonce?: Uint8Array): Promise<Attestation> {
    const lenderName = this.active;
    const attestation: Attestation = {
      lender: this.lenderKeyOf(lenderName),
      subject: this.subjectIdOf(borrower, lenderName),
      onTime: record.onTime,
      total: record.total,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd,
      nonce: nonce ?? randomBytes(32),
    };

    const leafIndex = this.getLedger().nextLeaf;
    await this.issueRaw(attestation);
    this.deliver(borrower, attestation, leafIndex, lenderName);
    return attestation;
  }

  /**
   * Issue a caller-supplied record as the active lender, skipping the
   * bookkeeping in {@link issueTo}.
   *
   * This is how a misbehaving lender is modelled — one that signs a record
   * naming somebody else as the issuer, say. An honest client builds the
   * record from its own key and could not produce such a thing.
   */
  async issueRaw(attestation: Attestation): Promise<Ledger> {
    const before = this.privateState;
    this.mutate((ps) => ({ ...ps, pending: attestation }));
    try {
      await this.run('issueAttestation');
    } catch (e) {
      this.privateState = before;
      throw e;
    }
    this.mutate((ps) => ({ ...ps, pending: null }));
    this.save();
    return this.getLedger();
  }

  /**
   * Put a record into a borrower's wallet without going through issuance.
   *
   * Used by tests that need a borrower to hold something they should not be
   * able to prove — a forged record, or one belonging to somebody else.
   */
  deliver(borrower: string, attestation: Attestation, leafIndex: bigint, lenderName = 'unknown'): void {
    const here = this.active;
    this.as(borrower);
    this.mutate((ps) => ({
      ...ps,
      wallet: [...ps.wallet, { attestation, leafIndex, lenderName }],
    }));
    this.save();
    this.as(here);
  }

  async revokeAttestation(index: bigint): Promise<Ledger> {
    await this.run('revokeAttestation', index);
    return this.getLedger();
  }

  async revokeOrphanedAttestation(index: bigint): Promise<Ledger> {
    await this.run('revokeOrphanedAttestation', index);
    return this.getLedger();
  }

  /**
   * Answer a verifier's check as the active borrower.
   *
   * Selection runs first and is written into private state, exactly as the
   * production API does it — the circuit cannot see the verifier's thresholds
   * from inside a witness.
   */
  async createCheck(
    nonce: Uint8Array,
    borrower: string,
    minOnTime: bigint,
    minPeriod: bigint,
    maxPeriod: bigint,
  ): Promise<Uint8Array> {
    const key = pureCircuits.verifierKey(this.getPrivateState().secretKey);
    const id = pureCircuits.requestId(key, nonce);
    const recipient = pureCircuits.checkRecipient(this.secretKeyOf(borrower), id);
    await this.createCheckRaw(id, nonce, recipient, minOnTime, minPeriod, maxPeriod);
    return id;
  }

  async createCheckRaw(
    id: Uint8Array,
    nonce: Uint8Array,
    recipient: Uint8Array,
    minOnTime: bigint,
    minPeriod: bigint,
    maxPeriod: bigint,
  ): Promise<Ledger> {
    await this.run('createCheck', id, nonce, recipient, minOnTime, minPeriod, maxPeriod);
    return this.getLedger();
  }

  async proveCreditStanding(checkId: Uint8Array): Promise<Ledger> {
    const led = this.getLedger();
    const terms = led.requestedChecks.member(checkId) ? led.requestedChecks.lookup(checkId) : null;
    this.mutate((ps) => ({
      ...ps,
      presenting: terms
        ? selectAttestations(
            ps.wallet.filter((s) => isLiveAttestation(led, s)),
            terms.minOnTime,
            terms.minPeriod,
            terms.maxPeriod,
          )
        : [],
    }));
    return this.proveWithSelection(checkId, [...this.getPrivateState().presenting]);
  }

  /**
   * Answer a check with Merkle paths built against an earlier view of the
   * ledger, as a borrower does whose proof is still in flight when the
   * registry moves on. The circuit itself runs against the current ledger.
   */
  async proveAgainst(checkId: Uint8Array, view: Ledger): Promise<Ledger> {
    const terms = view.requestedChecks.lookup(checkId);
    this.mutate((ps) => ({
      ...ps,
      presenting: selectAttestations(
        ps.wallet.filter((s) => isLiveAttestation(view, s)),
        terms.minOnTime,
        terms.minPeriod,
        terms.maxPeriod,
      ),
    }));
    const stale: typeof witnesses = {
      ...witnesses,
      heldAttestations: (ctx) => witnesses.heldAttestations({ ...ctx, ledger: view }),
      heldPaths: (ctx) => witnesses.heldPaths({ ...ctx, ledger: view }),
      heldUsed: (ctx) => witnesses.heldUsed({ ...ctx, ledger: view }),
    };
    await this.runWith(new Contract<AmanaPrivateState>(stale), 'proveCreditStanding', checkId);
    return this.getLedger();
  }

  async proveWithSelection(checkId: Uint8Array, presenting: bigint[]): Promise<Ledger> {
    this.mutate((ps) => ({ ...ps, presenting }));
    await this.run('proveCreditStanding', checkId);
    return this.getLedger();
  }
}
