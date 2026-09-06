// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Amana's private state, and the witnesses that read it.
 *
 * The selected records remain private to the participant and their configured
 * prover. The ledger sees commitments and check terms, not repayment counts.
 *
 * @module
 */

import { pureCircuits } from './managed/amana/contract/index.js';
import type { Attestation, Ledger } from './managed/amana/contract/index.js';
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';

/**
 * How many attestations a single proof can aggregate.
 *
 * This is fixed at compile time: a zero-knowledge circuit has no loops whose
 * length can vary with the input, and — more to the point — a circuit whose
 * shape depended on how many records a borrower held would leak exactly that
 * number. Every Amana proof performs the same work whether the borrower is
 * presenting one record or four.
 *
 * Must match the `0..4` bounds and `Vector<4, ...>` witness types in
 * `amana.compact`.
 */
export const PROOF_SLOTS = 4;

/** Depth of the on-chain attestation tree; must match `MerkleTree<10, _>`. */
export const TREE_DEPTH = 10;

/**
 * A Merkle path in the shape the compiled circuit expects.
 *
 * Note `goes_left`: the Compact field is `goesLeft`, but the generated
 * TypeScript bindings render it snake_case.
 */
export type AmanaMerklePath = {
  leaf: Uint8Array;
  path: { sibling: { field: bigint }; goes_left: boolean }[];
};

/**
 * One attestation as the borrower stores it, together with the bookkeeping
 * needed to rebuild its Merkle path against the current tree.
 */
export type StoredAttestation = {
  /** The record itself. Never published. */
  readonly attestation: Attestation;
  /** Which leaf of the on-chain tree this record was written to. */
  readonly leafIndex: bigint;
  /**
   * A human label for the issuing institution, so the borrower's own wallet
   * can show them something meaningful. Local only — it is not part of the
   * commitment and never crosses the device boundary.
   */
  readonly lenderName: string;
};

/**
 * The private state of an Amana participant.
 *
 * The same shape serves all three roles, because the roles are distinguished
 * by what they hold, not by what they are: a lender uses `secretKey` to
 * authorise issuance and fills `pending`; a borrower uses `secretKey` to bind
 * records to themselves and fills `wallet`.
 */
export type AmanaPrivateState = {
  /** The identity key. Deriving anything public from it requires a hash. */
  readonly secretKey: Uint8Array;
  /** Attestations this borrower holds. */
  readonly wallet: readonly StoredAttestation[];
  /** The record a lender is about to issue, if any. */
  readonly pending: Attestation | null;
  /**
   * Leaf indices selected for the next proof.
   *
   * The circuit's parameters (the verifier's thresholds) are not visible to a
   * witness, so the choice of which records to present is made here, before
   * the call, by {@link selectAttestations}. Keeping it explicit rather than
   * implicit makes the selection policy a unit-testable function instead of a
   * side effect buried in a witness.
   */
  readonly presenting: readonly bigint[];
};

export const createAmanaPrivateState = (secretKey: Uint8Array): AmanaPrivateState => ({
  secretKey,
  wallet: [],
  pending: null,
  presenting: [],
});

/** An all-zero attestation, used to fill slots a borrower is not using. */
export const emptyAttestation = (): Attestation => ({
  lender: new Uint8Array(32),
  subject: new Uint8Array(32),
  onTime: 0n,
  total: 0n,
  periodStart: 0n,
  periodEnd: 0n,
  nonce: new Uint8Array(32),
});

/** An all-zero Merkle path of the right depth. */
export const emptyPath = (): AmanaMerklePath => ({
  leaf: new Uint8Array(32),
  path: Array.from({ length: TREE_DEPTH }, () => ({
    sibling: { field: 0n },
    goes_left: false,
  })),
});

/** Best eligible summary per lender, then the strongest four lenders. */
const eligibleSummaries = (
  wallet: readonly StoredAttestation[],
  minPeriod: bigint,
  maxPeriod: bigint,
): StoredAttestation[] => {
  const best = new Map<string, StoredAttestation>();
  for (const stored of wallet) {
    const a = stored.attestation;
    if (a.periodStart > a.periodEnd || a.periodStart < minPeriod || a.periodEnd > maxPeriod) continue;
    const lender = Array.from(a.lender, (b) => b.toString(16).padStart(2, '0')).join('');
    const previous = best.get(lender);
    if (!previous || a.onTime > previous.attestation.onTime) best.set(lender, stored);
  }
  return [...best.values()]
    .sort((a, b) => a.attestation.onTime === b.attestation.onTime ? 0 : a.attestation.onTime > b.attestation.onTime ? -1 : 1)
    .slice(0, PROOF_SLOTS);
};

/** Select the fewest summaries that meet the terms; callers first filter live records. */
export const selectAttestations = (
  wallet: readonly StoredAttestation[],
  minOnTime: bigint,
  minPeriod: bigint,
  maxPeriod: bigint,
): bigint[] => {
  const chosen: bigint[] = [];
  let running = 0n;
  for (const slot of eligibleSummaries(wallet, minPeriod, maxPeriod)) {
    chosen.push(slot.leafIndex);
    running += slot.attestation.onTime;
    if (running >= minOnTime) break;
  }
  return chosen;
};

/** Total on-time repayments a wallet could prove within a recency window. */
export const provableTotal = (
  wallet: readonly StoredAttestation[],
  minPeriod: bigint,
  maxPeriod: bigint,
): bigint =>
  eligibleSummaries(wallet, minPeriod, maxPeriod)
    .reduce((sum, s) => sum + s.attestation.onTime, 0n);

/** Check the supplied leaf index as well as the commitment. */
export const isLiveAttestation = (ledger: Ledger, stored: StoredAttestation): boolean => {
  try {
    if (stored.leafIndex < 0n || stored.leafIndex >= 1024n || !ledger.issuers.member(stored.leafIndex)) return false;
    const path = ledger.attestations.pathForLeaf(stored.leafIndex, attestationLeaf(stored.attestation));
    return ledger.attestations.checkRoot(pureCircuits.attestationPathRoot(path));
  } catch {
    return false;
  }
};

type Slots = {
  attestations: Attestation[];
  paths: AmanaMerklePath[];
  used: boolean[];
};

/**
 * Assemble the four slots handed to `proveCreditStanding`.
 *
 * The padding rule matters. Unused slots repeat the *first presented record's
 * real Merkle path*, so that all four `checkRoot` calls in the circuit are
 * given the tree's live root. Padding with zeros instead would make the
 * disclosed root of an unused slot visibly different from a used one, and the
 * number of records a borrower holds would leak straight back out through the
 * very ledger reads the circuit was careful to keep uniform.
 */
const buildSlots = (ledger: Ledger, ps: AmanaPrivateState): Slots => {
  const selected = ps.presenting
    .map((index) => ps.wallet.find((s) => s.leafIndex === index))
    .filter((s): s is StoredAttestation => s !== undefined)
    .slice(0, PROOF_SLOTS);

  const pathFor = (s: StoredAttestation): AmanaMerklePath =>
    ledger.attestations.pathForLeaf(
      s.leafIndex,
      attestationLeaf(s.attestation),
    ) as unknown as AmanaMerklePath;

  const realPaths = selected.map(pathFor);

  // What unused slots repeat. If the borrower is presenting nothing at all
  // there is no live path to copy. A positive committed threshold rejects
  // that empty proof before the circuit consults its padding paths.
  const filler = selected[0];
  const fillerPath = realPaths[0] ?? emptyPath();
  const fillerAttestation = filler?.attestation ?? emptyAttestation();

  const attestations: Attestation[] = [];
  const paths: AmanaMerklePath[] = [];
  const used: boolean[] = [];

  for (let i = 0; i < PROOF_SLOTS; i++) {
    const slot = selected[i];
    const path = realPaths[i];
    if (slot !== undefined && path !== undefined) {
      attestations.push(slot.attestation);
      paths.push(path);
      used.push(true);
    } else {
      attestations.push(fillerAttestation);
      paths.push(fillerPath);
      used.push(false);
    }
  }

  return { attestations, paths, used };
};

/**
 * The tree leaf for an attestation.
 *
 * Deliberately delegates to the compiled circuit's own `attestationCommitment`
 * rather than reimplementing the hash in TypeScript. A second implementation
 * is a second thing that can drift, and a commitment that disagrees with the
 * circuit by one byte surfaces as an unprovable membership check rather than
 * as anything legible.
 */
export const attestationLeaf = (a: Attestation): Uint8Array =>
  pureCircuits.attestationCommitment(a);

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, AmanaPrivateState>): [AmanaPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],

  pendingAttestation: ({
    privateState,
  }: WitnessContext<Ledger, AmanaPrivateState>): [AmanaPrivateState, Attestation] => {
    if (privateState.pending === null) {
      throw new Error(
        'Amana: issueAttestation was called with no pending attestation in private state',
      );
    }
    return [privateState, privateState.pending];
  },

  heldAttestations: ({
    ledger,
    privateState,
  }: WitnessContext<Ledger, AmanaPrivateState>): [AmanaPrivateState, Attestation[]] => [
    privateState,
    buildSlots(ledger, privateState).attestations,
  ],

  heldPaths: ({
    ledger,
    privateState,
  }: WitnessContext<Ledger, AmanaPrivateState>): [AmanaPrivateState, AmanaMerklePath[]] => [
    privateState,
    buildSlots(ledger, privateState).paths,
  ],

  heldUsed: ({
    ledger,
    privateState,
  }: WitnessContext<Ledger, AmanaPrivateState>): [AmanaPrivateState, boolean[]] => [
    privateState,
    buildSlots(ledger, privateState).used,
  ],
};
