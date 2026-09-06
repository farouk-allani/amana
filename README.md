# Amana

**Portable private repayment history on Midnight.**

A borrower proves a repayment threshold earned across lenders without disclosing the contributing institutions, actual repayment total, or number of summaries used. The protocol creates no reusable public borrower identifier. Institutions may still know the applicant through their existing relationship.

The initial customer segment is Tunisian microfinance institutions evaluating borrowers with positive repayment history at another institution. The product hypothesis is that a borrower-controlled proof can supplement existing underwriting with limited disclosure. Customer benefit and willingness to integrate remain to be validated; see [market evidence and discovery plan](docs/MARKET-VALIDATION.md).

## What works

Version 2 contains six Compact circuits, a TypeScript API, and a four-role browser interface. It supports deployment-bound registry authority, lender admission, issuance, revocation, verifier-created checks, and private aggregation across up to four distinct lenders.

A verifier asks for **14 on-time repayments within an explicit reporting window**. A borrower with summaries of 8 and 6 can satisfy it. Someone with 40 also reveals only 14. Each summary's complete reporting interval must fit the window; a recent final payment cannot make a lifetime total count as recent.

This is a development prototype. Public-network deployment, an institutional pilot, a final visual deck, and a recorded submission video remain outstanding. No Enda or Taysir adoption of Amana is claimed.

## The check protocol

1. The verifier creates a draft ID from a domain-separated verifier key and a random nonce.
2. The borrower derives a response key from their secret and that ID, then sends it through the authenticated application channel.
3. The verifier calls `createCheck(checkId, nonce, recipient, minOnTime, minPeriod, maxPeriod)`. The contract verifies ownership of the ID and commits immutable terms.
4. The borrower loads those terms, reviews the disclosure, and calls `proveCreditStanding(checkId)`. Thresholds cannot be supplied or weakened by the borrower.
5. The verifier reads the actual committed terms and result. The check can be answered once, by the bound wallet.

A public observer cannot register someone else's draft ID or answer its check with their own valid credentials. Authenticating the response-key exchange remains the verifier's responsibility. This binds a wallet, not a civil identity.

## Public and private data

| Public ledger / transaction information | Private witnesses |
|---|---|
| Registry authority and admitted lenders | Borrower secret |
| Commitment leaves, current root, issuer-to-leaf associations | Per-lender borrower pseudonyms |
| Verifier keys, check IDs, response keys, thresholds and windows | Repayment counts and reporting intervals |
| Check results, check-specific nullifiers and event timing | Contributing lender identities and used-slot flags |

Amounts and contractual loan terms are absent from the credential schema. The configured prover receives private witness data. Browser storage is currently unencrypted.

The circuit performs four unconditional live-root checks. Unused slots repeat a valid path. A regression test compares complete public transcripts for one-record and four-record presentations against the same ledger and check; they are identical. This does not establish privacy against timing or network correlation.

## Contract guarantees

| Circuit | Guarantee |
|---|---|
| `claimAuthority` | Only the authority key committed at deployment can activate, once |
| `registerLender` | Only that authority can admit an issuer |
| `issueAttestation` | Admitted issuer, matching issuer key, valid counts and interval; returns allocated leaf index |
| `revokeAttestation` | Only the original issuer can overwrite a live leaf |
| `createCheck` | Verifier-owned ID, nonzero recipient, positive threshold, valid immutable window |
| `proveCreditStanding` | Existing unanswered check; bound holder; live membership, interval containment, unique lenders, sufficient count |

At most one summary per lender contributes to prevent repeated cumulative snapshots from inflating a proof. Even disjoint same-lender intervals require a consolidated summary. Counts are statements by trusted issuers; ZK cannot establish that real repayments occurred.

## Reproduce

Use Node 22.17 or later, Compact CLI 0.5.1, compiler 0.31.1, and language 0.23. Install the CLI from the [official pinned release](https://github.com/midnightntwrk/compact/releases/tag/compact-v0.5.1), then run `compact update 0.31.1`.

```sh
npm ci
npm run compact
npm run typecheck
npm test
npm run build
```

On Windows the compile script invokes WSL Ubuntu and the CLI at that Linux user's `~/.local/bin/compact`; set `AMANA_WSL_DISTRO` if your distribution has another name. Node handles the remaining builds on Windows. `npm run compact:check --workspace=contract` skips proving-key generation; rerun the full compile before a production build.

Tests run generated Compact circuits against the local runtime. API integration tests simulate providers and finalization; they do not submit transactions or generate cryptographic proofs. Full compilation generates proving/verifying keys. The GitHub Actions workflow performs these checks but has not yet run in GitHub.

For the browser, configure Midnight Lace for the intended network, a trusted proof server, and a funded test wallet. Set `VITE_NETWORK_ID` explicitly to match the wallet; the current fallback is legacy `TestNet`. Run `npm run ui`. Follow [the separate-profile demo](docs/DEMO.md). The repository does not yet document a verified public contract address.

## Limits

The registry holds 1,024 issued leaves, including revoked positions; positions are not reused. Four lenders per proof and 16-bit thresholds are fixed. Checks have no expiry or deletion; the upper reporting bound is chosen by the verifier, not a trusted on-chain clock. Revocation prevents new acceptance using that leaf but does not erase previously accepted results.

There is one authority key, no key recovery, and no encrypted browser storage. Use one active tab per profile; the API serializes operations within one instance, not across tabs. Small anonymity sets, timing, threshold probing, malicious issuers, and device compromise remain relevant. Read [the privacy analysis](docs/PRIVACY.md).

**Version 2 requires a fresh registry and reissued credentials.** Version 1 did not specify full reporting intervals. The client rejects old formats instead of inventing dates or migrating identities silently.

[Wave progress](docs/WAVE-1.md) · [Pitch outline](docs/DECK.md) · [Video script](docs/VIDEO.md)

*أمانة — a trust.* Apache-2.0.
