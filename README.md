# Amana &nbsp;·&nbsp; أمانة

**Portable private repayment history on Midnight.**

A borrower proves they cleared a repayment bar — *"at least 14 on-time repayments in the last 24 months"* — without revealing which institutions lent to them, how much they borrowed, their real repayment total, or how many records they used. No reusable public identifier for the borrower is ever created.

[![Verify](https://github.com/OWNER/amana/actions/workflows/verify.yml/badge.svg)](https://github.com/OWNER/amana/actions/workflows/verify.yml)
&nbsp;·&nbsp; Apache-2.0 &nbsp;·&nbsp; Built on [Midnight](https://midnight.network) with Compact 0.23

---

## The problem is competitive, not technical

Tunisia's two largest microfinance institutions carry over 540,000 active clients between them. A borrower who has repaid one of them faithfully for three years walks into the other and is underwritten as a stranger.

The obvious fix — a shared database of good borrowers — has existed as an idea for decades and has not happened. Not because it is hard to build, but because **an MFI's reliable repayers are its book.** Handing a competitor a list of who pays on time is handing over your acquisition pipeline. No institution will do it, and no amount of database engineering changes that.

The regulator's system covers part of the gap and leaves part of it open. Under [ACM Note 34](https://www.acm.gov.tn/Fr/telecharger.php?code=245), person, contract, closure and write-off flows to the Centrale des Risques de la Microfinance move in real time or by day-end — but **balances and repayment schedules report monthly, due within ten days of the reporting cutoff.** For the evidence that matters most to a lender deciding today — *is this person paying on time, right now* — there is a window of up to forty days in which recent good behaviour is simply not visible to the next institution.

Amana closes that window without asking anyone to share a customer list.

> A borrower carries a proof, not a file. The receiving institution learns exactly one fact — *this person cleared your bar* — and learns it from cryptography rather than from a competitor's goodwill. The issuing institution discloses nothing: not the borrower, not the amount, not even that it was involved.

That is why this is a Midnight application rather than a REST API. Selective disclosure is not a privacy feature bolted onto the product; it is the only structure under which the counterparty ever agrees to participate.

---

## What it does

Two institutions, one borrower, one number.

| | |
|---|---|
| Lender A issues | 8 on-time of 8 scheduled, Jan 2025 – Dec 2025 |
| Lender B issues | 6 on-time of 7 scheduled, Jan 2025 – Dec 2025 |
| Verifier asks | ≥ 14 on-time, inside Oct 2024 – Sep 2026 |
| Ledger records | **cleared: 14 · window: 2024-10 → 2026-09 · nullifier: 0x4f2a…9c31** |

The verifier learns that the bar was cleared. It does not learn that the answer was 14 exactly, that two institutions contributed, or which two. A borrower with 40 on-time repayments answering the same check publishes a byte-identical public transcript — [there is a test for that](#quality-evidence).

Amana proves a **narrow positive statement**. It is not a credit score, an affordability assessment, or a claim that the borrower has no other debt.

## The check protocol

The verifier sets the terms and commits them on chain *before* the borrower proves anything. The borrower can never weaken a threshold, and a stranger can never answer someone else's check.

1. **Verifier drafts an ID** from a domain-separated verifier key and a fresh nonce.
2. **Borrower derives a response key** from their secret and that ID, and returns it over the institution's existing authenticated channel.
3. **Verifier calls `createCheck`**, which recomputes the ID from the caller's own key, rejects duplicates, and commits the threshold, window and intended recipient immutably.
4. **Borrower loads the committed terms**, reviews exactly what will be disclosed, and calls `proveCreditStanding`. The thresholds are read-only — they arrive from the ledger, not from the borrower.
5. **Verifier reads the result.** Answered once, by the bound wallet, and never again.

An observer who holds perfectly valid credentials of their own still cannot consume a check addressed to someone else: the recipient binding fails. Authenticating step 2 is the verifier's responsibility, and the protocol binds a wallet rather than a civil identity.

## Why Midnight

The design lives entirely in the split between Midnight's two ledgers. Nothing here is achievable on a transparent chain.

| Public ledger | Private witnesses |
|---|---|
| Registry authority, admitted lender keys | Borrower's secret key |
| Attestation commitments, current Merkle root, leaf → issuer map | Per-lender borrower pseudonyms |
| Verifier keys, check IDs, response keys, thresholds, windows | Repayment counts and reporting intervals |
| Check results, nullifiers, aggregate counters | Contributing lender identities, used-slot flags |

Three design decisions carry the whole product:

**Per-lender pseudonyms.** A borrower's identifier at an institution is `H("amana:subject:", sk, lenderKey)`. Two institutions comparing their books cannot discover they share a customer — and yet the circuit, which knows `sk`, still gathers those records into one total. Unlinkable in public, aggregable in private, which is the property the entire design exists to deliver.

**Revocation by leaf overwrite.** An issuer voids a credential by overwriting its leaf with the tree default. Every path through that leaf stops verifying. The tree is deliberately a plain `MerkleTree` and **not** a `HistoricMerkleTree` — the historic variant accepts past roots, which would silently defeat revocation. No public revoked-set is consulted, so revocation leaks nothing about the borrower.

**Uniform proof shape.** Every successful proof performs exactly four live-root checks, whether the borrower used one record or four. Unused slots repeat a valid path, so the disclosed root is the tree's real root in all four slots and distinguishes nothing. This is why the [transcript-equality test](#quality-evidence) passes, and it is the reason `checkRoot` is evaluated *before* the short-circuit rather than after — making a ledger read conditional on a witness would leak how many credentials the borrower holds, and Compact's disclosure analysis correctly rejects it.

## Contract guarantees

Six circuits in [`contract/src/amana.compact`](contract/src/amana.compact).

| Circuit | Guarantee |
|---|---|
| `claimAuthority` | Only the key committed at deployment can activate the registry, once. Knowing the address does not let a stranger front-run it. |
| `registerLender` | Only that authority admits an issuer. |
| `issueAttestation` | Admitted issuer, key bound to the record, on-time ≤ scheduled, valid interval. Returns the allocated leaf index. |
| `revokeAttestation` | Only the original issuer can void a leaf it issued. |
| `createCheck` | Verifier-owned ID, non-zero recipient, positive threshold, valid immutable window. |
| `proveCreditStanding` | Existing unanswered check, bound holder, live membership, full-interval containment, distinct lenders, sufficient count. |

At most one summary per lender may contribute, so reissuing a cumulative snapshot under a fresh nonce cannot inflate a total. Counts are assertions by trusted issuers — zero-knowledge proves the credential is authentic and unrevoked, never that the underlying repayment occurred.

---

## Repository layout

```
contract/     Compact source, generated circuits, witnesses, simulator + tests
  src/amana.compact        the protocol
  src/witnesses.ts         private state, credential selection, wallet
  src/test/                40 circuit-level tests against the compiled contract
api/          Framework-agnostic TypeScript service layer over the circuits
  src/index.ts             AmanaAPI — deploy, join, issue, revoke, check, prove
  tests/                   23 integration tests with simulated providers
amana-ui/     Four-role React application (Vite)
  src/views/               Registry · Lender · Borrower · Verifier
docs/         PRIVACY.md · GO-TO-MARKET.md
```

## Build and verify

Node 22.17+, Compact CLI 0.5.1, compiler 0.31.1, language 0.23. Install the CLI from the [pinned release](https://github.com/midnightntwrk/compact/releases/tag/compact-v0.5.1), then `compact update 0.31.1`.

```sh
npm ci
npm run compact      # compiles six circuits, generates proving/verifying keys
npm run typecheck
npm test             # 63 tests
npm run build
```

`npm run ci` runs all five in order — the same sequence [GitHub Actions runs](.github/workflows/verify.yml) on a clean Ubuntu runner with a checksum-pinned compiler.

Midnight does not support Windows natively; on Windows the compile script invokes WSL and the Linux user's `~/.local/bin/compact` (set `AMANA_WSL_DISTRO` if your distribution is not named `Ubuntu`). Node handles the remaining builds natively. `npm run compact:check --workspace=contract` skips key generation for a fast syntax and disclosure-analysis pass.

## Run the application

```sh
npm run ui
```

Requires the Midnight Lace wallet, a funded wallet on your chosen network, and a trusted proof server (reference: 8.1.0). Set `VITE_NETWORK_ID` explicitly to match the wallet.

Proofs are built on the machine that holds the data. The prover URI comes from the wallet — use a local proof server, because a remote prover sees the witnesses.

## How to evaluate this submission

The fastest honest path from a clean clone to seeing the privacy property hold:

**1. Confirm the technical gate (~2 minutes).** `npm ci && npm run compact` compiles six circuits and writes proving keys under `contract/src/managed/`.

**2. Run the adversarial suite (~15 seconds).** `npm test`. The interesting cases are not the happy path — they are `rejects squatting a known verifier ID even with its nonce`, `prevents a credentialed observer intercepting a public check`, `does not let a recent final payment make lifetime counts recent`, and `has an identical public transcript for one or four records`.

**3. Drive the four roles.** `npm run ui`, then use **separate browser profiles** for operator, lender A, lender B, borrower and verifier — role tabs inside one profile share an identity, so switching tabs does not create a second lender. Deploy a registry, activate it, admit both lender keys, issue 8/8 and 6/7 with matching intervals, run the five-step check protocol at threshold 14, and read the result.

**4. Break it.** Revoke lender A's leaf as lender A. The borrower's wallet marks the credential not live, and a fresh check at 14 can no longer be answered. The circuit-level regression that bypasses the UI with a revoked witness is `rejects a revoked witness but retains a historical accepted check`.

A monthly period is `(UTC year − 1970) × 12 + UTC month index`. September 2026 is period 680; a 24-month window ending there is 657–680.

## Quality evidence

**63 passing tests**, all against compiled circuits rather than mocks.

- **40 circuit tests** covering authority front-running, issuer impersonation, inflated counts, reversed intervals, ID squatting, term rewriting, check interception by a credentialed outsider, lifetime-count laundering, double-counting a leaf, overlapping same-lender snapshots, revocation, and wrong-index liveness.
- **23 API integration tests** covering the full lifecycle, wallet liveness on public revocation events, duplicate and malformed credential rejection, private-state cleanup after transaction failure, and operation serialization so concurrent issuance cannot overwrite pending witnesses.
- **A privacy property expressed as a regression test.** `has an identical public transcript for one or four records satisfying the same check` executes the compiled circuit twice against the same ledger and check — once with one contributing record, once with four — and asserts the complete public transcripts and public inputs are equal while the private transcripts differ.

Circuit tests execute generated Compact circuits against the local runtime. API tests simulate providers and finalization; they do not submit transactions or generate cryptographic proofs.

## Known limits

Stated plainly, because a privacy product that hides its own weaknesses is not a privacy product.

- **Trust in issuers is the root.** Zero-knowledge proves a credential is authentic, bound to the holder, and live. It cannot prove that a real repayment happened. Registry admission and issuer audit remain required controls.
- **Capacity.** Tree depth 10 gives 1,024 lifetime issuance positions; revocation does not free them. Four lenders per proof, 16-bit thresholds.
- **Storage.** Identity keys and credentials sit unencrypted in browser localStorage. Encrypted storage, export and recovery are Wave 2 work.
- **Metadata.** Indexers see requests and IP addresses. Cryptographic unlinkability does not survive timing correlation, a small anonymity set, or an institution that already knows its customer through KYC.
- **No trusted clock.** The verifier chooses the upper window bound; the chain does not assert the current date.
- **Governance.** One authority key, no rotation, no lender removal circuit, no check expiry or per-verifier quota.

Full analysis: **[docs/PRIVACY.md](docs/PRIVACY.md)**. Market and adoption path: **[docs/GO-TO-MARKET.md](docs/GO-TO-MARKET.md)**.

## Roadmap

**Wave 2** — encrypted private storage with export and recovery; larger tree or sharding with benchmarks; issuance batching; proving a *minimum count of distinct lenders* privately (pairwise distinctness exists today, a minimum-count claim does not); issuer governance and lender removal.

**Wave 3** — policy-banded disclosure, scoped verifier view keys, and an institutional integration evaluation against synthetic exports.

---

## Ecosystem attribution

Built on [Midnight](https://midnight.network) for the Midnight Buildathon on AKINDO. Uses the Compact language and compiler, `@midnight-ntwrk/compact-runtime`, the midnight-js provider suite, the Lace wallet DApp connector, and the Midnight proof server. Structure follows the patterns in Midnight's [example DApps](https://github.com/midnightntwrk).

Topics: `midnightntwrk` · `midnight` · `compact` · `zero-knowledge` · `privacy` · `fintech` · `microfinance`

## License

Apache-2.0 — see [LICENSE](LICENSE). All Midnight-related code in this repository is Apache-2.0 licensed.

*أمانة — a trust placed in someone's hands.*
