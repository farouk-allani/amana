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

const readTransaction = async (hash) => {
  const query = `{ transactions(offset: { hash: "${hash}" }) {
    block { height } contractActions { __typename address } } }`;
  const response = await fetch(indexer, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`Indexer returned HTTP ${response.status} for ${hash}.`);
  const tx = (await response.json()).data?.transactions?.[0];
  if (!tx) return null;
  const action = tx.contractActions.find((a) => a.address === evidence.contract) ?? tx.contractActions[0];
  const kind = { ContractDeploy: 'deploy', ContractCall: 'call', ContractUpdate: 'update' }[action?.__typename];
  return { block: tx.block.height, address: action?.address ?? '', kind: kind ?? 'none' };
};

const snapshot = await readSnapshot();
const transactions = new Map(await Promise.all(
  evidence.transactions.map(async (tx) => [tx.hash, await readTransaction(tx.hash)])));
const results = evaluate(evidence, snapshot, transactions);

console.log(`Amana on-chain verification · ${network} · registry ${evidence.contract}`);
console.log(`Indexer ${indexer} · evidence recorded ${evidence.recorded}\n`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
const orphaned = snapshot.issuers.filter(([, lender]) => !snapshot.lenders.includes(lender)).length;
console.log(`Live now: ${snapshot.lenders.length} institutions, ${snapshot.issuedCount} records issued, `
  + `${snapshot.revokedCount} revoked, ${snapshot.acceptedCount} credit checks answered`
  + (orphaned ? `, ${orphaned} records of withdrawn institutions awaiting voiding.` : '.'));
process.exitCode = failed === 0 ? 0 : 1;
