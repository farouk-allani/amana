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
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
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
const terms = (t) => ({ minOnTime: t.minOnTime, minPeriod: t.minPeriod, maxPeriod: t.maxPeriod });

export const readSnapshot = async (network, indexer, contract) => {
  const ledger = await loadLedger();
  setNetworkId(network);
  const provider = indexerPublicDataProvider(indexer, indexer.replace(/^http/, 'ws') + '/ws', globalThis.WebSocket);
  const state = await provider.queryContractState(contract);
  if (!state) throw new Error(`No contract at ${contract} on ${network}.`);
  const l = ledger(state.data);
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
export const readHistory = async (indexer, contract) => {
  const query = `{ contract(address: "${contract}") { actions(limit: 1000) {
    __typename transaction { hash block { height } } ... on ContractCall { entryPoint } } } }`;
  const response = await fetch(indexer, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`Indexer returned HTTP ${response.status} for the registry history.`);
  const actions = (await response.json()).data?.contract?.actions ?? [];
  const kinds = { ContractDeploy: 'deploy', ContractCall: 'call', ContractUpdate: 'update' };
  return actions.map((a) => ({
    hash: a.transaction.hash, block: a.transaction.block.height, address: contract,
    kind: kinds[a.__typename] ?? 'none', circuit: a.entryPoint ?? null,
  }));
};
