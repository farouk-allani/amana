# Amana — pitch deck

Twelve slides. Speaker notes are the indented lines; they are what to say, not what to put on the slide.

---

### 1 — Title

**Amana** أمانة
*Portable private credit history.*

A repayment record you earned at one lender, proved to another — without revealing which lenders, how much, or that it was you.

> Amana is the Arabic word for a trust: something placed in your hands to keep faithfully and return intact. It is what a lender extends and what a borrower carries.

---

### 2 — The problem is not missing history

1.4 billion adults are credit-invisible.

The usual explanation: *they have no financial record.*
Often false: a woman who has repaid **14 microloans on time** at one MFI has an excellent record.

**It just does not travel.**

> Open here, not on the technology. Everyone in the room has heard "1.4 billion unbanked." Almost nobody has heard the second line, which is the one that matters.

---

### 3 — Why it does not travel

Moving a credit record between institutions means exposing:

- income and indebtedness — **to a competitor**
- identity — **to a small community** where borrowing carries real social cost, and it falls hardest on women

The choice on offer today: **stay invisible**, or **be legible to everyone**.

Most people sensibly choose invisible.

> This is the slide that earns the rest of the deck. The barrier is not a missing API. Credit bureaus have moved records for a century. The barrier is that the only available disclosure is total.

---

### 4 — Amana removes the choice

The borrower proves the fact the lender actually needs, and nothing else.

> **"At least 14 on-time repayments in the last 24 months, across records that are live right now."**

The verifier does **not** learn: their real total · which institutions lent to them · how many records they used · how much they borrowed · whether they have assessed this person before.

---

### 5 — Why Midnight, specifically

Two properties that have to hold **at the same time**:

| | |
|---|---|
| **Unlinkable in public** | Two lenders comparing customer books find no overlap for a shared borrower |
| **Aggregable in zero knowledge** | One proof still adds those same records into a single total |

Every lender sees a different identifier for the same person:
`subjectId = H("amana:subject:", borrowerKey, lenderKey)`

> This pairing is the reason to build on Midnight rather than on a database with good access control. A permissioned database can give you the first property. Only a ZK circuit gives you both, because only the circuit holds the secret that generates both pseudonyms at once.

---

### 6 — The split is the product

**Public ledger:** which institutions may issue · one Merkle root over all attestations · spent nullifiers · thresholds cleared, by nobody named · counts

**Never leaves the device:** amounts and terms · repayment counts · which institutions lent · identity key · that any two records are one person's

> Every number a lending decision is actually made on is in the second column. Not withheld by policy — the contract only ever receives a hash and could not recover the preimage if it wanted to.

---

### 7 — How it works

```
borrower ──gives pseudonym──▶ lender
lender   ──writes ONE hash──▶ attestation tree (public)
lender   ──hands credential──▶ borrower        (out of band; we have no copy)

verifier ──hands a checkId──▶ borrower
borrower ──ZK proof─────────▶ chain: "cleared your bar" + a nullifier
verifier ──reads the outcome
```

The circuit checks each record: issued to **this** borrower, internally consistent, recent enough, opens to a leaf that is **live right now**. Then it folds the totals and compares.

---

### 8 — Three decisions worth defending

**Per-lender pseudonyms** — a single borrower identifier would hand colluding institutions exactly the linkage we exist to prevent.

**Revocation overwrites the leaf** — a public revoked-set would force a borrower to reveal which attestation is theirs to prove non-membership. Overwriting changes the root; paths stop verifying; nothing about the borrower is published. *This is why the tree is a plain `MerkleTree`, not `HistoricMerkleTree` — historic roots would silently defeat it.*

**Uniform proof shape** — the compiler rejected our first version because a ledger read was conditional on a witness. It was right: counting reads would reveal how many records a borrower holds.

> Slide 8 is the one that wins engineering credibility. The third bullet in particular: we can show the exact compiler error and the fix.

---

### 9 — Built and tested

- **5 circuits**, Compact `0.23.0` / compiler `0.31.1`, full build ≈ 60s
- **31 tests**, offline, against the compiled circuits with a real ledger and separate per-actor private state — no mocks
- **4-role interface** over one contract: registry · lender · borrower · verifier
- `localStorage`-backed private-state provider, so a borrower's credentials survive a reload

The four tests that matter: aggregation across lenders · a stolen record is unusable · a revoked record stops proving · one borrower is unlinkable across lenders.

---

### 10 — Who this is for

**Primary:** microfinance institutions in markets with thin bureau coverage — Tunisia, Egypt, Kenya, Bangladesh, Pakistan. Tens of thousands of borrowers each, group-lending heritage, real default-management practice.

**The adoption wedge:** an MFI gains portable proof of *its own* good borrowers without handing a competitor its customer list. That is the deal a bureau cannot offer, and it is why the first institution says yes before the second one exists.

> Be honest about the chicken-and-egg. The wedge is that Amana is worth joining for a single institution: it makes your good borrowers more bankable elsewhere, which is a retention story, without exposing your book.

---

### 11 — Roadmap

**Wave 1 (done)** — issuance, revocation, aggregate threshold proof, four-role UI, 31 tests

**Wave 2** — prove a *distinct lender count*, not just a total · decentralise the registry to a threshold of institutions · batch issuance for real MFI volumes · mitigate timing correlation

**Wave 3** — banded disclosure (prove a range, close the binary-search leak) · verifier view keys · a letter of interest from a real MFI

> Name the Wave 3 item that cannot be finished by working harder. It signals we know the difference between engineering and adoption.

---

### 12 — What we are not claiming

- The registry authority is **one key** today. It models a bureau; decentralising it is Wave 2.
- A lender can still issue an **inaccurate** record. The circuit enforces internal consistency, not truth.
- **Timing** is the strongest remaining leak: answering a check is a visible transaction at a visible moment.
- Small registries give **small anonymity sets**. Early users have weaker privacy than later ones.

**`docs/PRIVACY.md` names every one of these in the repository.**

> Close on this slide deliberately. Judges have seen a lot of decks that claim perfect privacy. The team that publishes its own leak analysis is the one you believe about everything else.
