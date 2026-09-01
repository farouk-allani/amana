# Walking the whole loop

Amana has four roles and one contract. This is the shortest path that exercises all of them, and it is the script the demo video follows.

The interface carries every role, so one person at one browser can play all four. That is a demo convenience, not a design assumption: in production these are four different people at four different institutions, and nothing in the contract knows or cares that they happen to share a machine.

---

## Before you start

```bash
# 1. the toolchain
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update

# 2. the contract
npm install
npm run compact          # ~60s; generates proving keys

# 3. your own proof server — proofs are built here, not on anyone's server
docker run -d -p 6300:6300 midnightntwrk/proof-server:8.1.0 midnight-proof-server -v

# 4. the interface
npm run ui
```

Install the **Midnight Lace** wallet, open *Settings » Midnight*, and point it at `http://localhost:6300`. Get tDUST from the [faucet](https://midnight-tmnight-preview.nethermind.dev/).

Then open `http://localhost:5173` and press **Deploy a new registry**.

> If you would rather not run a wallet at all, `npm test` exercises every rule in this document against the real compiled circuits, offline, in about a second and a half.

---

## 1. Registry — establish who may issue

**Registry** tab → **Claim as authority**.

The first key to claim a registry becomes its operator. Try clicking it twice: the second transaction fails with *registry already has an authority*. That is the contract, not the interface.

In production this is a bureau or a consortium of MFIs. It is a trusted role, and the README says so plainly.

---

## 2. Lender — get admitted

Open the **Lender** tab and copy the **lender key**. This is `persistentHash("amana:lender:", secretKey)` — a public name derived from a key that never leaves the device.

Go back to **Registry** → paste it into *Admit an institution* → **Register lender**.

The Lender tab now shows **admitted**. Before this, issuing fails with *not a registered lender* — worth showing on camera, because it is one line of Compact doing the work an entire permissions service would otherwise do.

---

## 3. Borrower — take a name for this lender, and only this lender

**Borrower** tab → paste the lender key → **Generate my identifier**.

This is the design's sharpest edge. The identifier is derived from *both* keys:

```
subjectId = H("amana:subject:", borrowerKey, lenderKey)
```

Generate one for a second lender key and compare: completely unrelated. The same borrower is a different, unlinkable person to every institution they deal with — and a proof can still add their records together, because the circuit holds the secret that generated both.

Copy the identifier. This is what a borrower hands over when opening an account.

---

## 4. Lender — issue an attestation

**Lender** tab. Paste the borrower's identifier, then state the record:

- **Repaid on time:** `14`
- **Repayments scheduled:** `14`
- **Last repayment:** leave as the current month

**Issue attestation.**

Two things to point out while the proof builds:

- Those numbers are **not transaction inputs**. They reach the circuit as private state through the `pendingAttestation` witness, and what lands on chain is one 32-byte hash. Try setting on-time to `15` against a total of `14` — the circuit rejects it with *on-time repayments exceed total repayments*. It enforces what it can verify without seeing.
- The **credential** that appears afterwards *is* the record. It is not a pointer to a row on our server. Once the borrower has it, the issuing lender cannot see where they present it, and neither can we.

Copy the credential → **Borrower** tab → paste into *Accept a credential* → **Add to my wallet**.

It is stored in this browser and nowhere else. Refresh the page: it survives, because Amana replaces the reference in-memory private-state provider with one backed by `localStorage`. Clear site data and it is gone for good — there is no recovery, because there is no copy.

### Optional: a second institution

Repeat steps 2–4 with a second lender identity to show aggregation working across institutions that cannot see each other. Issue `6 / 7`. The borrower's wallet now shows two records from two lenders, neither of which knows the other exists.

---

## 5. Verifier — ask a question

**Verifier** tab. Set the terms — `14` on-time repayments within `24` months — and **Generate a check**.

Copy the check identifier and hand it over. In real life this travels however the lender already talks to applicants: SMS, a QR code on a loan form, a link. Amana has no opinion, deliberately.

---

## 6. Borrower — answer it

**Borrower** tab → paste the check identifier, set the same terms → **Prove it**.

Before the button is even enabled, the interface tells you whether your live credentials clear the bar. That check is local; it exists so a borrower does not spend a transaction to discover the answer is no.

Amana presents the **fewest** credentials that clear the bar — one record of 14 answers a bar of 14, and the second stays home. Fewer records presented is less correlation, so minimisation is a privacy property rather than an optimisation.

---

## 7. Verifier — read the answer

**Verifier** tab → **Check for an answer**.

> **Cleared.** The applicant proved at least 14 on-time repayments, none older than Aug 2024.

Then read the second panel out loud, because it is the product:

**You now know** they cleared your bar, their records are recent, those records were live and unrevoked, and they have not answered this check before.

**You still do not know** their real total, which institutions lent to them, how many credentials they hold, how much they borrowed, or whether you have assessed them before.

Try answering the same check twice: *check has already been answered*. The nullifier is bound to this borrower **and** this check, so the same person answering a different lender's check burns an unrelated one. No two verifiers can compare notes and discover they are looking at the same applicant.

---

## 8. Revocation — the part that is easy to fake and hard to do

**Lender** tab → find the issued leaf → **Revoke**.

Now go to **Borrower**. The credential is marked **revoked** — the wallet learned this from the chain, not from a message the lender sent it.

Answer a fresh check. It fails: *attestation is not live in the registry*.

Nothing was published about the borrower. The lender overwrote a leaf in the attestation tree, the root changed, and every Merkle path running through that leaf stopped verifying. There is no revocation list to consult, because consulting one is exactly how a borrower would give themselves away.

---

## What to show if you have sixty seconds

1. Two lender keys → two unlinkable identifiers for one borrower (**step 3**).
2. Issue `14/14`; point at the hash on chain and the amounts that are not (**step 4**).
3. Prove against a bar of 14; read the verifier's "you still do not know" panel (**steps 6–7**).
4. Revoke; watch the same proof stop working (**step 8**).
