// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * `npm run evidence:record [network]` — turn a finished run into the two files
 * the repository publishes:
 *
 * - `docs/evidence/<network>.json`, what `verify:onchain` checks: the
 *   registry's ledger and every transaction with its circuit, read back from
 *   the public indexer rather than taken from the run's own log.
 * - `docs/evidence/<network>-run.md`, the run as a table. Each transaction is
 *   matched to the indexer's history in order, and the match fails loudly if
 *   any step's circuit disagrees with what the chain recorded.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { networks } from './wallet.mjs';
import { readHistory, readSnapshot } from '../onchain-read.mjs';

const name = process.argv[2] ?? 'preview';
const network = networks[name];
const doc = (file) => new URL(`../../docs/evidence/${file}`, import.meta.url);
const run = JSON.parse(readFileSync(doc(`${name}-run.json`), 'utf8'));

const snapshot = await readSnapshot(name, network.indexer, run.contract);
const history = (await readHistory(network.indexer, run.contract)).reverse();

const sent = run.steps.filter((s) => s.outcome === 'transaction');
if (history.length < sent.length) throw new Error(`Indexer shows ${history.length} transactions; the run sent ${sent.length}.`);
sent.forEach((step, i) => {
  if (history[i].circuit !== (step.circuit === 'deploy' ? null : step.circuit) || (i === 0) !== (history[i].kind === 'deploy')) {
    throw new Error(`Step "${step.action}" expected ${step.circuit}, chain shows ${history[i].circuit ?? history[i].kind}.`);
  }
  Object.assign(step, { hash: history[i].hash, block: history[i].block });
});

const evidence = {
  network: name,
  indexer: network.indexer,
  contract: run.contract,
  recorded: new Date().toISOString().slice(0, 10),
  ledger: {
    protocolVersion: Number(snapshot.protocolVersion),
    authority: snapshot.authority,
    lenders: snapshot.lenders,
    issuers: Object.fromEntries(snapshot.issuers.map(([leaf, lender]) => [String(leaf), lender])),
    issuedCount: Number(snapshot.issuedCount),
    revokedCount: Number(snapshot.revokedCount),
    acceptedCount: Number(snapshot.acceptedCount),
  },
  transactions: history.map((h) => ({
    kind: h.kind, ...(h.circuit ? { circuit: h.circuit } : {}), hash: h.hash, block: h.block })),
};
const json = JSON.stringify(evidence, null, 2).replace(/\{\n\s+("kind"[^}]+?)\n\s+\}/g,
  (_, body) => `{ ${body.split('\n').map((l) => l.trim()).join(' ')} }`);
writeFileSync(doc(`${name}.json`), json + '\n');

const short = (h) => `${h.slice(0, 10)}…`;
const rows = run.steps.map((s, i) => {
  const result = s.outcome === 'transaction'
    ? `[${short(s.hash)}](${network.explorer}/transactions/${s.hash}) · block ${s.block.toLocaleString('en-US')}`
    : `**Refused**, no transaction: \`${s.reason}\``;
  return `| ${i + 1} | ${s.actor} | ${s.action} | \`${s.circuit}\` | ${result} |`;
});
const refusals = run.steps.length - sent.length;
writeFileSync(doc(`${name}-run.md`), `# Evidence run on ${name}

Registry \`${run.contract}\`, run on ${run.finished.slice(0, 10)} with \`npm run evidence\`.

${run.steps.length} steps: ${sent.length} transactions with real zero-knowledge proofs, and ${refusals} refusals. A refusal is a call the circuit rejected while it was executing locally, so no proof was produced and nothing reached the chain. Each refusal is recorded with the circuit's own assertion message.

One funded test wallet paid every fee; the participants are separate Amana identities, not separate wallets. In real use each participant pays from its own wallet ([AUD-13](../AUDIT.md#aud-13)).

| # | Who | What | Circuit | Result |
|---|---|---|---|---|
${rows.join('\n')}

Re-check the chain side with \`npm run verify:onchain\`. The transaction hashes above come from the public indexer, not from the run's own log.
`);
console.log(`Recorded ${history.length} transactions and ${refusals} refusals for ${run.contract}.`);
