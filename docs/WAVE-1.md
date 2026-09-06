# Wave 1 progress

Working status: 6 September 2026. This is a progress record, not a completed submission.

## Event schedule and eligibility

The [live AKINDO program](https://app.akindo.io/wave-hacks/jaMZjqPOBsLXvjdG) advertises Wave 1 as August 27–September 16, with a submission endpoint of **September 16 at 15:00 UTC / 16:00 Tunis**. Use that as the planning deadline, pending written organizer clarification.

The linked Official Rules use an older schedule, and their eligibility language differs from the live program's material-extension language. The detailed rubric also differs from the published high-level weights. Organizer confirmation of the controlling deadline, eligible baseline and applicable rubric remains outstanding. No claim that all existing functionality originated during this Wave is made here.

## Material extension implemented September 6

The earlier flow let a borrower supply proof thresholds. Although a careful verifier could detect changed terms, a known check could be consumed using weaker terms. The new flow stores verifier-created terms before proving and binds the response to the intended wallet.

- Added `CheckTerms`, `requestedChecks`, verifier-key/request-ID derivation and `createCheck`.
- Changed `proveCreditStanding` to accept only the committed check ID.
- Added check-specific borrower response keys to prevent interception by other credential holders.
- Added deployment-bound authority activation.
- Replaced last-repayment dates with complete reporting intervals. Both interval bounds must fit the request.
- Enforced at most one summary per lender to prevent duplicate cumulative snapshots.
- Made issuance return its actual allocated leaf index.
- Updated API, four-role UI and version 2 credential import. Old credentials require reissuance.
- Fixed stale wallet state, live-only selection, malformed inputs and pending-witness cleanup.
- Added attack regressions and API integration tests, including full public-transcript equality for one versus four contributing records.
- Added cross-platform build/compile scripts and a pinned GitHub Actions verification workflow.
- Reworked the demo, privacy explanation and market-validation plan around the implemented behavior.

## Local evidence

Full Compact compilation generates keys for six circuits under compiler 0.31.1. 40 local contract tests, 23 API integration tests, all-workspace type-checking and the full production build pass. Built API/contract package exports load successfully.

These are local results. Runtime tests simulate ledger execution; API tests simulate providers and finalization. They are not evidence of public-network acceptance or cryptographic proof generation during tests. The new GitHub workflow has not run remotely. A Chrome smoke exercise of all four role views using synthetic API data passed with no page errors; this is not a live wallet test or part of hosted CI.

Browser bundles still emit upstream browser-module and size warnings. The browser provider explicitly supplies native WebSocket. Live wallet/indexer/prover interaction remains to be rehearsed.

## Required before submission

1. Obtain organizer clarification, complete individual registration and retain confirmation.
2. Publish the Apache-2.0 repository when authorized; include mandatory `midnightntwrk` and relevant project topics.
3. Verify on a clean Linux clone and run the hosted CI workflow.
4. Deploy the version 2 contract on the organizer-recommended network and capture reproducible transaction evidence.
5. Record the real two-lender demo; create a visual deck from the current outline.
6. Complete initial institutional discovery and distinguish observations from assumptions.
7. Verify every public link and submit the exact in-Wave change summary before the controlling deadline.

## Later priorities

Wave 2 candidates: encrypted storage and recovery, larger-tree benchmarks or sharding, issuance batching, issuer governance, and privately proving a minimum distinct-lender count. Pairwise lender distinctness already exists in version 2; a minimum-count claim is still absent.

Wave 3 candidates: policy-banded disclosure, carefully scoped verifier view keys, integration evaluation, and a written institutional expression of interest. Customer discovery starts now. Later-Wave dates remain subject to the organizer's controlling schedule.
