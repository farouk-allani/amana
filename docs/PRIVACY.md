# What Amana hides, and what it does not

A privacy claim is only worth something if it says where it stops. This is the honest version.

---

## The threat we are actually addressing

Not a state adversary. The adversary is mundane and much more common:

- **A competing lender** who would happily learn a rival's customer list, or an applicant's true indebtedness.
- **A colluding pair of institutions** comparing books to find shared borrowers.
- **A chain observer** — anyone at all — correlating on-chain activity over time.
- **A community.** In the markets microfinance serves, being publicly known as someone who borrows carries real social cost, and it falls hardest on women. This is the adversary that keeps people invisible, and it is the one most systems ignore.

---

## What never reaches the chain

| | Where it lives |
|---|---|
| Loan amounts, terms | Borrower's device |
| Repayment counts (on-time, total) | Borrower's device |
| Which institutions lent to a borrower | Borrower's device |
| The borrower's identity key | Borrower's device |
| That two records belong to one person | Not derivable by anyone but the holder |
| How many records a borrower holds | Not derivable — proofs are a fixed shape |

These are not withheld by policy. `issueAttestation` takes the record through the `pendingAttestation` **witness**, so the amounts are never transaction inputs; the ledger receives `persistentHash<Attestation>` and could not recover the preimage if it wanted to.

## What is public, by construction

- Which institutions may issue, and which one filled each leaf.
- One Merkle root over every attestation ever issued.
- Spent nullifiers.
- The thresholds each answered check cleared.
- Counts: issued, revoked, answered.

`issuers` maps a leaf index to the institution that wrote it. This is a deliberate disclosure: only the issuer may revoke, and that rule has to be checkable. It reveals *which institution filled slot 7*, never *whose record slot 7 is* — and an observer already knew that institution submitted a transaction at that moment.

---

## The three properties worth naming

### Unlinkability across lenders

`subjectId = H("amana:subject:", borrowerKey, lenderKey)`.

Two institutions comparing every identifier in their books find no overlap, even for a shared customer. Proved in `unlinkability of borrower pseudonyms`.

The limit: this protects the *identifier*. It does not protect a borrower who gives both institutions the same phone number. Amana secures the ledger, not the intake form.

### Unlinkability across checks

`nullifier = H("amana:nullifier:", borrowerKey, checkId)`.

Two verifiers comparing the nullifiers on their answered checks learn nothing. The same borrower produces unrelated values for unrelated checks.

The limit: **timing**. Amana publishes a transaction when a borrower answers a check. A verifier who knows they issued check *X* at 14:02 and sees exactly one answer at 14:03 has learned that transaction is the answer to *X*. Nullifiers are unlinkable; transaction timing is not. Mitigating that needs batching or delay, and Amana does neither today.

### Uniform proof shape

Every `proveCreditStanding` performs exactly four Merkle membership checks and four ledger reads, whether the borrower presented one record or four. Unused slots repeat a live path, so all four disclosed roots equal the tree's real root.

This is enforced by the compiler, not by discipline — making a ledger read conditional on a witness value is a disclosure the disclosure analysis rejects outright. The README documents the exact error and the fix.

---

## Where it leaks

**Timing correlation.** As above. The strongest remaining handle, and it is a real one.

**The wallet's network vantage.** Building a proof means fetching current public state to rebuild Merkle paths. Whoever serves that state sees an IP address asking. Amana points at the wallet's configured indexer and adds no mixing.

**Revocation is visible as an event.** Revoking publishes a leaf index. Nobody learns whose record it was, but the *issuing lender* obviously knows, and they learn that a leaf they wrote is no longer usable — which they knew, having done it.

**Small anonymity sets.** A registry with three attestations gives a borrower nowhere to hide: if only one is recent enough to clear a 24-month window, an observer can guess which was used. This is inherent to the construction and improves as the tree fills. A pilot deployment should be honest that early users have weaker privacy than later ones.

**Threshold granularity.** A verifier who issues checks at 13, then 14, then 15 and watches which succeed learns the borrower's total by binary search. Amana does not rate-limit this. The Wave 3 answer is banded disclosure — prove membership of a range, not a comparison against an attacker-chosen number.

**The device is the wallet.** Credentials live in `localStorage`. An attacker with the device has them. There is no passphrase and no encryption at rest yet.

---

## What we deliberately did not do

**No revocation list.** A public set of revoked commitments would force a borrower to reveal something about which attestation is theirs in order to prove non-membership. Overwriting the leaf achieves revocation with zero borrower-side disclosure.

**No historic Merkle tree.** `HistoricMerkleTree` accepts past roots, which would let a borrower keep proving with a pre-revocation root. Convenience that silently disables revocation is worse than the staleness it avoids.

**No server-side proving.** The proof provider points at the user's own proof server. A hosted prover would be handed the witness — every amount, every lender — which would undo the entire design at the one point where nobody would think to look.

**No margin on chain.** An answered check records the threshold cleared, not the total. Recording the true figure would be more useful to lenders and would leak the number the whole system exists to protect. Tested in *records the bar that was cleared, never the margin*.
