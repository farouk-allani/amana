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
  type CircuitContext,
  QueryContext,
  sampleContractAddress,
  createConstructorContext,
  CostModel,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  type Attestation,
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

export class AmanaSimulator {
  readonly contract: Contract<AmanaPrivateState>;
  circuitContext: CircuitContext<AmanaPrivateState>;

  /** One private state per participant, keyed by a test-friendly name. */
  private readonly devices = new Map<string, AmanaPrivateState>();
  private active: string;

  constructor(initialActor = 'authority') {
    this.contract = new Contract<AmanaPrivateState>(witnesses);
    this.active = initialActor;

    const initial = createAmanaPrivateState(deriveKey(initialActor));
    this.devices.set(initialActor, initial);

    const { currentPrivateState, currentContractState, currentZswapLocalState } =
      this.contract.initialState(createConstructorContext(initial, '0'.repeat(64)), pureCircuits.lenderKey(initial.secretKey));

    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
    };
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
    this.circuitContext.currentPrivateState = this.devices.get(name)!;
    return this;
  }

  /** Persist the active device's state back into its slot. */
  private save(): void {
    this.devices.set(this.active, this.circuitContext.currentPrivateState);
  }

  private mutate(f: (ps: AmanaPrivateState) => AmanaPrivateState): void {
    this.circuitContext.currentPrivateState = f(this.circuitContext.currentPrivateState);
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
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  getPrivateState(): AmanaPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  // --- circuits ------------------------------------------------------------

  claimAuthority(): Ledger {
    this.circuitContext = this.contract.impureCircuits.claimAuthority(
      this.circuitContext,
    ).context;
    this.save();
    return this.getLedger();
  }

  registerLender(lenderPublicKey: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.registerLender(
      this.circuitContext,
      lenderPublicKey,
    ).context;
    this.save();
    return this.getLedger();
  }

  /**
   * Issue an attestation, as the currently active lender, to `borrower`.
   *
   * Models the whole out-of-band exchange: the borrower has already given the
   * lender their per-lender pseudonym, the lender writes a commitment to the
   * chain, and hands the borrower back the record and its leaf index.
   */
  issueTo(borrower: string, record: RepaymentRecord, nonce?: Uint8Array): Attestation {
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

    this.as(lenderName);
    this.mutate((ps) => ({ ...ps, pending: attestation }));
    this.circuitContext = this.contract.impureCircuits.issueAttestation(
      this.circuitContext,
    ).context;
    this.mutate((ps) => ({ ...ps, pending: null }));
    this.save();

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
  issueRaw(attestation: Attestation): Ledger {
    this.mutate((ps) => ({ ...ps, pending: attestation }));
    this.circuitContext = this.contract.impureCircuits.issueAttestation(
      this.circuitContext,
    ).context;
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
  deliver(
    borrower: string,
    attestation: Attestation,
    leafIndex: bigint,
    lenderName = 'unknown',
  ): void {
    const here = this.active;
    this.as(borrower);
    this.mutate((ps) => ({
      ...ps,
      wallet: [...ps.wallet, { attestation, leafIndex, lenderName }],
    }));
    this.save();
    this.as(here);
  }

  revokeAttestation(index: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.revokeAttestation(
      this.circuitContext,
      index,
    ).context;
    this.save();
    return this.getLedger();
  }

  /**
   * Answer a verifier's check as the active borrower.
   *
   * Selection runs first and is written into private state, exactly as the
   * production API does it — the circuit cannot see the verifier's thresholds
   * from inside a witness.
   */
  createCheck(nonce: Uint8Array, borrower: string, minOnTime: bigint, minPeriod: bigint, maxPeriod: bigint): Uint8Array {
    const key = pureCircuits.verifierKey(this.getPrivateState().secretKey);
    const id = pureCircuits.requestId(key, nonce);
    const recipient = pureCircuits.checkRecipient(this.secretKeyOf(borrower), id);
    this.createCheckRaw(id, nonce, recipient, minOnTime, minPeriod, maxPeriod);
    return id;
  }

  createCheckRaw(id: Uint8Array, nonce: Uint8Array, recipient: Uint8Array, minOnTime: bigint, minPeriod: bigint, maxPeriod: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.createCheck(this.circuitContext, id, nonce, recipient, minOnTime, minPeriod, maxPeriod).context;
    this.save();
    return this.getLedger();
  }

  proveCreditStanding(checkId: Uint8Array): Ledger {
    const led = this.getLedger();
    const terms = led.requestedChecks.member(checkId) ? led.requestedChecks.lookup(checkId) : null;
    this.mutate((ps) => ({ ...ps, presenting: terms ? selectAttestations(
      ps.wallet.filter((s) => isLiveAttestation(led, s)), terms.minOnTime, terms.minPeriod, terms.maxPeriod) : [] }));
    return this.proveWithSelection(checkId, [...this.getPrivateState().presenting]);
  }

  proveWithSelection(checkId: Uint8Array, presenting: bigint[]): Ledger {
    this.mutate((ps) => ({ ...ps, presenting }));
    this.circuitContext = this.contract.impureCircuits.proveCreditStanding(this.circuitContext, checkId).context;
    this.save();
    return this.getLedger();
  }
}
