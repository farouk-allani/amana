// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * `npm run evidence [network]` — deploy a fresh Amana registry and run the
 * whole protocol against it with real proofs, recording every step.
 *
 * Seven participants act from separate private states: an operator, two
 * institutions, a borrower, a verifier, an outsider holding nothing, and a
 * successor operator. Transactions are recorded with their circuit. Refusals
 * are recorded with the circuit's own assertion: each is a call the circuit
 * rejected while it was being executed locally, so no proof was produced and
 * nothing was submitted.
 *
 * Prerequisites: `npm run compact && npm run build`, a local proof server on
 * :6300, and a test wallet funded through `npm run evidence:wallet`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { AmanaAPI, amanaPrivateStateKey, utils } from '@amana/api';
import { networks, loadOrCreateSeed, buildWallet, ensureFunded, saveWallet, walletProviders, log } from './wallet.mjs';

const network = networks[process.argv[2] ?? 'preview'];
const path = (relative) => fileURLToPath(new URL(`../../${relative}`, import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const stateDir = path(`.evidence/${network.networkId}/run-${stamp}`);

// --- private state: one file per participant ---------------------------------

const encode = (value) => JSON.stringify(value, (_k, v) =>
  v instanceof Uint8Array ? { $bytes: Buffer.from(v).toString('hex') }
    : typeof v === 'bigint' ? { $bigint: v.toString() } : v);
const decode = (text) => JSON.parse(text, (_k, v) =>
  v && typeof v === 'object' && '$bytes' in v ? new Uint8Array(Buffer.from(v.$bytes, 'hex'))
    : v && typeof v === 'object' && '$bigint' in v ? BigInt(v.$bigint) : v);

const filePrivateStateProvider = (file) => {
  const store = existsSync(file) ? decode(readFileSync(file, 'utf8')) : { states: {}, signingKeys: {} };
  const save = () => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, encode(store)); };
  return {
    setContractAddress() {},
    async set(id, state) { store.states[id] = state; save(); },
    async get(id) { return store.states[id] ?? null; },
    async remove(id) { delete store.states[id]; save(); },
    async clear() { store.states = {}; save(); },
    async setSigningKey(address, key) { store.signingKeys[address] = key; save(); },
    async getSigningKey(address) { return store.signingKeys[address] ?? null; },
    async removeSigningKey(address) { delete store.signingKeys[address]; save(); },
    async clearSigningKeys() { store.signingKeys = {}; save(); },
  };
};

// --- the record ---------------------------------------------------------------

const steps = [];
const describe = (e) => (e instanceof Error ? e.message : String(e));

/**
 * Balancing happens before submission, so a fee the wallet cannot yet cover
 * fails with nothing sent. DUST keeps accruing; wait and try the step again.
 */
const payable = async (run) => {
  for (let attempt = 1; ; attempt++) {
    try { return await run(); } catch (e) {
      if (attempt >= 10 || !/insufficient|not enough|dust|fee/i.test(describe(e))) throw e;
      log(`  Fee not yet covered (${describe(e).slice(0, 120)}); waiting 2 minutes for DUST…`);
      await new Promise((r) => setTimeout(r, 120_000));
    }
  }
};

const transaction = async (actor, action, circuit, run) => {
  log(`${actor}: ${action}…`);
  const started = Date.now();
  const result = await payable(run);
  steps.push({ actor, action, circuit, outcome: 'transaction', seconds: Math.round((Date.now() - started) / 1000) });
  log(`  ✓ ${circuit} (${Math.round((Date.now() - started) / 1000)} s)`);
  return result;
};

const refusal = async (actor, action, circuit, expected, run) => {
  log(`${actor}: ${action}…`);
  let reason;
  try {
    await run();
  } catch (e) {
    reason = describe(e);
  }
  if (reason === undefined) throw new Error(`Expected a refusal, but "${action}" succeeded.`);
  if (!reason.includes(expected)) throw new Error(`"${action}" was refused for the wrong reason: ${reason}`);
  steps.push({ actor, action, circuit, outcome: 'refused', reason: expected });
  log(`  ✓ refused by ${circuit}: ${expected}`);
};

/** The indexer trails finalization slightly; retry reads that depend on it. */
const eventually = async (run, tries = 20) => {
  for (let i = 1; ; i++) {
    try { return await run(); } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
};

// --- set up -------------------------------------------------------------------

const ctx = await buildWallet(network, loadOrCreateSeed(path(`.evidence/${network.networkId}/wallet-seed`)),
  path(`.evidence/${network.networkId}/wallet-state.json`));
log(`Test wallet ${ctx.address}`);
await ensureFunded(ctx);
const { walletProvider, midnightProvider } = await walletProviders(ctx);
const zkConfigProvider = new NodeZkConfigProvider(path('contract/src/managed/amana'));
const shared = {
  publicDataProvider: indexerPublicDataProvider(network.indexer, network.indexerWS),
  zkConfigProvider,
  proofProvider: httpClientProofProvider(network.proofServer, zkConfigProvider),
  walletProvider,
  midnightProvider,
};
const stateFiles = new Map();
const providersFor = (actor) => {
  const privateStateProvider = filePrivateStateProvider(`${stateDir}/${actor}.json`);
  stateFiles.set(actor, privateStateProvider);
  return { ...shared, privateStateProvider };
};

const NOW = utils.currentPeriod();
const WINDOW = { minPeriod: NOW - 23n, maxPeriod: NOW };
const key = (hex) => utils.keyBytes(hex);

// --- the run ------------------------------------------------------------------

const operator = await transaction('Operator', 'Deploy a protocol 3 registry', 'deploy',
  () => AmanaAPI.deploy(providersFor('operator')));
const address = operator.deployedContractAddress;
log(`Registry ${address}`);
const join = (actor) => eventually(() => AmanaAPI.join(providersFor(actor), address));

await transaction('Operator', 'Activate the registry with the key committed at deployment', 'claimAuthority',
  () => operator.claimAuthority());

const [lenderA, lenderB, borrower, verifier, outsider, successor] = await Promise.all(
  ['lenderA', 'lenderB', 'borrower', 'verifier', 'outsider', 'successor'].map(join));
const keyA = await lenderA.lenderKey(), keyB = await lenderB.lenderKey();

await transaction('Operator', 'Admit institution A', 'registerLender', () => operator.registerLender(keyA));
await transaction('Operator', 'Admit institution B', 'registerLender', () => operator.registerLender(keyB));

const issue = async (lender, name, onTime, total) => {
  const issued = await lender.issueAttestation({
    subject: await borrower.subjectIdFor(await lender.lenderKey()), onTime, total, ...{
      periodStart: WINDOW.minPeriod, periodEnd: WINDOW.maxPeriod },
  });
  await eventually(() => borrower.importCredential(
    utils.encodeCredential(issued.attestation, issued.leafIndex, name, address)));
  return issued;
};
const recordA = await transaction('Institution A', 'Issue 8 on-time of 8 over 24 months to the borrower\'s A-pseudonym',
  'issueAttestation', () => issue(lenderA, 'Institution A', 8n, 8n));
const recordB = await transaction('Institution B', 'Issue 6 on-time of 7 over 24 months to the borrower\'s B-pseudonym',
  'issueAttestation', () => issue(lenderB, 'Institution B', 6n, 7n));

const check = async (minOnTime) => {
  const draft = await verifier.draftCheck();
  const recipient = await borrower.checkRecipientFor(draft.checkId);
  await verifier.createCheck(draft, { minOnTime, ...WINDOW }, recipient);
  return draft.checkId;
};
const check14 = await transaction('Verifier', 'Commit a check: at least 14 on-time repayments in 24 months',
  'createCheck', () => check(14n));

await refusal('Outsider', 'Answer the borrower\'s check', 'proveCreditStanding', 'check is for a different borrower',
  () => outsider.deployedContract.callTx.proveCreditStanding(key(check14)));

await transaction('Borrower', 'Prove 8 + 6 clears 14, revealing neither institution nor total',
  'proveCreditStanding', () => borrower.proveCreditStanding(check14));
const outcome = await eventually(async () => {
  const o = await verifier.readCheck(check14);
  if (!o.answered) throw new Error('not yet indexed');
  return o;
});
log(`  Verifier reads: cleared ${outcome.result.minOnTime} on-time in months ${outcome.result.minPeriod}–${outcome.result.maxPeriod}.`);

await refusal('Borrower', 'Answer the same check a second time', 'proveCreditStanding', 'check has already been answered',
  () => borrower.deployedContract.callTx.proveCreditStanding(key(check14)));

const check15 = await transaction('Verifier', 'Commit a stricter check: at least 15', 'createCheck', () => check(15n));

// The borrower holds 14 and edits institution A's record from 8 to 9 to reach 15.
const borrowerState = stateFiles.get('borrower');
const honest = await borrowerState.get(amanaPrivateStateKey);
await borrowerState.set(amanaPrivateStateKey, {
  ...honest,
  wallet: honest.wallet.map((s) => s.leafIndex === recordA.leafIndex
    ? { ...s, attestation: { ...s.attestation, onTime: 9n, total: 9n } } : s),
  presenting: [recordA.leafIndex, recordB.leafIndex],
});
await refusal('Borrower', 'Inflate institution A\'s record from 8 to 9 to reach 15', 'proveCreditStanding',
  'attestation is not live in the registry', () => borrower.deployedContract.callTx.proveCreditStanding(key(check15)));
await borrowerState.set(amanaPrivateStateKey, honest);

await transaction('Operator', 'Withdraw institution B', 'removeLender', () => operator.removeLender(keyB));

await refusal('Institution B', 'Issue another record after withdrawal', 'issueAttestation', 'not a registered lender',
  () => lenderB.issueAttestation({ subject: '00'.repeat(31) + '01', onTime: 1n, total: 1n,
    periodStart: WINDOW.minPeriod, periodEnd: WINDOW.maxPeriod }));
await refusal('Operator', 'Void a record of institution A, which is still admitted', 'revokeOrphanedAttestation',
  'the issuer is still admitted and alone may revoke',
  () => operator.deployedContract.callTx.revokeOrphanedAttestation(recordA.leafIndex));

await transaction('Operator', 'Void institution B\'s record', 'revokeOrphanedAttestation',
  () => eventually(() => operator.revokeOrphanedAttestation(recordB.leafIndex)));

const check14b = await transaction('Verifier', 'Commit a fresh check at 14', 'createCheck', () => check(14n));
const afterVoid = await borrowerState.get(amanaPrivateStateKey);
await borrowerState.set(amanaPrivateStateKey, { ...afterVoid, presenting: [recordA.leafIndex, recordB.leafIndex] });
await refusal('Borrower', 'Present the voided record from institution B', 'proveCreditStanding',
  'attestation is not live in the registry', () => borrower.deployedContract.callTx.proveCreditStanding(key(check14b)));
await borrowerState.set(amanaPrivateStateKey, { ...afterVoid, presenting: [] });

const successorKey = await successor.lenderKey();
await transaction('Operator', 'Offer the registry to a successor key', 'proposeAuthority',
  () => operator.proposeAuthority(successorKey));
await transaction('Successor', 'Accept the registry', 'acceptAuthority', () => eventually(() => successor.acceptAuthority()));
await refusal('Former operator', 'Admit an institution after handing over', 'registerLender',
  'only the authority may register lenders', () => operator.registerLender(keyA));

// --- write it down ------------------------------------------------------------

const run = {
  network: network.networkId, contract: address, wallet: ctx.address,
  started: stamp, finished: new Date().toISOString(), proofServer: network.proofServer, steps,
};
mkdirSync(stateDir, { recursive: true });
writeFileSync(`${stateDir}/run.json`, JSON.stringify(run, null, 2));
writeFileSync(path(`docs/evidence/${network.networkId}-run.json`), JSON.stringify(run, null, 2) + '\n');
const sent = steps.filter((s) => s.outcome === 'transaction').length;
log(`Done: ${steps.length} steps, ${sent} transactions, ${steps.length - sent} refusals. Registry ${address}.`);
await saveWallet(ctx);
await ctx.wallet.stop();
process.exit(0);
