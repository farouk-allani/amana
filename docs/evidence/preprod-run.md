# Evidence run on preprod

Registry `1da3be974772f4c2c0adc93bda3caa37a04a31cdaa4bdd670b0b928709ef0f28`, run on 2026-10-18 with `npm run evidence -- preprod`.

21 steps: 14 transactions with real zero-knowledge proofs, and 7 refusals. A refusal is a call the circuit rejected while it was executing locally, so no proof was produced and nothing reached the chain. Each refusal is recorded with the circuit's own assertion message.

One funded test wallet paid every fee; the participants are separate Amana identities, not separate wallets. In real use each participant pays from its own wallet ([AUD-13](../AUDIT.md#aud-13)).

| # | Who | What | Circuit | Result |
|---|---|---|---|---|
| 1 | Operator | Deploy a protocol 3 registry | `deploy` | [b8c7640bb2…](https://preprod.midnightexplorer.com/transactions/b8c7640bb2ffd488b5c17fe71c8aa473a6390d42ff36cd91f2c8792f56c7ed6f) · block 3,036,868 |
| 2 | Operator | Activate the registry with the key committed at deployment | `claimAuthority` | [5e80c59b4f…](https://preprod.midnightexplorer.com/transactions/5e80c59b4f58e12710ed0f94d74e6b4952ddb6f3b6d55adf24868fd9cf60120c) · block 3,036,873 |
| 3 | Operator | Admit institution A | `registerLender` | [040c3b2a80…](https://preprod.midnightexplorer.com/transactions/040c3b2a80fca1dc06d199479de8323f06926b9235e271cc45505ee065bbde82) · block 3,036,878 |
| 4 | Operator | Admit institution B | `registerLender` | [ad8aeaf75c…](https://preprod.midnightexplorer.com/transactions/ad8aeaf75ca7fa34d8ebda7c107d1f7499d4a7dd376b12b29f41cccead29d73c) · block 3,036,882 |
| 5 | Institution A | Issue 8 on-time of 8 over 24 months to the borrower's A-pseudonym | `issueAttestation` | [9d471b515b…](https://preprod.midnightexplorer.com/transactions/9d471b515bc7fe6f8b772da68572608947fc685caf83d4bd3a8e93561ea469ea) · block 3,036,886 |
| 6 | Institution B | Issue 6 on-time of 7 over 24 months to the borrower's B-pseudonym | `issueAttestation` | [0cef7934f7…](https://preprod.midnightexplorer.com/transactions/0cef7934f7e88e245122f805520f21179efbc4657a4190959367e6556b6c6a0e) · block 3,036,891 |
| 7 | Verifier | Commit a check: at least 14 on-time repayments in 24 months | `createCheck` | [06430f33b9…](https://preprod.midnightexplorer.com/transactions/06430f33b909fa5360a4c7dda0b8e8d25efed120b107733440baae9672bfee92) · block 3,036,895 |
| 8 | Outsider | Answer the borrower's check | `proveCreditStanding` | **Refused**, no transaction: `check is for a different borrower` |
| 9 | Borrower | Prove 8 + 6 clears 14, revealing neither institution nor total | `proveCreditStanding` | [f493653f61…](https://preprod.midnightexplorer.com/transactions/f493653f6189afc6f3b91652fc6fbc97b93d882ce635f27bef89ca0535de8c6e) · block 3,036,904 |
| 10 | Borrower | Answer the same check a second time | `proveCreditStanding` | **Refused**, no transaction: `check has already been answered` |
| 11 | Verifier | Commit a stricter check: at least 15 | `createCheck` | [ba33040db7…](https://preprod.midnightexplorer.com/transactions/ba33040db732643d48c3845d017daced165ee65f27d8267534bada12c1568834) · block 3,036,909 |
| 12 | Borrower | Inflate institution A's record from 8 to 9 to reach 15 | `proveCreditStanding` | **Refused**, no transaction: `attestation is not live in the registry` |
| 13 | Operator | Withdraw institution B | `removeLender` | [b228e43adb…](https://preprod.midnightexplorer.com/transactions/b228e43adb4a0dbe9f5872e9c56c809a6bf363ffc2c2fe719b3c350de9608f06) · block 3,036,914 |
| 14 | Institution B | Issue another record after withdrawal | `issueAttestation` | **Refused**, no transaction: `not a registered lender` |
| 15 | Operator | Void a record of institution A, which is still admitted | `revokeOrphanedAttestation` | **Refused**, no transaction: `the issuer is still admitted and alone may revoke` |
| 16 | Operator | Void institution B's record | `revokeOrphanedAttestation` | [802900d37e…](https://preprod.midnightexplorer.com/transactions/802900d37e03e025ee3bb99a1fc269bf949bc375d32e8e1cd0054953eb45bd87) · block 3,036,918 |
| 17 | Verifier | Commit a fresh check at 14 | `createCheck` | [293c6b2f35…](https://preprod.midnightexplorer.com/transactions/293c6b2f353bf1c922594e3911fbdf0175e87a9404c0417220339698d4d33fc5) · block 3,036,922 |
| 18 | Borrower | Present the voided record from institution B | `proveCreditStanding` | **Refused**, no transaction: `attestation is not live in the registry` |
| 19 | Operator | Offer the registry to a successor key | `proposeAuthority` | [07766c7348…](https://preprod.midnightexplorer.com/transactions/07766c73486cd3688cc09d17bcbf80244b77e0f084ffc3a116e46b730b6b0270) · block 3,036,926 |
| 20 | Successor | Accept the registry | `acceptAuthority` | [dd6d4631c4…](https://preprod.midnightexplorer.com/transactions/dd6d4631c4e32dff661712ed2c219f99ec353bf089ad9c0c1bc163317b738ec2) · block 3,036,930 |
| 21 | Former operator | Admit an institution after handing over | `registerLender` | **Refused**, no transaction: `only the authority may register lenders` |

Re-check the chain side with `npm run verify:onchain -- preprod`. The preprod indexer is hosted by Blockfrost, so set `BLOCKFROST_PREPROD_PROJECT_ID` to the id of a free Blockfrost project for preprod first. The transaction hashes above come from the public indexer, not from the run's own log.
