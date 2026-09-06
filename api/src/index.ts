// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0
import { type ContractAddress, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { BehaviorSubject, combineLatest, map, switchMap, type Observable } from 'rxjs';
import type { Logger } from 'pino';
import * as Amana from '../../contract/src/managed/amana/contract/index.js';
import { AmanaCompiledContract, createAmanaPrivateState, isLiveAttestation, provableTotal,
  selectAttestations, type AmanaPrivateState, type Attestation } from '../../contract/src/index.js';
import { amanaPrivateStateKey, type AmanaDerivedState, type AmanaProviders, type CheckDraft,
  type CheckPolicy, type CheckOutcome, type DeployedAmanaContract, type RegistryState } from './common-types.js';
import * as utils from './utils/index.js';
export * from './common-types.js';
export * as utils from './utils/index.js';

export type RepaymentRecord = {
  readonly subject: string; readonly onTime: bigint; readonly total: bigint;
  /** Counts cover the entire inclusive reporting interval. */
  readonly periodStart: bigint; readonly periodEnd: bigint;
};
export type IssuedAttestation = { readonly attestation: Attestation; readonly leafIndex: bigint };

export class AmanaAPI {
  private readonly revision = new BehaviorSubject(0);
  // One pending witness operation per device instance. Avoid sharing a profile across tabs.
  private operations: Promise<unknown> = Promise.resolve();
  private constructor(
    public readonly deployedContract: DeployedAmanaContract,
    private readonly providers: AmanaProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.deployedContractAddress);
    const ledger$ = providers.publicDataProvider
      .contractStateObservable(this.deployedContractAddress, { type: 'latest' })
      .pipe(map((state) => Amana.ledger(state.data)));
    this.state$ = combineLatest([ledger$, this.revision]).pipe(
      switchMap(async ([ledger]) => this.derive(ledger, await this.readPrivateState())),
    );
  }
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<AmanaDerivedState>;

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operations.then(operation);
    this.operations = next.catch(() => undefined);
    return next;
  }
  private derive(ledger: Amana.Ledger, ps: AmanaPrivateState): AmanaDerivedState {
    const registry = AmanaAPI.readRegistry(ledger);
    const lenderKey = toHex(Amana.pureCircuits.lenderKey(ps.secretKey));
    const entries = ps.wallet.map((s) => ({ ...s, live: isLiveAttestation(ledger, s) }));
    return {
      registry,
      identity: { lenderKey, isRegisteredLender: ledger.lenders.member(utils.keyBytes(lenderKey)),
        isAuthority: registry.authority === lenderKey },
      wallet: { attestations: entries, liveCount: entries.filter((s) => s.live).length,
        provableOnTime: provableTotal(entries.filter((s) => s.live), 0n, utils.currentPeriod()) },
    };
  }
  static readRegistry(ledger: Amana.Ledger): RegistryState {
    return {
      bootstrapped: ledger.bootstrapped, authority: toHex(ledger.authority),
      lenders: [...ledger.lenders].map(toHex), attestationsIssued: ledger.issuedCount,
      attestationsRevoked: ledger.revokedCount, checksAnswered: ledger.acceptedCount, nextLeaf: ledger.nextLeaf,
      issuers: new Map([...ledger.issuers].map(([k, v]) => [k, toHex(v)])),
    };
  }
  private async readPrivateState(): Promise<AmanaPrivateState> {
    const ps = await this.providers.privateStateProvider.get(amanaPrivateStateKey);
    if (!ps) throw new Error('Amana private state is missing. Reconnect or restore your device backup.');
    return ps;
  }
  private async updatePrivateState(f: (ps: AmanaPrivateState) => AmanaPrivateState): Promise<void> {
    await this.providers.privateStateProvider.set(amanaPrivateStateKey, f(await this.readPrivateState()));
    this.revision.next(this.revision.value + 1);
  }
  private async readLedger(): Promise<Amana.Ledger> {
    const state = await this.providers.publicDataProvider.queryContractState(this.deployedContractAddress);
    if (!state) throw new Error('Registry state unavailable. Check the network connection.');
    return Amana.ledger(state.data);
  }
  async lenderKey(): Promise<string> {
    return toHex(Amana.pureCircuits.lenderKey((await this.readPrivateState()).secretKey));
  }
  async subjectIdFor(lenderKeyHex: string): Promise<string> {
    return toHex(Amana.pureCircuits.subjectId((await this.readPrivateState()).secretKey, utils.keyBytes(lenderKeyHex)));
  }
  async claimAuthority(): Promise<void> {
    return this.exclusive(async () => { await this.deployedContract.callTx.claimAuthority(); });
  }
  async registerLender(key: string): Promise<void> {
    return this.exclusive(async () => { await this.deployedContract.callTx.registerLender(utils.keyBytes(key)); });
  }
  async issueAttestation(record: RepaymentRecord): Promise<IssuedAttestation> {
    return this.exclusive(async () => {
      const ps = await this.readPrivateState();
      const attestation: Attestation = {
        lender: Amana.pureCircuits.lenderKey(ps.secretKey), subject: utils.keyBytes(record.subject),
        onTime: record.onTime, total: record.total, periodStart: record.periodStart, periodEnd: record.periodEnd,
        nonce: utils.randomBytes(32),
      };
      utils.validateAttestation(attestation);
      await this.updatePrivateState((p) => ({ ...p, pending: attestation }));
      try {
        const tx = await this.deployedContract.callTx.issueAttestation();
        // Use the index allocated in the finalized call, not a pre-transaction ledger read.
        return { attestation, leafIndex: tx.private.result };
      } finally {
        await this.updatePrivateState((p) => ({ ...p, pending: null }));
      }
    });
  }
  async revokeAttestation(leafIndex: bigint): Promise<void> {
    return this.exclusive(async () => {
      await this.deployedContract.callTx.revokeAttestation(utils.uint(leafIndex, 10, 'Leaf index'));
    });
  }
  async receiveAttestation(attestation: Attestation, leafIndex: bigint, lenderName = 'Unnamed institution'): Promise<void> {
    return this.exclusive(async () => {
      utils.validateAttestation(attestation); utils.uint(leafIndex, 10, 'Leaf index');
      if (typeof lenderName !== 'string' || lenderName.length > 160) throw new Error('Invalid institution label.');
      const ps = await this.readPrivateState();
      const expected = Amana.pureCircuits.subjectId(ps.secretKey, attestation.lender);
      if (toHex(expected) !== toHex(attestation.subject)) throw new Error('This credential belongs to a different borrower.');
      const stored = { attestation, leafIndex, lenderName };
      if (!isLiveAttestation(await this.readLedger(), stored)) throw new Error('Credential is not live at this registry leaf.');
      if (ps.wallet.some((s) => s.leafIndex === leafIndex)) throw new Error('This credential is already in your wallet.');
      await this.updatePrivateState((p) => ({ ...p, wallet: [...p.wallet, stored] }));
    });
  }
  async importCredential(text: string): Promise<void> {
    const c = utils.decodeCredential(text);
    if (toHex(utils.keyBytes(c.contractAddress)) !== this.deployedContractAddress)
      throw new Error('This credential was issued by a different registry.');
    await this.receiveAttestation(c.attestation, c.leafIndex, c.lenderName);
  }
  async draftCheck(): Promise<CheckDraft> {
    const verifier = Amana.pureCircuits.verifierKey((await this.readPrivateState()).secretKey);
    const nonce = utils.randomBytes(32);
    return { checkId: toHex(Amana.pureCircuits.requestId(verifier, nonce)), nonce: toHex(nonce), verifier: toHex(verifier) };
  }
  /** Send over the authenticated channel used for this application. Safe to publish for this check. */
  async checkRecipientFor(checkId: string): Promise<string> {
    return toHex(Amana.pureCircuits.checkRecipient((await this.readPrivateState()).secretKey, utils.keyBytes(checkId)));
  }
  async createCheck(draft: CheckDraft, policy: CheckPolicy, recipient: string): Promise<void> {
    return this.exclusive(async () => {
      utils.uint(policy.minOnTime, 16, 'Threshold'); utils.uint(policy.minPeriod, 32); utils.uint(policy.maxPeriod, 32);
      if (policy.minOnTime === 0n || policy.minPeriod > policy.maxPeriod) throw new Error('Use a positive threshold and a valid reporting window.');
      const verifier = Amana.pureCircuits.verifierKey((await this.readPrivateState()).secretKey);
      if (toHex(verifier) !== draft.verifier) throw new Error('This draft belongs to a different verifier.');
      await this.deployedContract.callTx.createCheck(utils.keyBytes(draft.checkId), utils.keyBytes(draft.nonce),
        utils.keyBytes(recipient), policy.minOnTime, policy.minPeriod, policy.maxPeriod);
    });
  }
  async proveCreditStanding(checkId: string): Promise<void> {
    return this.exclusive(async () => {
      const ledger = await this.readLedger();
      const key = utils.keyBytes(checkId);
      if (!ledger.requestedChecks.member(key)) throw new Error('The verifier has not committed this check yet.');
      if (ledger.checks.member(key)) throw new Error('This check has already been answered.');
      const terms = ledger.requestedChecks.lookup(key);
      if (toHex(terms.recipient) !== await this.checkRecipientFor(checkId)) throw new Error('This check is for a different borrower.');
      const ps = await this.readPrivateState();
      const live = ps.wallet.filter((s) => isLiveAttestation(ledger, s));
      if (provableTotal(live, terms.minPeriod, terms.maxPeriod) < terms.minOnTime)
        throw new Error('Your live summaries do not meet the committed threshold and reporting window.');
      await this.updatePrivateState((p) => ({ ...p,
        presenting: selectAttestations(live, terms.minOnTime, terms.minPeriod, terms.maxPeriod) }));
      try {
        await this.deployedContract.callTx.proveCreditStanding(key);
        this.logger?.info({ answeredCheck: checkId });
      } finally {
        await this.updatePrivateState((p) => ({ ...p, presenting: [] }));
      }
    });
  }
  async readCheck(checkId: string): Promise<CheckOutcome> {
    const ledger = await this.readLedger();
    const key = utils.keyBytes(checkId);
    if (!ledger.requestedChecks.member(key)) return { checkId, exists: false, answered: false };
    const terms = ledger.requestedChecks.lookup(key);
    if (!ledger.checks.member(key)) return { checkId, exists: true, answered: false, terms };
    const result = ledger.checks.lookup(key);
    if (result.minOnTime !== terms.minOnTime || result.minPeriod !== terms.minPeriod || result.maxPeriod !== terms.maxPeriod)
      throw new Error('Recorded result does not match the committed check terms.');
    return { checkId, exists: true, answered: true, terms, result };
  }
  static async deploy(providers: AmanaProviders, logger?: Logger): Promise<AmanaAPI> {
    const initialPrivateState = createAmanaPrivateState(utils.randomBytes(32));
    const deployed = await deployContract(providers, {
      compiledContract: AmanaCompiledContract, privateStateId: amanaPrivateStateKey, initialPrivateState,
      args: [Amana.pureCircuits.lenderKey(initialPrivateState.secretKey)],
    });
    return new AmanaAPI(deployed, providers, logger);
  }
  static async join(providers: AmanaProviders, contractAddress: ContractAddress, logger?: Logger): Promise<AmanaAPI> {
    const state = await providers.publicDataProvider.queryContractState(contractAddress);
    if (!state) throw new Error('Registry not found on the selected network.');
    try {
      if (Amana.ledger(state.data).protocolVersion !== 2n) throw new Error('version');
    } catch { throw new Error('Incompatible registry. This client requires a fresh Amana version 2 deployment.'); }
    providers.privateStateProvider.setContractAddress(contractAddress);
    const existing = await providers.privateStateProvider.get(amanaPrivateStateKey);
    const deployed = await findDeployedContract(providers, {
      contractAddress, compiledContract: AmanaCompiledContract, privateStateId: amanaPrivateStateKey,
      initialPrivateState: existing ?? createAmanaPrivateState(utils.randomBytes(32)),
    });
    return new AmanaAPI(deployed, providers, logger);
  }
}
