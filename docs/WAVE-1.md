# Wave 1 — what was built, and what comes next

**Build period:** 13 August – 2 September 2026.
**Status:** first submission. Everything below is new work; Amana did not exist before this Wave.

---

## What shipped

A complete narrow slice, rather than a broad half-built one.

**The contract.** Five circuits in one Compact file: registry bootstrap, lender admission, attestation issuance, revocation, and the threshold proof. Compiles under compiler `0.31.1` / language `0.23.0`. The proving key for `proveCreditStanding` is 19.5 MB; the full build takes about a minute.

**Private state.** A wallet model in `witnesses.ts` covering the borrower's held credentials, the lender's pending issuance, the selection policy, and the slot-padding rule that keeps every proof the same shape.

**Tests.** 31, run offline against the compiled circuits with a real ledger and genuinely separate per-actor private state. No mocks and no network.

**Interface.** Four roles — registry, lender, borrower, verifier — over one contract, including a `localStorage`-backed private-state provider so a borrower's credentials survive a page reload.

**Documentation.** A README that argues for three design decisions rather than listing features, a demo script, and a privacy analysis that names where the scheme leaks.

---

## Decisions made this Wave

**Aggregation was pulled forward.** The original plan put multi-lender aggregation in Wave 2. Building it in Wave 1 turned out to cost little beyond a fixed slot count, and it is the thing that makes the product legible in one sentence — so Wave 1 proves across up to four attestations from any number of institutions. What stayed behind is the *distinct lender count*, which is a materially stronger claim and needs its own machinery.

**Revocation moved from a list to the tree.** Overwriting a leaf turned out to be both simpler and strictly more private than a revoked-commitment set, and it forced the choice of a plain `MerkleTree` over `HistoricMerkleTree` — which is the more interesting design decision of the two.

**Per-lender pseudonyms were not in the original sketch.** They emerged from taking the threat model seriously: a single borrower identifier hands colluding institutions exactly the linkage the product exists to prevent.

---

## Wave 2 (13 September – 3 October)

**Distinct lender count.** Prove "at least *N* on-time repayments across at least *M* different institutions" without revealing which. Materially harder than the current total: it needs pairwise-distinctness over the private lender field, and it is the claim a real underwriter actually wants, because concentration risk is the thing a bare total hides.

**Decentralise the registry.** The authority is currently one key. Replace it with a threshold of admitted institutions, so admitting a dishonest lender requires collusion rather than one compromised key.

**Issuance without a live lender.** Today a lender must transact to issue. Batch issuance — one transaction committing many attestations — is what an MFI with 40,000 borrowers would actually need, and it changes the cost model from per-borrower to per-cycle.

**Timing mitigation.** The clearest remaining leak is that answering a check is a visible transaction at a visible moment. Batching or a submission delay would break the correlation.

**Encryption at rest** for the borrower's wallet, with a passphrase.

## Wave 3 (13 October – 2 November)

**Banded disclosure.** Prove a total falls in a range rather than clearing a verifier-chosen number, closing the binary-search leak described in `PRIVACY.md`.

**Verifier view keys.** Let a borrower grant one verifier a richer, still-bounded view — a specific institution's record, say — without opening the rest.

**A letter of interest from a real MFI.** Worth more than any code written in week twelve, and the only item on this roadmap that cannot be finished by working harder.

---

## Honest gaps at the end of Wave 1

- **Not yet deployed to a public network.** Everything runs against the compiled circuits and a local proof server; the contract has not been submitted to `preview` or `preprod`, which needs a funded wallet.
- **Four attestations per proof** is a compile-time constant.
- **A lender can issue an inaccurate record.** The circuit enforces internal consistency, not truth. That is what registry admission is for.
- **No CLI.** The browser interface is the only way to drive a live network today.
