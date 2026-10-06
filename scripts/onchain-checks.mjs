// Copyright (C) 2026 the Amana authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The checks behind `npm run verify:onchain`, kept free of I/O so they can be
 * tested against hand-built snapshots.
 *
 * Two kinds of check. Invariants hold for any honest Amana registry, whoever
 * has used it since. Evidence checks compare against what the repository
 * records. The registry is public and anyone may use it, so counters are
 * compared as lower bounds: activity after the recording is not a failure.
 */

const short = (hex) => `${hex.slice(0, 8)}…${hex.slice(-4)}`;
const sameTerms = (a, b) =>
  a.minOnTime === b.minOnTime && a.minPeriod === b.minPeriod && a.maxPeriod === b.maxPeriod;

/**
 * @param {object} evidence  parsed `docs/evidence/<network>.json`
 * @param {object} snapshot  the registry's public ledger, hex strings and bigints
 * @param {Map<string, {block: number, address: string, kind: string} | null>} transactions
 *        what the indexer returned for each recorded hash, or null if not found
 * @returns {{ name: string, ok: boolean, detail?: string }[]}
 */
export const evaluate = (evidence, snapshot, transactions) => {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok, ...(ok ? {} : { detail }) });
  const recorded = evidence.ledger;
  const lenders = new Set(snapshot.lenders);
  const issuers = new Map(snapshot.issuers.map(([leaf, lender]) => [String(leaf), lender]));

  // --- invariants --------------------------------------------------------

  check(`protocol version ${recorded.protocolVersion}`,
    snapshot.protocolVersion === BigInt(recorded.protocolVersion),
    `registry reports version ${snapshot.protocolVersion}`);
  check('registry activated by its deployment authority', snapshot.bootstrapped,
    'claimAuthority has not been called');
  check('one tree leaf per issued record', snapshot.nextLeaf === snapshot.issuedCount,
    `next leaf ${snapshot.nextLeaf}, issued ${snapshot.issuedCount}`);
  check('live records = issued − revoked',
    BigInt(issuers.size) === snapshot.issuedCount - snapshot.revokedCount,
    `${issuers.size} live, ${snapshot.issuedCount} issued, ${snapshot.revokedCount} revoked`);
  const strangers = [...issuers.values()].filter((l) => !lenders.has(l));
  check('every live record was issued by an admitted institution', strangers.length === 0,
    `issuers not in the admitted set: ${strangers.map(short).join(', ')}`);
  check('one answer and one nullifier per accepted proof',
    BigInt(snapshot.checks.length) === snapshot.acceptedCount
      && snapshot.nullifierCount === snapshot.acceptedCount,
    `${snapshot.checks.length} answers, ${snapshot.nullifierCount} nullifiers, ${snapshot.acceptedCount} accepted`);
  const requested = new Map(snapshot.requestedChecks);
  const mismatched = snapshot.checks.filter(([id, result]) =>
    !requested.has(id) || !sameTerms(requested.get(id), result));
  check('every answer records exactly the terms its verifier committed', mismatched.length === 0,
    `answers without matching terms: ${mismatched.map(([id]) => short(id)).join(', ')}`);

  // --- recorded evidence ---------------------------------------------------

  check(`authority ${short(recorded.authority)}`, snapshot.authority === recorded.authority,
    `registry authority is ${short(snapshot.authority)}`);
  const missing = recorded.lenders.filter((l) => !lenders.has(l));
  check(`${recorded.lenders.length} recorded institutions admitted`, missing.length === 0,
    `not admitted: ${missing.map(short).join(', ')}`);
  for (const [leaf, lender] of Object.entries(recorded.issuers)) {
    const now = issuers.get(leaf);
    check(`leaf ${leaf} issued by ${short(lender)}`, now === lender || (now === undefined && snapshot.revokedCount > 0n),
      now === undefined ? 'leaf is empty and nothing has been revoked' : `leaf issued by ${short(now)}`);
  }
  for (const counter of ['issuedCount', 'revokedCount', 'acceptedCount']) {
    check(`${counter} at least ${recorded[counter]}`, snapshot[counter] >= BigInt(recorded[counter]),
      `registry reports ${snapshot[counter]}`);
  }
  for (const tx of evidence.transactions) {
    const found = transactions.get(tx.hash);
    check(`${tx.kind} ${short(tx.hash)} in block ${tx.block.toLocaleString('en-US')}`,
      found != null && found.block === tx.block && found.address === evidence.contract && found.kind === tx.kind,
      found == null ? 'transaction not found'
        : `found ${found.kind} in block ${found.block} touching ${short(found.address)}`);
  }
  return results;
};
