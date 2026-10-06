# Self-audit

October 2026, protocol version 3. Covers [`amana.compact`](../contract/src/amana.compact), the witnesses, the API service layer, the browser private-state provider and the deployed preview registry.

**This is the author's own review, not an independent audit.** It is published so a reader can see what was looked for, what was found, and what was done about each finding. A finding is not hidden because it is unfixed. [PRIVACY.md](PRIVACY.md) describes the trust boundaries this review was measured against.

## Method

- Every circuit and witness was read against the trust boundaries in PRIVACY.md, asking what each participant could do with the inputs it controls: the registry authority, an admitted issuer, a borrower, a verifier, an outsider holding someone else's credential, and an observer of the public ledger.
- Every fix lands with a regression test that runs the compiled circuit. Where a test needs to show it would catch the original defect, the fix was reverted and the test confirmed failing.
- The deployed registry's public state is checked against the recorded evidence by `npm run verify:onchain`, daily in CI.
- Compiler disclosure analysis is treated as part of the review. Compact refuses to compile any circuit whose ledger operations depend on private data without an explicit `disclose()`, and every `disclose()` in the contract was reviewed.

## Summary

13 findings. 4 fixed, 1 corrected in documentation with the design change deferred, 1 open and scheduled, 7 accepted with reasons.

| ID | Severity | Finding | Status |
|---|---|---|---|
| [AUD-01](#aud-01) | High | Trust in an issuer could never be withdrawn | **Fixed** |
| [AUD-02](#aud-02) | High | Identity key and credentials stored unencrypted, with no recovery | Open, scheduled |
| [AUD-03](#aud-03) | Medium | Registry authority key could not be rotated | **Fixed** |
| [AUD-04](#aud-04) | Medium | Any issuance invalidated every proof in flight | **Fixed** |
| [AUD-05](#aud-05) | Medium | README implied a credit check had been answered on preview | **Fixed** |
| [AUD-06](#aud-06) | Medium | Issuance reveals the issuing institution, contrary to the README | Documentation fixed; design deferred |
| [AUD-07](#aud-07) | Medium | Repeated checks at different thresholds can narrow a borrower's total | Accepted |
| [AUD-08](#aud-08) | Medium | Fixed capacity of 1,024 issuances, which an admitted issuer can exhaust | Accepted |
| [AUD-09](#aud-09) | Low | Repayment facts are the issuer's word, so issuer and borrower can collude | Accepted |
| [AUD-10](#aud-10) | Low | Anyone can create checks without limit or expiry | Accepted |
| [AUD-11](#aud-11) | Low | Two tabs on one browser profile can race over private state | Accepted |
| [AUD-12](#aud-12) | Info | The prover sees every witness | Accepted |
| [AUD-13](#aud-13) | Info | Network metadata can link a borrower's transactions | Accepted |

**Severity.** High: an attacker or a single failure defeats a core guarantee or the user's custody of their record. Medium: liveness, governance or a meaningful privacy reduction. Low: limited impact, or impact that needs a trusted party to misbehave. Info: a boundary of the design, stated so nobody assumes otherwise.

## Findings

### AUD-01

**Trust in an issuer could never be withdrawn.** High. Fixed.

Protocol 2 had no way to remove an admitted institution, and only the issuer could revoke what it had issued. An institution that was compromised, or that sold fabricated records to borrowers willing to pay for a credit history, could keep issuing indefinitely. Every record it had already issued stayed provable forever.

**Fix.**
- `removeLender` lets the authority withdraw an institution's right to issue and to revoke.
- `revokeOrphanedAttestation` lets the authority void any record whose issuer has been withdrawn. Records of institutions still admitted remain theirs alone to revoke.
- Commits: contract [`37b247d`](https://github.com/farouk-allani/amana/commit/37b247d), API [`6bf150a`](https://github.com/farouk-allani/amana/commit/6bf150a), operator console [`beca28b`](https://github.com/farouk-allani/amana/commit/beca28b).
- Tests: `withdrawing an issuer` (5 circuit tests) and `withdraws an institution and voids its records through the authority`.

**Residual.** Voiding is one public transaction per leaf. A proof cannot check that its issuers are still admitted without disclosing which institutions they are, so a withdrawn issuer's records stay provable until the authority voids them. The registry reports them as `orphanedLeaves`, and `verify:onchain` counts them. The design that removes this window is the same one that resolves [AUD-06](#aud-06): proving issuer membership privately inside the proof.

### AUD-02

**Identity key and credentials stored unencrypted, with no recovery.** High. Open, scheduled for Wave 2.

The browser private-state provider keeps the borrower's secret key and every credential as plain JSON in `localStorage`. Its export methods return the same plaintext in a field the SDK names `encryptedPayload`. Anyone who reads the browser profile, a synced backup, or the page's storage can:
- prove standing as the borrower;
- compute the borrower's pseudonym at every admitted institution, linking the records the protocol exists to keep apart.

There is also no recovery: clearing storage loses the key, and with it every credential.

**Plan.**
- Encrypt at rest under a passphrase-derived key (WebCrypto, PBKDF2 and AES-GCM).
- Encrypt the export file, and refuse plaintext export.
- Add a recovery path, so a lost device doesn't turn the borrower back into a stranger.

This needs an unlock step in the interface, so it lands with the Wave 2 interface work. It was already disclosed in PRIVACY.md.

### AUD-03

**Registry authority key could not be rotated.** Medium. Fixed.

The authority key was fixed at deployment. Losing it froze the admission of institutions forever. If it was compromised, the attacker could admit issuers until a new registry was deployed and every credential reissued.

**Fix.**
- A two-step handover. `proposeAuthority` records an offer; `acceptAuthority` completes it only for a caller who proves control of the offered key.
- The current authority keeps full control until acceptance, so a mistyped key cannot strand the registry. A later offer replaces an earlier one, and the zero key is refused.
- Commit [`b0d7d7b`](https://github.com/farouk-allani/amana/commit/b0d7d7b). Tests: `handing over the registry` (4 circuit tests) and `hands the registry over only when the offered key accepts`.

**Residual.** The authority is still a single key. Threshold or multi-party control (an association of institutions, or a regulator with a co-signer) is future work.

### AUD-04

**Any issuance invalidated every proof in flight.** Medium. Fixed.

The attestation tree was a plain `MerkleTree`, whose `checkRoot` accepts only the current root. Any issuance by any institution changed the root, so every borrower's proof that was being built or awaiting inclusion failed on submission. With several institutions issuing, a borrower could be raced indefinitely. An admitted issuer could block all proofs on purpose by issuing continuously.

**Fix.**
- The tree is now a `HistoricMerkleTree`, so a proof built against any root since the last revocation is accepted.
- Both revocation circuits call `resetHistory()`, because a historic root that still contains a voided leaf would let the voided record keep proving.
- Commit [`3688f6c`](https://github.com/farouk-allani/amana/commit/3688f6c).
- Tests build a proof against an earlier view of the ledger. It is accepted after an unrelated issuance, and refused after any revocation, including the record's own. Reverting to the plain tree makes the first test fail.

**Residual.**
- A revocation still invalidates every proof in flight, for every borrower; those proofs must be rebuilt. Revocation is rare and issuance is not, which is the trade being made.
- An issuer could still grief by repeatedly issuing and revoking its own records. Each cycle is two paid transactions, publicly visible in `revokedCount`, and the authority can now withdraw that issuer ([AUD-01](#aud-01)).
- The root history grows with each issuance and is cleared by each revocation, so it is bounded by the tree's capacity.

### AUD-05

**README implied a credit check had been answered on preview.** Medium. Fixed.

The README said the preview registry had "proofs verified against a local proof server". It read as though a borrower had answered a credit check on chain. The registry's public state shows two admitted institutions, three issued credentials and **zero** answered checks. The issuance transactions do carry proofs, but the product's core action had not happened on chain.

**Fix.** The README now states exactly what is on chain and points to `npm run verify:onchain`, which checks it against the public indexer and runs daily in CI. Commits [`5d9d333`](https://github.com/farouk-allani/amana/commit/5d9d333), [`4fa1e96`](https://github.com/farouk-allani/amana/commit/4fa1e96) and [`5059db2`](https://github.com/farouk-allani/amana/commit/5059db2). The protocol 3 registry is to be deployed with a full recorded run, including an answered check.

### AUD-06

**Issuance reveals the issuing institution, contrary to the README.** Medium. Documentation fixed; design deferred.

`issueAttestation` discloses the issuer's registry key (it must show the key is admitted), and the public `issuers` map records which institution filled each leaf. The chain therefore shows how many credentials each institution issues, and when. No borrower data is exposed. But issuance volume is commercially sensitive in exactly the market Amana addresses.

The README and GO-TO-MARKET said the issuer "publishes an opaque 32-byte commitment and nothing else" and "discloses nothing, not even that it was involved". That holds for the proof, which never reveals its issuers. It does not hold for issuance. PRIVACY.md already listed issuer attribution as an exposure.

**Fix.** The README and GO-TO-MARKET now separate what issuance reveals from what a proof reveals.

**Deferred design.** Hold admitted issuers as a Merkle tree and prove membership privately, both at issuance and inside the credit proof. That hides issuance volume, and it also makes withdrawal take effect instantly, which closes the [AUD-01](#aud-01) residual. It roughly doubles the Merkle work per proof, so it waits for the proving-time measurements.

### AUD-07

**Repeated checks at different thresholds can narrow a borrower's total.** Medium. Accepted.

A verifier who sends one borrower checks at thresholds 10, 12, 14 and so on learns the borrower's total to within one step, if the borrower answers each. The contract cannot rate-limit this, because borrowers are deliberately unlinkable across checks.

**Mitigation.** The borrower has to review and consent to each check's committed terms before proving. A wallet-side disclosure budget (refusing near-duplicate checks from one verifier) is the planned control. It belongs in the wallet, which is the one place that knows its own history.

### AUD-08

**Fixed capacity of 1,024 issuances, which an admitted issuer can exhaust.** Medium. Accepted for preview.

Tree depth 10 gives 1,024 lifetime leaves, and revocation doesn't free them. An admitted issuer could fill the tree and halt all further issuance. The authority can now withdraw such an issuer ([AUD-01](#aud-01)), but the consumed leaves stay consumed. Depth 10 is a preview parameter. Production needs a deeper tree or sharded registries, sized against proving-time measurements.

### AUD-09

**Repayment facts are the issuer's word, so issuer and borrower can collude.** Low. Accepted by design.

The circuits enforce what they can check privately: on-time ≤ total, an ordered reporting interval, binding to the issuing key and the borrower's pseudonym, and one summary per institution. They cannot check that the repayments happened. An admitted institution and a borrower acting together can manufacture a history. That is why admission is the trust root, and why withdrawal now exists ([AUD-01](#aud-01)).

### AUD-10

**Anyone can create checks without limit or expiry.** Low. Accepted.

Any key can create checks under its own verifier identity, and each one adds ledger state permanently. Every check is a paid transaction, which limits volume. Expiry and per-verifier quotas are future work.

### AUD-11

**Two tabs on one browser profile can race over private state.** Low. Accepted.

Writes are serialised within one API instance, not across tabs. Two tabs acting for the same identity can overwrite each other's pending witness state. The evaluation guide asks for one browser profile per actor and one active tab per actor.

### AUD-12

**The prover sees every witness.** Info. Accepted.

Zero-knowledge hides witnesses from the chain and the verifier, not from whatever generates the proof. The wallet supplies the proof server's address. A remote or compromised prover sees the borrower's key and records. The application doesn't enforce a local prover. The deployment guide configures one on `localhost:6300`.

### AUD-13

**Network metadata can link a borrower's transactions.** Info. Accepted.

Indexers and nodes see request origins, and fee payment and timing can link transactions outside anything the proof discloses. Amana makes the proof's contents unlinkable; it doesn't provide network anonymity. No batching or mixing is implemented.

## What was re-checked and holds

Each property below is defended by a test that runs the compiled circuit. The tests are in [`amana.test.ts`](../contract/src/test/amana.test.ts).

- **Only the intended borrower can answer a check, and terms cannot be weakened.** Squatting a verifier's ID, rewriting committed terms, and a credentialed outsider intercepting someone else's check are all refused.
- **Counts cannot be laundered.** Inflated counts, a recent final payment stretching lifetime counts into a window, the same record counted twice, and two snapshots from one institution are all refused.
- **A revoked record stops proving immediately,** including in a proof built before the revocation.
- **Proof shape does not reveal how many records were used.** One record and four records produce byte-identical public transcripts.
- **The authority is committed at deployment,** so knowing the contract address does not let anyone claim it first.
