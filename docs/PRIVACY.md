# Privacy and trust boundaries

Amana proves a limited positive repayment statement. It does not prove creditworthiness, affordability, absence of debt, a complete credit history, or the truth of an issuer's source data.

## Cryptographic boundaries

The borrower holds one secret. Different domain-separated hashes derive lender-specific pseudonyms, check-specific response keys, and check-specific nullifiers. A separate verifier key domain avoids directly equating a verifier key with its lender key, although repeated requests by the same verifier are publicly linkable to each other.

The public ledger contains issuer keys and leaf positions, attestation commitments and the current tree, requested thresholds/windows, verifier keys, response keys, results and nullifiers. It does not contain the underlying summary's subject, counts, interval or selected lender identities. Amounts and contractual loan terms are not collected by this credential schema.

The contract knows the private data inside the proving computation. The public ledger receives commitments and disclosed query values; it is inaccurate to say the circuit cannot read the data it proves.

## Committed requests and holder binding

A request ID is derived from the verifier's key and a nonce. `createCheck` recomputes that ID from the caller's private key, rejects duplicates, and stores a positive threshold and inclusive reporting window. Borrowers pass only the ID to the proof circuit.

Before registration the intended borrower derives a response key from their secret and the ID. The verifier commits that response. Observers cannot squat another verifier's ID or consume its check with a different wallet. Copying a valid answer transaction cannot change its terms or recipient; at most the same correct result is accepted once.

The verifier must authenticate the response-key exchange and associate the check with its application. An attacker controlling that exchange can substitute a different wallet. Key sharing or compromise can transfer the ability to answer. No civil identity is proven.

## Aggregation and recency

Every used summary must open to a live leaf, belong to the proving secret under its issuer-specific pseudonym, and have its full interval inside the committed window. On-time counts cannot exceed scheduled counts. Issuers must agree on the semantic definition: currently on or before the due date, not loyalty points or an unspecified grace period.

One summary per lender prevents overlapping snapshots from one issuer being added together. This does not prevent dishonest institutions from attributing the same real-world event to multiple lender keys. Registry admission, issuer audits, and source-data reconciliation remain required trust controls.

There is no trusted current-date assertion or request expiry. A verifier may deliberately choose a historical or future upper bound. The standard UI uses the current UTC calendar month. Bounds identify eligible reporting intervals; they do not prove how recently a lender updated its operational database.

## Hiding the number of summaries

Every successful proof performs four live-root checks. Unused slots duplicate a real path, and all four roots must equal the current tree root. Used flags, actual contributions and lender distinctness remain private.

A test executes the compiled circuit with one and four records against the same request and ledger and compares the full public transcripts and public inputs for equality. It also checks the private transcripts differ. This is a regression check, not a formal audit or a timing-indistinguishability proof.

## Revocation and capacity

The issuer overwrites its leaf with the tree's default value and removes its live issuer entry. Proofs built against an earlier state may need rebuilding. Once revocation is effective in the accepted ledger, that leaf cannot support a new accepted check.

Earlier accepted check results remain historical statements. Refreshing or revalidating a lending decision requires a fresh check; do not present an old result as current standing.

The chosen current-root tree avoids accepting historic pre-revocation roots. Other revocation designs can also support private non-membership proofs; a public revocation set does not inherently require borrower identification.

Tree depth 10 allows 1,024 lifetime issuance positions. Revocation does not free positions. Publicly visible issuer attribution, timing and a small population can substantially reduce the effective anonymity set.

## Remaining exposure

- **Storage and backups:** identity keys and credentials are plaintext in localStorage. The legacy provider export methods also serialize plaintext despite the SDK field being named `encryptedPayload`; do not treat these as encrypted backups. Corrupt stored state now causes an explicit error rather than being silently discarded. Production storage, encrypted export/import and recovery are pending.
- **Prover:** the wallet supplies the prover URI. A remote or compromised prover can see witnesses. Use a trusted local prover. The application does not enforce localhost.
- **Network and transaction metadata:** indexers see requests and IP addresses; wallet funding and transaction timing can link activity outside the proof. No mixing or batching is implemented.
- **Known identities:** lenders can already know customers through KYC, the application channel and their source systems. Pseudonyms alone cannot unlink those records.
- **Threshold probing:** repeated requests can narrow the underlying total if the borrower cooperates. There is no rate limit or disclosure budget. The UI requires review of each committed request.
- **Authority and issuers:** one compromised authority can admit dishonest issuers; there is no authority rotation or lender removal circuit. Revocation controls credential validity, not factual correctness.
- **Spam and growth:** any holder of a verifier secret can create its own paid requests. There is no allowlist, expiry, cleanup or per-verifier quota.
- **Browser isolation:** writes are serialized in one API instance only. Multiple tabs sharing the same profile can race over private state. Use separate browser profiles for different actors and one active tab per actor.

Do not use this prototype to make real lending decisions without institutional validation, operational security work and review of applicable requirements.
