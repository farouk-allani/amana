# Go to market

Amana starts in Tunisian microfinance because that is a market with a real, documented gap, a small number of institutions that must be convinced, and — critically — a structural reason the obvious solution has never been built.

## The market

| | Active clients | Active loans | Source |
|---|---|---|---|
| Enda Tamweel | 502,523 | 544,030 | [2024 management report, p. 1](https://www.cmf.tn/sites/default/files/pdfs/emetteurs/informations/rapports-societes/rapport_enda_tamweel_2024.pdf) |
| Taysir Microfinance | 38,654 | 38,663 | [2024 annual report, p. 9](https://www.cmf.tn/sites/default/files/pdfs/emetteurs/informations/rapports-societes/rapport_taysir_microfinance_2024.pdf) |

Figures are end-2024 and describe those institutions, not Amana's users. Two institutions is not a limitation of the plan — it is the plan. Portability needs exactly one counterparty to become real, and a market with a handful of large players is far easier to reach consensus in than one with hundreds.

## How a borrower is assessed today

A Tunisian MFI underwrites a small loan through a branch loan officer. The officer takes the application against the applicant's CIN, runs a query against the **ACM Centrale des Risques de la Microfinance** for existing microfinance exposure, checks bank-sector exposure where relevant, assesses the applicant's activity and guarantor arrangement, and takes the file to a branch-level or committee-level decision.

The central query answers one question well: *how much does this person already owe, and to whom?* Negative and structural information — outstanding contracts, closures, write-offs — is what the system is built to circulate.

What it does not put in the officer's hands is a clean, current, portable answer to a different question: *has this person been paying on time, recently, somewhere else?*

## The gap, precisely

This is not a vague complaint about data sharing. It is a specific and documented reporting asymmetry.

[ACM Note 34 of 26 March 2021](https://www.acm.gov.tn/Fr/telecharger.php?code=245) sets the reporting cadence to the Centrale des Risques. Person, contract, closure and write-off flows must be transmitted **in real time or by day-end**. Balances and repayment schedules report **monthly, due within ten days after the reporting cutoff**. Score-change reports are likewise monthly. [Note 43 of 31 July 2026](https://www.acm.gov.tn/Fr/telecharger.php?code=295) adds mandatory contract-flow variables from 1 September 2026 and continues the ACM–BCT data exchange, confirming the direction of travel without changing that cadence.

The consequence: the fact that someone *has* a loan travels within a day. The fact that they have been **repaying it on time** travels on a monthly cycle with a ten-day grace, which means recent repayment behaviour can be up to forty days stale at the moment a second institution is deciding.

For a working-capital loan being decided this week, that is the difference between a borrower who is evidently reliable and a borrower who looks like a stranger.

## Why nobody has fixed it

The technical fix is trivial. A shared table of borrowers and their on-time repayment counts would take an afternoon to specify. It does not exist, and it will not exist, and the reason has nothing to do with engineering.

**An MFI's reliably-repaying clients are its most valuable asset.** They are cheap to serve, they renew, and they are the core of the portfolio. Publishing a list of them — to a regulator's shared system, to a bureau, to a competitor — is publishing an acquisition target list. Every institution understands this, so every institution's answer is the same, and the data stays put.

Every non-cryptographic proposal in this space asks an institution to trade competitive information for reciprocity and hope. That trade has been on the table for years and has not been taken.

## What Amana changes

Amana removes the trade entirely.

The issuing institution publishes a **commitment** — an opaque 32-byte hash — and nothing else. No borrower, no amount, no count, no interval. The borrower carries the credential. When a second institution asks a question, the borrower answers *that specific question* with a zero-knowledge proof, and the second institution learns exactly one bit more than it knew before: the bar was cleared.

What the issuer gives up: nothing.
What the verifier gains: a current, cryptographically authenticated, issuer-backed fact.
What the borrower gains: their own repayment record becomes portable property rather than a competitor's asset.

Three properties make the offer acceptable to an institution that is otherwise structurally unwilling:

- **Per-lender pseudonyms.** Two institutions comparing their entire ledgers cannot determine that they share a customer. Participating does not expose the client base even to statistical attack.
- **Nothing about the margin leaks.** A borrower with 40 on-time repayments clears a bar of 14 with a public transcript byte-identical to a borrower who has exactly 14. The verifier cannot mine proofs for competitive intelligence.
- **Issuer-controlled revocation.** An institution that issued in error voids the leaf, and every proof depending on it stops verifying immediately. Participation is reversible, which is what makes a first pilot signable.

## Sequencing

**Beachhead — two Tunisian MFIs, positive-evidence supplement.** The pitch is deliberately narrow: not "replace your underwriting", but "add one current, verified positive signal to a file you are already assembling". Narrow scope means a shorter approval path and no dependency on regulatory change.

**Expansion 1 — MFI to bank graduation.** The strongest microfinance clients eventually seek bank credit and arrive with the same problem in a more expensive form. The proof is unchanged; only the verifier's threshold moves.

**Expansion 2 — Francophone Africa and MENA.** Morocco, Senegal, Côte d'Ivoire and Egypt share the market structure: concentrated MFI sectors, a central risk registry oriented toward exposure rather than behaviour, and the same competitive refusal to pool good-borrower data.

**Expansion 3 — any market where competitors must trust each other's records.** Buy-now-pay-later providers, telco device financing, utility and rental payment history. The primitive — *prove a threshold earned at a competitor without the competitor disclosing anything* — is not specific to microfinance.

## Business model

The verifier pays, because the verifier receives the value. Issuing is free, and reciprocity is what makes issuing worth doing: institution A issues for B's applicants because B issues for A's.

Two components:

- **Per-verification fee**, benchmarked below the fully-loaded cost of the manual alternative — loan officer and back-office time spent assembling and chasing evidence for a single file. The comparison is against staff hours, not against a software line item, and that is a comfortable margin to price into.
- **Institution subscription** covering issuer integration, key management, the registry operator relationship and support.

Borrowers never pay. A credential the borrower must buy is a credential the borrower does not get, and the two-sided network fails at the side that has the least money.

## Adoption path

The registry authority role is deliberately separable from the institutions. A neutral operator — a sector association, an existing shared-services provider, or the regulator itself — admits issuers without ever seeing a borrower record. That structure means no institution has to trust a competitor to run the infrastructure, and it gives the ACM a natural seat if it wants one.

**Amana is a supplement to the Centrale des Risques, never a replacement.** The central registry answers exposure. Amana answers recent positive behaviour. An institution runs both, and the regulatory story is additive rather than competitive — which matters enormously for whether a compliance officer ever signs.

## What has to be proven next

Written plainly, because a plan that hides its unknowns is a pitch, not a plan.

1. **Does the forty-day window actually change decisions?** The reporting cadence is documented. Whether a loan officer would *act* differently on fresher positive evidence is an empirical question, and it is the one that decides whether this business exists. It needs credit-risk staff, one anonymized case, and a specific answer.
2. **Can an issuer produce the summary?** Issuance requires an institution to export on-time repayment counts per borrower per interval from its core system. Feasibility, latency and correction behaviour under rescheduling, partial payment and reversal all need an integration owner's answer.
3. **What does "on time" mean institutionally?** Amana currently counts repayments made on or before the due date. Grace periods, partial payments and reschedules need a written policy agreed with risk staff before any number means anything.
4. **Who moves first?** Two-sided cold start. The likely unlock is a single institution acting as both issuer and verifier across its own branches or products, proving the mechanism internally before a counterparty is required.

The near-term validation plan is synthetic and costs an institution nothing: replay twenty constructed cases — recent payments, late and partial payments, reversals, stale summaries, revocations — against the existing workflow and against an Amana adapter, and measure source-event-to-usable-evidence time on both. No customer data, no production access, no commitment.

## Standing and disclosure

The team's domain access comes from direct working experience inside Enda Tamweel's environment on a separate project, which is how the underwriting workflow and its evidence gaps described above are known first-hand rather than inferred from public documents.

No pilot, endorsement, procurement decision, data-access agreement or commercial relationship exists with Enda Tamweel, Taysir Microfinance, or any other institution. The 2024 figures above are dated public reference points establishing market structure, not Amana's addressable revenue and not a claim of participation. Institutional discovery is the next step, not a completed one.
