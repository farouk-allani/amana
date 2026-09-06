# Version 2 demo rehearsal

This is a rehearsal procedure, not evidence that a public-network demo has been completed.

## Setup

Run the checks in the README, then configure Lace, a funded test wallet and a trusted proof server on the same explicitly selected network. Proof-server version 8.1.0 is the current project reference. Record the actual wallet, prover, compiler and network versions used.

Use separate browser profiles for **operator, demo lender A, demo lender B, borrower, verifier**. Role tabs within one profile share the same identity; switching tabs does not create a second lender. Use one active tab in each profile. All actors join the same fresh version 2 registry.

The operator deploys, records the real address, activates with its deployment-bound key, and admits the two lender keys. No Enda/Taysir identity or participation should be implied by fictional demo issuers.

## Repayment evidence

1. In the borrower profile generate a pseudonym for A's lender key. Save it. Generate another for B and show that they differ.
2. A issues a summary with 8 on-time of 8 scheduled; B issues 6 of 7. Use the same inclusive interval inside the verifier's forthcoming 24-calendar-month window.
3. Transfer both version 2 credential JSON blobs privately to the borrower. Import them. The wallet updates immediately without a reload.
4. Refresh once to demonstrate persistence. Explain that storage is currently unencrypted.

A monthly period is `(UTC year - 1970) * 12 + UTC month index`. In September 2026 the current period is 680; a window including September and the prior 23 months is 657–680. This is a fixture example, not a real borrower history.

## Verifier-created check

1. The verifier prepares a new check for 14 repayments over 24 months. Send its ID to the borrower.
2. The borrower generates a response key and returns it through the application channel.
3. The verifier pastes that response key and creates the check on chain. Show the actual transaction confirmation.
4. The borrower loads the committed check. The threshold and interval are read-only. Review the verifier key, requested terms and disclosure, then consent and prove.
5. The verifier reads the same ID. Show threshold 14, interval, and nullifier. The result contains no true aggregate count or list of contributing lenders.

In the automated fixture, 8 + 6 exactly clears 14. A separate 40-repayment test also publishes only the threshold. For a public recording, show real transactions; do not substitute simulator output for network evidence.

## Negative cases and revocation

- Try an uncommitted ID: it is reported as nonexistent.
- From a different borrower profile, try the public ID: recipient binding blocks it.
- Try to answer a completed check: it is rejected.
- Revoke A's credential as A. The borrower wallet marks it not live.
- Create a fresh check using the complete exchange above. Only B's 6 repayments remain, so the UI disables proving at threshold 14.
- Show the circuit regression test that bypasses the UI with the revoked leaf and fails membership. Do not describe the disabled button as a submitted failing transaction.
- Explain that the earlier successful check remains a historical result.

## Evidence to capture

Record network, contract address, deployment/create/prove/revoke transaction IDs and explorer links where available, exact source revision, tool versions, and measured proving/finalization time. Validate URLs in a fresh browser. Label any cuts or time compression in the recording. Keep a backup recording and rehearse with a fresh profile before submitting.
