// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Types shared across the three Amana front ends.
 *
 * @module
 */

import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type {
  Attestation,
  AmanaPrivateState,
  CheckResult,
  Contract,
  StoredAttestation,
  Witnesses,
} from '../../contract/src/index.js';

export const amanaPrivateStateKey = 'amanaPrivateState';
export type PrivateStateId = typeof amanaPrivateStateKey;

export type PrivateStates = {
  readonly amanaPrivateState: AmanaPrivateState;
};

export type AmanaContract = Contract<AmanaPrivateState, Witnesses<AmanaPrivateState>>;

export type AmanaCircuitKeys = Exclude<keyof AmanaContract['impureCircuits'], number | symbol>;

export type AmanaProviders = MidnightProviders<
  AmanaCircuitKeys,
  PrivateStateId,
  AmanaPrivateState
>;

export type DeployedAmanaContract = FoundContract<AmanaContract>;

/**
 * What a lender needs to know about the registry.
 *
 * Everything here is public by construction — it is drawn entirely from the
 * ledger, and contains no borrower-identifying data at all.
 */
export type RegistryState = {
  readonly bootstrapped: boolean;
  readonly authority: string;
  /** Registry keys of every institution permitted to issue. */
  readonly lenders: readonly string[];
  readonly attestationsIssued: bigint;
  readonly attestationsRevoked: bigint;
  readonly checksAnswered: bigint;
  /** Next free leaf in the attestation tree. */
  readonly nextLeaf: bigint;
  /** Leaf index -> issuing lender key, for the issuer's own console. */
  readonly issuers: ReadonlyMap<bigint, string>;
};

/** The signed-in participant's view of themselves. */
export type IdentityState = {
  /** This device's key as a lender would present it to the registry. */
  readonly lenderKey: string;
  /** Whether this device's key is registered to issue. */
  readonly isRegisteredLender: boolean;
  /** Whether this device's key is the registry authority. */
  readonly isAuthority: boolean;
};

/**
 * One held credential, with the one fact about it the borrower cannot work
 * out on their own: whether the issuer has since withdrawn it.
 */
export type WalletEntry = StoredAttestation & {
  /** False once the issuing lender has revoked the underlying leaf. */
  readonly live: boolean;
};

/** A borrower's own view of their wallet. Never leaves the device. */
export type WalletState = {
  readonly attestations: readonly WalletEntry[];
  /** Records still live on chain, i.e. not revoked. */
  readonly liveCount: number;
  /** On-time repayments this wallet could prove inside a recency window. */
  readonly provableOnTime: bigint;
};

export type AmanaDerivedState = {
  readonly registry: RegistryState;
  readonly identity: IdentityState;
  readonly wallet: WalletState;
};

/** A verifier's reading of one check. */
export type CheckOutcome = {
  readonly checkId: string;
  readonly answered: boolean;
  readonly result?: CheckResult;
};

export type { Attestation, AmanaPrivateState, CheckResult, StoredAttestation };
