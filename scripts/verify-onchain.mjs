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

import { readFileSync } from 'node:fs';
import { evaluate } from './onchain-checks.mjs';
import { readHistory, readSnapshot } from './onchain-read.mjs';

const network = process.argv[2] ?? 'preview';
const evidence = JSON.parse(readFileSync(new URL(`../docs/evidence/${network}.json`, import.meta.url), 'utf8'));
const indexer = process.env.AMANA_INDEXER_URL ?? evidence.indexer;

const snapshot = await readSnapshot(network, indexer, evidence.contract);
const history = await readHistory(indexer, evidence.contract);
const transactions = new Map(evidence.transactions.map((tx) =>
  [tx.hash, history.find((h) => h.hash === tx.hash) ?? null]));
const results = evaluate(evidence, snapshot, transactions);

console.log(`Amana on-chain verification · ${network} · registry ${evidence.contract}`);
console.log(`Indexer ${indexer} · evidence recorded ${evidence.recorded}\n`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
const orphaned = snapshot.issuers.filter(([, lender]) => !snapshot.lenders.includes(lender)).length;
const count = (n, noun) => `${n} ${noun}${n === 1 || n === 1n ? '' : 's'}`;
console.log(`Live now: ${count(snapshot.lenders.length, 'institution')}, ${count(snapshot.issuedCount, 'record')} issued, `
  + `${snapshot.revokedCount} revoked, ${count(snapshot.acceptedCount, 'credit check')} answered`
  + (orphaned ? `, ${orphaned} records of withdrawn institutions awaiting voiding.` : '.'));
const tally = new Map();
for (const h of [...history].reverse()) tally.set(h.circuit ?? h.kind, (tally.get(h.circuit ?? h.kind) ?? 0) + 1);
console.log(`History: ${history.length} transactions · `
  + [...tally].map(([name, n]) => (n > 1 ? `${n}× ${name}` : name)).join(', ') + '.');
process.exitCode = failed === 0 ? 0 : 1;
