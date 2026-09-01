# Demo video — script

**Target: 4 minutes.** Screen recording with voiceover. Everything below is real; nothing is staged or sped up except where noted.

Set up before recording: contract compiled, proof server running, `npm run ui` up, wallet connected, registry deployed, one lender already admitted. Starting from a blank registry burns 45 seconds on setup that proves nothing.

---

## 0:00 — 0:30 · The problem

*Terminal or slide 2. No app yet.*

> "About 1.4 billion adults are credit-invisible. The usual explanation is that they have no financial history. That's often just false. A woman who has repaid fourteen microloans on time at one microfinance institution has an excellent history — it simply doesn't travel with her.
>
> And the reason it doesn't travel isn't technical. Credit bureaus have moved records between institutions for a hundred years. The reason is that moving her record means exposing her income, her debts, and her identity — to a competitor, and to a small community where being known as a borrower carries a real cost. Her only options are to stay invisible, or to become legible to everyone. Most people choose invisible.
>
> Amana removes that choice."

---

## 0:30 — 1:00 · Unlinkability, shown first

*Borrower tab. Paste lender key #1 → Generate. Paste lender key #2 → Generate.*

> "Here's the first thing that makes this possible. Before a lender can issue you anything, it needs a name for you. Amana gives every lender a *different* name, derived from your key and theirs.
>
> Same borrower, same device — two completely unrelated identifiers. Two institutions comparing every customer they have would find no overlap. And yet, as you'll see in a moment, a single proof still adds both of their records together — because the circuit holds the secret that generated both."

*Show the two identifiers side by side. Do not rush this — it is the core idea.*

---

## 1:00 — 1:50 · Issuance: the amounts never land

*Lender tab. Paste the borrower's pseudonym. Enter 14 / 14 / current month.*

> "Now the lender states what actually happened: fourteen repayments scheduled, fourteen on time."

*First, set on-time to 15 against a total of 14. Click issue. Let it fail.*

> "Watch what happens if the lender inflates it — fifteen on-time out of fourteen scheduled. The circuit rejects it. It can't see the numbers, but it can still enforce that they're consistent."

*Fix to 14/14. Issue. While the proof builds:*

> "These numbers are not transaction inputs. They reach the circuit as private state, through a witness. What lands on the chain is a single 32-byte hash — and the chain could not recover the amounts from it if it wanted to."

*Credential appears. Copy → Borrower tab → Add to my wallet.*

> "And this blob is the credential. It isn't a pointer to a record on our server — it *is* the record. Once she has it, the issuing lender can't see where she presents it. Neither can we."

*Refresh the browser. The credential is still there.*

> "It lives on her device and nowhere else. If she clears this browser, it's gone — because nobody holds a copy."

---

## 1:50 — 2:40 · The proof

*Verifier tab. Terms: 14 on-time, within 24 months. Generate a check. Copy.*

> "Now a different lender is assessing her. They set their terms and generate a check identifier, which they hand over however they already talk to applicants — SMS, a QR code on a form. Amana has no opinion about that channel, deliberately."

*Borrower tab. Paste. Note the local pre-check.*

> "Her wallet tells her *before* she spends a transaction whether she can clear the bar. And Amana presents the fewest credentials that do — one record of fourteen answers a bar of fourteen, so the second one stays home. Fewer records presented is less correlation."

*Prove it. Let the real proving time show — do not cut. If it runs long, say so rather than editing.*

> "This is a real zero-knowledge proof, being built on her own machine. No server we run is ever given the data it's about."

---

## 2:40 — 3:15 · What the verifier learned

*Verifier tab → Check for an answer. Read the two-column panel on screen.*

> "Cleared. And here's the whole product, in two columns.
>
> They now know she cleared their bar, that her records are recent, that those records were live and not revoked, and that she hasn't answered this same check before.
>
> They still don't know her real total — which could be forty. They don't know which institutions lent to her. They don't know how many records she used, how much she borrowed, or whether they've assessed her before. That last one matters: the nullifier she burned is specific to *this* check, so two lenders comparing notes can't discover they're looking at the same applicant."

---

## 3:15 — 3:45 · Revocation

*Lender tab → Revoke the leaf.*

> "Last piece. Suppose the lender needs to withdraw that record."

*Borrower tab — it now reads **revoked**.*

> "Her wallet already knows, and it learned that from the chain, not from a message the lender sent it."

*Answer a fresh check. It fails: attestation is not live in the registry.*

> "The proof simply stops working. And notice what was *not* published: there's no revocation list. A public list of revoked records would force her to reveal something about which record is hers, just to prove hers isn't on it. Instead the lender overwrote a leaf in the tree, the root changed, and every path through that leaf stopped verifying. Nothing about her reached the chain at all."

---

## 3:45 — 4:00 · Close

*Terminal: `npm test`.*

> "Thirty-one tests, offline, against the real compiled circuits — including one that proves a stolen credential is unusable, and one that proves two lenders can't link the same borrower.
>
> The repository documents where this still leaks — timing correlation, small anonymity sets in a young registry. We'd rather you heard that from us.
>
> Amana. أمانة — a trust: something placed in your hands, to keep faithfully and return intact."

---

## Recording notes

- **Do not speed up the proof.** If proving takes eleven seconds, eleven seconds of honest silence is better than a jump cut a judge will notice.
- **Do not fake a failure.** Every failing case in this script is a real assertion in `amana.compact` and will fail on its own.
- Record at 1920×1080. The interface uses a dark palette; check contrast on a projector before submitting.
- If a live transaction fails mid-take, keep the take and narrate it. A recovered demo reads as real; a suspiciously clean one does not.
- Keep the browser console open on the proving step if it does not clutter the frame — it shows the proof server being hit locally.
