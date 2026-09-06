# Tunisian market evidence and discovery plan

Research checked 6 September 2026. Institution metrics describe those institutions, not Amana users or customers.

## Evidence we can use

| Claim | Evidence and date | Pitch use |
|---|---|---|
| Enda scale | 502,523 active clients and 544,030 active loans at end-2024. [Enda 2024 management report, p. 1](https://www.cmf.tn/sites/default/files/pdfs/emetteurs/informations/rapports-societes/rapport_enda_tamweel_2024.pdf) | “A large Tunisian MFI served over 500,000 active clients in 2024.” Label the year. |
| Taysir scale | 38,654 active clients and 38,663 active loans at end-2024. [Taysir 2024 annual report, p. 9](https://www.cmf.tn/sites/default/files/pdfs/emetteurs/informations/rapports-societes/rapport_taysir_microfinance_2024.pdf) | A second institution demonstrates that portability is relevant to a multi-institution market. It is not a confirmed participant. |
| Reporting frequency differs by data type | ACM Note 34 of 26 March 2021 requires person, contract, closure and write-off flows in real time or by day-end. Balances and repayment schedules remain monthly, due within ten days after the reporting cutoff. A report on changes in clients' scores is also monthly. [Note 34, pp. 1–2](https://www.acm.gov.tn/Fr/telecharger.php?code=245) | Test a specific gap in recent repayment evidence. Do not say the whole central bank system updates monthly. |
| The rules continue to evolve | Note 43 of 31 July 2026 makes added contract-flow variables mandatory from 1 September 2026. It references ACM–BCT data exchange and earlier notes. [Note 43](https://www.acm.gov.tn/Fr/telecharger.php?code=295) | Ask the institution which current flows, reports and fields its staff use. This note does not establish current operational latency. |

The ACM's [older Note 31](https://www.acm.gov.tn/Fr/upload/1590050965.pdf) describes monthly reporting more broadly; the later amendment is essential context. The system identified in these sources is the **ACM Centrale des Risques de la Microfinance**, with BCT data exchange. Distinguish it from any separate BCT lookup used by an institution.

Do not claim two million Enda clients, add the institutions' client counts as unique people, or treat loan counts, historic reach, forecasts and active customers as interchangeable. These 2024 figures are dated reference points, not asserted current 2026 totals or Amana's addressable paying market.

## The relationship

The builder reports working on a separate loyalty application involving Enda and being in contact with its team. That is a credible route to discovery and relevant implementation experience. An Amana pilot, endorsement, procurement decision or data-access agreement has not been confirmed.

Working pitch wording: **“Our experience on a separate loyalty-app project involving Enda gives us access to understand microfinance workflows. We are seeking validation for Amana's private repayment-evidence use case.”**

Confirm the builder's direct/team role and the loyalty application's stage before finalizing that sentence. The supplied private funding application remains outside this repository. Its project plans do not establish that deployment targets were achieved.

## Product hypothesis

A borrower recently demonstrates positive repayment behavior. The receiving institution has a reason to assess that evidence before a relevant monthly update. An admitted issuer supplies an accurate, current interval summary; the borrower proves the receiving institution's chosen threshold.

Amana can publish issuer updates as transactions are accepted. It cannot make a slow source system update faster, verify real repayment events without a trusted source, or establish reporting freshness merely from a month interval. The potential advantage depends on actual issuer integration and measured processing time.

The loyalty project's event pipeline may provide an integration starting point. **Loyalty points must not be converted directly into on-time repayment counts.** Reward rules may allow grace periods, referrals or other events. Version 2 uses repayment counts on/before due date. Risk staff must agree on treatment of partial payments, reversals, rescheduling and grace periods.

## First seven days of validation

| Step | Concrete work | Evidence to retain |
|---|---|---|
| 1. Credit/risk discovery | Request a 20-minute conversation through the existing Enda contact. Ask for one recent, anonymized case where positive repayment evidence was unavailable or slow. | Role, date, workflow and observation; no names or customer records in the public log. |
| 2. Map the existing check | Identify CRM/BCT/report name, field, source timestamp, reporting cadence, availability time and actual decision affected. Check whether a daily flow already solves the supposed gap. | A field-by-field workflow and a falsifiable delay hypothesis. |
| 3. Technical discovery | Ask the loyalty/integration team what repayment events are accessible, their timestamps and correction behavior, and whether a synthetic export is feasible. | Sample synthetic schema and integration owner, not credentials or production access. |
| 4. Policy review | Agree on the meaning of on-time, accepted intervals, issuer trust and the limited underwriting use of positive evidence. | A draft policy sheet reviewed by credit/risk staff. |
| 5. Synthetic replay | Replay 20 constructed cases: recent payments, late/partial payments, reversals, stale summaries and revocation. Compare existing workflow availability with a hypothetical Amana adapter. | Inputs, expected outcomes and measured local timings; clearly label synthetic results. |
| 6. Second-institution check | If the first institution finds value, seek a second perspective, potentially Taysir. No relationship with Taysir is assumed. | Independent feedback on portability, integration and willingness to pay. |
| 7. Go/no-go | Continue if there is a specific decision improved by limited positive evidence and a feasible issuer update path. Reposition if existing daily data already suffices or staff require full history. | Written findings, objections and next action. |

No outreach has been sent by this project review. A useful French opener for the builder to adapt:

> Dans le cadre de mon travail sur le projet de fidélisation, je développe séparément un prototype de preuve privée d'historique de remboursement. Pourrais-je échanger 20 minutes avec une personne côté crédit/risque et une personne côté intégration ? Je souhaite comprendre quels justificatifs positifs manquent réellement entre les mises à jour, sans demander de données clients.

## Success measures and business model

Measure **source-event-to-usable-evidence time**, successful proof/finalization time, revoked/stale-case rejection, staff usefulness ratings, integration days and willingness to pay. Record baseline versus prototype values; none has been measured at an institution yet. Do not claim default reduction, improved approval rates or faster loans from a technical benchmark alone.

The initial paying customer hypothesis is a receiving MFI's credit/digital team, via an institution subscription and integration support. Borrowers should not need to buy credentials. Issuers bear integration and update costs, so ask what reciprocity, borrower service or commercial incentive makes participation worthwhile. The second institution creates portability value; initial single-institution testing validates issuance, consent and evidence handling only.

Start with synthetic data and no real credit decisions. Any pilot involving actual customers needs an agreed institutional owner, consent/data handling and approval through that institution's normal process.
