// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * `npm run verify:onchain [network]` — check the deployed registry against the
 * evidence recorded in `docs/evidence/<network>.json`, using nothing but the
 * public indexer. No wallet, no proof server, no trust in this repository's
 * claims beyond the file being checked.
 *
 * Needs the compiled contract bindings for the ledger layout. They come from
 * `npm run compact:check`, which skips proving keys and takes seconds.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { evaluate } from './onchain-checks.mjs';

const network = process.argv[2] ?? 'preview';
const root = new URL('../', import.meta.url);
const evidence = JSON.parse(readFileSync(new URL(`docs/evidence/${network}.json`, root), 'utf8'));
const indexer = process.env.AMANA_INDEXER_URL ?? evidence.indexer;

const bindings = new URL('contract/src/managed/amana/contract/index.js', root);
if (!existsSync(fileURLToPath(bindings))) {
  console.error('Contract bindings not found. Run `npm run compact:check` first (no proving keys needed).');
  process.exit(2);
}
const { ledger } = await import(pathToFileURL(fileURLToPath(bindings)).href);

const hex = (bytes) => Buffer.from(bytes).toString('hex');

const readSnapshot = async () => {
  setNetworkId(network);
  const provider = indexerPublicDataProvider(indexer, indexer.replace(/^http/, 'ws') + '/ws', globalThis.WebSocket);
  const state = await provider.queryContractState(evidence.contract);
  if (!state) throw new Error(`No contract at ${evidence.contract} on ${network}.`);
  const l = ledger(state.data);
  const terms = (t) => ({ minOnTime: t.minOnTime, minPeriod: t.minPeriod, maxPeriod: t.maxPeriod });
  return {
    protocolVersion: l.protocolVersion, bootstrapped: l.bootstrapped, authority: hex(l.authority),
    lenders: [...l.lenders].map(hex), issuers: [...l.issuers].map(([leaf, lender]) => [leaf, hex(lender)]),
    nextLeaf: l.nextLeaf, issuedCount: l.issuedCount, revokedCount: l.revokedCount, acceptedCount: l.acceptedCount,
    requestedChecks: [...l.requestedChecks].map(([id, t]) => [hex(id), terms(t)]),
    checks: [...l.checks].map(([id, r]) => [hex(id), terms(r)]),
    nullifierCount: l.nullifiers.size(),
  };
};

/** Every transaction that touched the registry, newest first, with the circuit it called. */
const readHistory = async () => {
  const query = `{ contract(address: "${evidence.contract}") { actions(limit: 1000) {
    __typename transaction { hash block { height } } ... on ContractCall { entryPoint } } } }`;
  const response = await fetch(indexer, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`Indexer returned HTTP ${response.status} for the registry history.`);
  const actions = (await response.json()).data?.contract?.actions ?? [];
  const kinds = { ContractDeploy: 'deploy', ContractCall: 'call', ContractUpdate: 'update' };
  return actions.map((a) => ({
    hash: a.transaction.hash, block: a.transaction.block.height, address: evidence.contract,
    kind: kinds[a.__typename] ?? 'none', circuit: a.entryPoint ?? null,
  }));
};

const snapshot = await readSnapshot();
const history = await readHistory();
const transactions = new Map(evidence.transactions.map((tx) =>
  [tx.hash, history.find((h) => h.hash === tx.hash) ?? null]));
const results = evaluate(evidence, snapshot, transactions);

console.log(`Amana on-chain verification · ${network} · registry ${evidence.contract}`);
console.log(`Indexer ${indexer} · evidence recorded ${evidence.recorded}\n`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
console.log(`Live now: ${snapshot.lenders.length} institutions, ${snapshot.issuedCount} records issued, `
  + `${snapshot.revokedCount} revoked, ${snapshot.acceptedCount} credit checks answered.`);
const tally = new Map();
for (const h of [...history].reverse()) tally.set(h.circuit ?? h.kind, (tally.get(h.circuit ?? h.kind) ?? 0) + 1);
console.log(`History: ${history.length} transactions · `
  + [...tally].map(([name, n]) => (n > 1 ? `${n}× ${name}` : name)).join(', ') + '.');
process.exitCode = failed === 0 ? 0 : 1;
