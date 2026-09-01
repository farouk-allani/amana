// Amana — portable private credit history.
// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The Amana client API.
 *
 * One class serves all three roles, because on Midnight the role is not a
 * property of the contract — it is a property of what you can prove. A device
 * holding the authority key can register lenders; a device holding a
 * registered lender key can issue; a device holding attestations can prove
 * them. The contract enforces all three, and this API simply exposes them.
 *
 * @packageDocumentation
 */

import { type ContractAddress, fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { combineLatest, from, map, type Observable } from 'rxjs';
import type { Logger } from 'pino';

import * as Amana from '../../contract/src/managed/amana/contract/index.js';
import {
  AmanaCompiledContract,
  createAmanaPrivateState,
  provableTotal,
  selectAttestations,
  type AmanaPrivateState,
  type Attestation,
  type StoredAttestation,
} from '../../contract/src/index.js';
import {
  amanaPrivateStateKey,
  type AmanaDerivedState,
  type AmanaProviders,
  type CheckOutcome,
  type DeployedAmanaContract,
  type RegistryState,
} from './common-types.js';
import * as utils from './utils/index.js';

export * from './common-types.js';
export * as utils from './utils/index.js';

/** A repayment record as a lender states it, before it becomes an attestation. */
export type RepaymentRecord = {
  /** The borrower's pseudonym at this lender — see {@link AmanaAPI.subjectIdFor}. */
  readonly subject: string;
  readonly onTime: bigint;
  readonly total: bigint;
  /** Months since epoch of the most recent repayment. */
  readonly period: bigint;
};

/** What a lender hands the borrower after issuing. */
export type IssuedAttestation = {
  readonly attestation: Attestation;
  readonly leafIndex: bigint;
};

export class AmanaAPI {
  private constructor(
    public readonly deployedContract: DeployedAmanaContract,
    private readonly providers: AmanaProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.deployedContractAddress);

    this.state$ = combineLatest(
      [
        providers.publicDataProvider
          .contractStateObservable(this.deployedContractAddress, { type: 'latest' })
          .pipe(map((contractState) => Amana.ledger(contractState.data))),
        from(
          providers.privateStateProvider.get(amanaPrivateStateKey) as Promise<AmanaPrivateState>,
        ),
      ],
      (ledger, privateState) => this.derive(ledger, privateState),
    );
  }

  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<AmanaDerivedState>;

  // --- derived state -------------------------------------------------------

  private derive(ledger: Amana.Ledger, privateState: AmanaPrivateState): AmanaDerivedState {
    const registry = AmanaAPI.readRegistry(ledger);
    const lenderKey = toHex(Amana.pureCircuits.lenderKey(privateState.secretKey));

    // A record is live if the tree still opens to it. Revocation overwrites
    // the leaf, so this is the same question the circuit asks.
    const entries = privateState.wallet.map((s) => ({ ...s, live: AmanaAPI.isLive(ledger, s) }));
    const live = entries.filter((s) => s.live);

    return {
      registry,
      identity: {
        lenderKey,
        isRegisteredLender: ledger.lenders.member(fromHex(lenderKey)),
        isAuthority: registry.bootstrapped && registry.authority === lenderKey,
      },
      wallet: {
        attestations: entries,
        liveCount: live.length,
        provableOnTime: provableTotal(live, 0n),
      },
    };
  }

  /**
   * Is this record still provable?
   *
   * Revocation overwrites the leaf with the tree's default value, so a revoked
   * commitment is simply no longer present. `findPathForLeaf` searches for the
   * leaf and returns `undefined` when it is not there, which answers exactly
   * the question the circuit's `checkRoot` will ask a moment later. Letting the
   * borrower's wallet show a record as dead *before* they present it is the
   * difference between "your lender withdrew this" and a failed transaction.
   */
  private static isLive(ledger: Amana.Ledger, stored: StoredAttestation): boolean {
    try {
      const leaf = Amana.pureCircuits.attestationCommitment(stored.attestation);
      return ledger.attestations.findPathForLeaf(leaf) !== undefined;
    } catch {
      return false;
    }
  }

  static readRegistry(ledger: Amana.Ledger): RegistryState {
    return {
      bootstrapped: ledger.bootstrapped,
      authority: toHex(ledger.authority),
      lenders: [...ledger.lenders].map(toHex),
      attestationsIssued: ledger.issuedCount,
      attestationsRevoked: ledger.revokedCount,
      checksAnswered: ledger.acceptedCount,
      nextLeaf: ledger.nextLeaf,
      issuers: new Map([...ledger.issuers].map(([k, v]) => [k, toHex(v)])),
    };
  }

  // --- private state -------------------------------------------------------

  private async readPrivateState(): Promise<AmanaPrivateState> {
    const existing = await this.providers.privateStateProvider.get(amanaPrivateStateKey);
    return existing ?? createAmanaPrivateState(utils.randomBytes(32));
  }

  private async updatePrivateState(
    f: (ps: AmanaPrivateState) => AmanaPrivateState,
  ): Promise<AmanaPrivateState> {
    const next = f(await this.readPrivateState());
    await this.providers.privateStateProvider.set(amanaPrivateStateKey, next);
    return next;
  }

  /** This device's public registry key, were it to act as a lender. */
  async lenderKey(): Promise<string> {
    const ps = await this.readPrivateState();
    return toHex(Amana.pureCircuits.lenderKey(ps.secretKey));
  }

  /**
   * The pseudonym this borrower presents to one specific lender.
   *
   * A borrower runs this once per institution and hands over the result when
   * opening an account. Because the lender's own key is mixed into the hash,
   * the identifier two lenders hold for the same person are unrelatable, and
   * neither can be used to look the borrower up anywhere else.
   */
  async subjectIdFor(lenderKeyHex: string): Promise<string> {
    const ps = await this.readPrivateState();
    return toHex(Amana.pureCircuits.subjectId(ps.secretKey, fromHex(lenderKeyHex)));
  }

  // --- registry ------------------------------------------------------------

  async claimAuthority(): Promise<void> {
    this.logger?.info('claimAuthority');
    await this.deployedContract.callTx.claimAuthority();
  }

  async registerLender(lenderKeyHex: string): Promise<void> {
    this.logger?.info({ registerLender: lenderKeyHex });
    await this.deployedContract.callTx.registerLender(fromHex(lenderKeyHex));
  }

  // --- lender --------------------------------------------------------------

  /**
   * Issue an attestation.
   *
   * The record is written into private state and picked up by the
   * `pendingAttestation` witness, so the amounts are consumed by the circuit
   * without ever being transaction inputs. What lands on chain is one hash.
   *
   * The returned value is what the lender must hand back to the borrower —
   * out of band, over whatever channel they already use. Amana deliberately
   * has no opinion about that channel, because a credential the issuer can
   * also read back from a server is a credential the issuer still controls.
   */
  async issueAttestation(record: RepaymentRecord): Promise<IssuedAttestation> {
    if (record.onTime > record.total) {
      throw new Error('Amana: on-time repayments cannot exceed total repayments');
    }

    const ps = await this.readPrivateState();
    const attestation: Attestation = {
      lender: Amana.pureCircuits.lenderKey(ps.secretKey),
      subject: fromHex(record.subject),
      onTime: record.onTime,
      total: record.total,
      period: record.period,
      nonce: utils.randomBytes(32),
    };

    const leafIndex = await this.nextLeaf();

    await this.updatePrivateState((p) => ({ ...p, pending: attestation }));
    try {
      await this.deployedContract.callTx.issueAttestation();
    } finally {
      await this.updatePrivateState((p) => ({ ...p, pending: null }));
    }

    this.logger?.info({ issued: { leafIndex: leafIndex.toString() } });
    return { attestation, leafIndex };
  }

  async revokeAttestation(leafIndex: bigint): Promise<void> {
    this.logger?.info({ revoke: leafIndex.toString() });
    await this.deployedContract.callTx.revokeAttestation(leafIndex);
  }

  private async nextLeaf(): Promise<bigint> {
    const state = await this.providers.publicDataProvider.queryContractState(
      this.deployedContractAddress,
    );
    if (!state) throw new Error('Amana: contract state unavailable');
    return Amana.ledger(state.data).nextLeaf;
  }

  // --- borrower ------------------------------------------------------------

  /** Take a record a lender issued into this device's wallet. */
  async receiveAttestation(
    attestation: Attestation,
    leafIndex: bigint,
    lenderName = 'Unnamed institution',
  ): Promise<void> {
    await this.updatePrivateState((p) => ({
      ...p,
      wallet: [...p.wallet, { attestation, leafIndex, lenderName }],
    }));
  }

  /**
   * Answer a verifier's check.
   *
   * The selection of which records to present happens here, before the call,
   * because a witness cannot see the circuit's arguments and therefore cannot
   * know the verifier's terms.
   */
  async proveCreditStanding(
    checkIdHex: string,
    minOnTime: bigint,
    minPeriod: bigint,
  ): Promise<void> {
    const ps = await this.updatePrivateState((p) => ({
      ...p,
      presenting: selectAttestations(p.wallet, minOnTime, minPeriod),
    }));

    this.logger?.info({
      proving: { minOnTime: minOnTime.toString(), presenting: ps.presenting.length },
    });

    await this.deployedContract.callTx.proveCreditStanding(
      fromHex(checkIdHex),
      minOnTime,
      minPeriod,
    );
  }

  /** What this wallet could prove today, without proving it. */
  async canProve(minOnTime: bigint, minPeriod: bigint): Promise<boolean> {
    const ps = await this.readPrivateState();
    return provableTotal(ps.wallet, minPeriod) >= minOnTime;
  }

  // --- verifier ------------------------------------------------------------

  /** Read the outcome of a check this verifier issued. */
  async readCheck(checkIdHex: string): Promise<CheckOutcome> {
    const state = await this.providers.publicDataProvider.queryContractState(
      this.deployedContractAddress,
    );
    if (!state) return { checkId: checkIdHex, answered: false };

    const ledger = Amana.ledger(state.data);
    const key = fromHex(checkIdHex);
    if (!ledger.checks.member(key)) return { checkId: checkIdHex, answered: false };

    return { checkId: checkIdHex, answered: true, result: ledger.checks.lookup(key) };
  }

  // --- lifecycle -----------------------------------------------------------

  static async deploy(providers: AmanaProviders, logger?: Logger): Promise<AmanaAPI> {
    logger?.info('deploying Amana registry');
    const deployed = await deployContract(providers, {
      compiledContract: AmanaCompiledContract,
      privateStateId: amanaPrivateStateKey,
      initialPrivateState: createAmanaPrivateState(utils.randomBytes(32)),
    });
    return new AmanaAPI(deployed, providers, logger);
  }

  static async join(
    providers: AmanaProviders,
    contractAddress: ContractAddress,
    logger?: Logger,
  ): Promise<AmanaAPI> {
    logger?.info({ joining: contractAddress });
    providers.privateStateProvider.setContractAddress(contractAddress);
    const existing = await providers.privateStateProvider.get(amanaPrivateStateKey);

    const deployed = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: AmanaCompiledContract,
      privateStateId: amanaPrivateStateKey,
      initialPrivateState: existing ?? createAmanaPrivateState(utils.randomBytes(32)),
    });
    return new AmanaAPI(deployed, providers, logger);
  }
}
