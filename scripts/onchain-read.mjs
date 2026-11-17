// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Read a deployed Amana registry through the public indexer: its ledger, as
 * plain hex strings and bigints, and its full transaction history. Shared by
 * `verify:onchain` and the evidence recorder.
 *
 * Needs the compiled contract bindings for the ledger layout, which
 * `npm run compact:check` produces without proving keys.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';

const bindings = fileURLToPath(new URL('../contract/src/managed/amana/contract/index.js', import.meta.url));

const loadLedger = async () => {
  if (!existsSync(bindings)) {
    console.error('Contract bindings not found. Run `npm run compact:check` first (no proving keys needed).');
    process.exit(2);
  }
  return (await import(pathToFileURL(bindings).href)).ledger;
};

const hex = (bytes) => Buffer.from(bytes).toString('hex');

/** The indexer's subscription endpoint: `/ws` after the path, keeping any query (Blockfrost's project id). */
const wsUrl = (indexer) => {
  const url = new URL(indexer);
  url.protocol = url.protocol.replace(/^http/, 'ws');
  url.pathname = url.pathname.replace(/\/$/, '') + '/ws';
  return url.toString();
};

/**
 * Blockfrost's indexers need a project id, which is a credential and never
 * recorded. Add it from the environment when the URL points there.
 */
export const authorise = (indexer, network) => {
  const id = process.env[`BLOCKFROST_${network.toUpperCase()}_PROJECT_ID`];
  const url = new URL(indexer);
  if (!url.hostname.endsWith('.blockfrost.io') || url.searchParams.has('project_id')) return indexer;
  if (!id) throw new Error(`The ${network} indexer is hosted by Blockfrost. Set BLOCKFROST_${network.toUpperCase()}_PROJECT_ID.`);
  url.searchParams.set('project_id', id);
  return url.toString();
};

/** The URL as it is safe to print: without the project id. */
export const redact = (indexer) => {
  const url = new URL(indexer);
  url.searchParams.delete('project_id');
  return url.toString();
};
const terms = (t) => ({ minOnTime: t.minOnTime, minPeriod: t.minPeriod, maxPeriod: t.maxPeriod });

export const readSnapshot = async (network, indexer, contract) => {
  const ledger = await loadLedger();
  const provider = indexerPublicDataProvider({ queryURL: indexer, subscriptionURL: wsUrl(indexer), webSocket: globalThis.WebSocket });
  const read = await provider.queryContractState(contract);
  if (!read) throw new Error(`No contract at ${contract} on ${network}.`);
  // The indexer serves bytes tagged with the ledger that wrote them. A
  // registry deployed before the ledger 9 fork reads as ledger 9 once a
  // post-fork transaction has touched it; one untouched since does not.
  if (read.contractState.era !== 'v9')
    throw new Error(`The registry's state on ${network} was written by ledger ${read.contractState.era}; this reader decodes ledger 9.`);
  const l = ledger(read.contractState.deserialize({ v9: ContractState }).data);
  return {
    protocolVersion: l.protocolVersion, bootstrapped: l.bootstrapped, authority: hex(l.authority),
    lenders: [...l.lenders].map(hex), issuers: [...l.issuers].map(([leaf, lender]) => [leaf, hex(lender)]),
    nextLeaf: l.nextLeaf, issuedCount: l.issuedCount, revokedCount: l.revokedCount, acceptedCount: l.acceptedCount,
    requestedChecks: [...l.requestedChecks].map(([id, t]) => [hex(id), terms(t)]),
    checks: [...l.checks].map(([id, r]) => [hex(id), terms(r)]),
    nullifierCount: l.nullifiers.size(),
  };
};

/** The height of the newest block the indexer knows. */
export const readTip = async (indexer) => {
  const response = await fetch(indexer, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ block { height } }' }),
  });
  if (!response.ok) throw new Error(`Indexer returned HTTP ${response.status} for the chain tip.`);
  const height = (await response.json()).data?.block?.height;
  if (typeof height !== 'number') throw new Error('Indexer did not report a chain tip.');
  return height;
};

/** Every transaction that touched the registry, newest first, with the circuit it called. */
export const readHistory = async (indexer, contract) => {
  const query = `{ contract(address: "${contract}") { actions(limit: 1000) {
    __typename transaction { hash block { height } } ... on ContractCall { entryPoint } } } }`;
  const response = await fetch(indexer, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`Indexer returned HTTP ${response.status} for the registry history.`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(`Indexer refused the history query: ${body.errors[0].message}`);
  const actions = body.data?.contract?.actions ?? [];
  const kinds = { ContractDeploy: 'deploy', ContractCall: 'call', ContractUpdate: 'update' };
  return actions.map((a) => ({
    hash: a.transaction.hash, block: a.transaction.block.height, address: contract,
    kind: kinds[a.__typename] ?? 'none', circuit: a.entryPoint ?? null,
  }));
};
