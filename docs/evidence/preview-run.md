# Evidence run on preview

Registry `663c23414094c13a26ca98f476923a1d8b32bd631b9a83e3a3ad2a91df7d1c1e`, run on 2026-10-06 with `npm run evidence`.

21 steps: 14 transactions with real zero-knowledge proofs, and 7 refusals. A refusal is a call the circuit rejected while it was executing locally, so no proof was produced and nothing reached the chain. Each refusal is recorded with the circuit's own assertion message.

One funded test wallet paid every fee; the participants are separate Amana identities, not separate wallets. In real use each participant pays from its own wallet ([AUD-13](../AUDIT.md#aud-13)).

| # | Who | What | Circuit | Result |
|---|---|---|---|---|
| 1 | Operator | Deploy a protocol 3 registry | `deploy` | [26dcc60f4b…](https://preview.midnightexplorer.com/transactions/26dcc60f4b63a1b038ba8840367ec453e43e78e43c47d9cd4eecac2842347b21) · block 1,182,293 |
| 2 | Operator | Activate the registry with the key committed at deployment | `claimAuthority` | [03395f31f9…](https://preview.midnightexplorer.com/transactions/03395f31f9006177c4338b21b49c92f19779423ee710212ca47c3d492738b331) · block 1,182,297 |
| 3 | Operator | Admit institution A | `registerLender` | [2d1cba5240…](https://preview.midnightexplorer.com/transactions/2d1cba52408764459949ed684a96a1182abb26f854be0b51dc91d5127584095d) · block 1,182,301 |
| 4 | Operator | Admit institution B | `registerLender` | [f3c48f7a97…](https://preview.midnightexplorer.com/transactions/f3c48f7a9765eb4b677a112be85a2a797ce609724ae01d0e3cc4ef84a5b4cde3) · block 1,182,305 |
| 5 | Institution A | Issue 8 on-time of 8 over 24 months to the borrower's A-pseudonym | `issueAttestation` | [f8a073f46e…](https://preview.midnightexplorer.com/transactions/f8a073f46e5978f21f866e63ab744dcdaff37f50f668fb1c7ac061b93dce07df) · block 1,182,309 |
| 6 | Institution B | Issue 6 on-time of 7 over 24 months to the borrower's B-pseudonym | `issueAttestation` | [4a66434153…](https://preview.midnightexplorer.com/transactions/4a664341539bbbc59d6a760e7c95e3dcd1c5f1acbaa1be67af86c08fa90293da) · block 1,182,313 |
| 7 | Verifier | Commit a check: at least 14 on-time repayments in 24 months | `createCheck` | [1801c83bd9…](https://preview.midnightexplorer.com/transactions/1801c83bd900b05797c1a76b11648149fcb04740da15207a270d58254a8b3194) · block 1,182,317 |
| 8 | Outsider | Answer the borrower's check | `proveCreditStanding` | **Refused**, no transaction: `check is for a different borrower` |
| 9 | Borrower | Prove 8 + 6 clears 14, revealing neither institution nor total | `proveCreditStanding` | [9dc0772440…](https://preview.midnightexplorer.com/transactions/9dc0772440f5c2227bc98d6a6c48193efe6a0de2a55a767e1149cb373939cf71) · block 1,182,334 |
| 10 | Borrower | Answer the same check a second time | `proveCreditStanding` | **Refused**, no transaction: `check has already been answered` |
| 11 | Verifier | Commit a stricter check: at least 15 | `createCheck` | [a5bd4460bf…](https://preview.midnightexplorer.com/transactions/a5bd4460bf6e91a7b4c9e120c10f3820ad7dc60c8d109202b59b30d5409622eb) · block 1,182,339 |
| 12 | Borrower | Inflate institution A's record from 8 to 9 to reach 15 | `proveCreditStanding` | **Refused**, no transaction: `attestation is not live in the registry` |
| 13 | Operator | Withdraw institution B | `removeLender` | [9adaca1444…](https://preview.midnightexplorer.com/transactions/9adaca1444e15d912922c9b277e55a786404092aba1770a05af9a3ba14bd0e5e) · block 1,182,343 |
| 14 | Institution B | Issue another record after withdrawal | `issueAttestation` | **Refused**, no transaction: `not a registered lender` |
| 15 | Operator | Void a record of institution A, which is still admitted | `revokeOrphanedAttestation` | **Refused**, no transaction: `the issuer is still admitted and alone may revoke` |
| 16 | Operator | Void institution B's record | `revokeOrphanedAttestation` | [dc5e1ad0d7…](https://preview.midnightexplorer.com/transactions/dc5e1ad0d7ddb9572d9ce3e33f5c9d8f057a0c312484691b90951a9952c9d463) · block 1,182,347 |
| 17 | Verifier | Commit a fresh check at 14 | `createCheck` | [bd4d932007…](https://preview.midnightexplorer.com/transactions/bd4d932007c875c8d89839548dabf0ba4aeda8617f1a759082dc71aea27e5adf) · block 1,182,351 |
| 18 | Borrower | Present the voided record from institution B | `proveCreditStanding` | **Refused**, no transaction: `attestation is not live in the registry` |
| 19 | Operator | Offer the registry to a successor key | `proposeAuthority` | [b3770a64d5…](https://preview.midnightexplorer.com/transactions/b3770a64d5c2657bc4f87d3e6d980ddf5d38544f1a488e5219243dcf204eb48f) · block 1,182,355 |
| 20 | Successor | Accept the registry | `acceptAuthority` | [7c6b3cac02…](https://preview.midnightexplorer.com/transactions/7c6b3cac028f32fc5a6784b249d2b53316e141f4e328abf78efc07a23ad42b44) · block 1,182,359 |
| 21 | Former operator | Admit an institution after handing over | `registerLender` | **Refused**, no transaction: `only the authority may register lenders` |

Re-check the chain side with `npm run verify:onchain`. The transaction hashes above come from the public indexer, not from the run's own log.
