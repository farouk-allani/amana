# Amana

**A repayment record you earned at one lender, proved to another — without revealing which lenders, how much, or that it was you.**

Roughly 1.4 billion adults are credit-invisible. The usual explanation is that they have no financial history. Often that is simply false: a woman who has repaid fourteen microloans on time at one institution has an excellent history. It just does not travel. She walks into a second lender and starts from zero.

The reason it does not travel is not technical. Credit bureaus have moved records between institutions for a century. The reason is that in the markets where microfinance operates, moving that record means exposing income, indebtedness, and identity — to a competitor, and to a small community where being known as someone who borrows carries a real cost. The choice on offer is *stay invisible* or *be legible to everyone*. Most people, sensibly, choose invisible.

Amana removes the choice. A borrower proves the fact a lender actually needs — *this person has cleared your bar* — and nothing else.

> **What the verifier learns:** the applicant has at least 14 on-time repayments in the last 24 months, across attestations that are live right now.
>
> **What the verifier does not learn:** their actual total, which institutions lent to them, how many records they used, how much they borrowed, or whether they are anyone the verifier has assessed before.

---

## The claim, demonstrated

```
$ npm test --workspace=contract

 ✓ src/test/amana.test.ts (31 tests) 1.30s

   registry governance         5 passed
   issuance                    5 passed
   proving a credit standing   8 passed
   revocation                  4 passed
   nullifiers                  2 passed
   unlinkability               3 passed
   selection policy            4 passed

 Test Files  1 passed (1)
      Tests  31 passed (31)
```

Among them, the four that matter most:

| Test | What it pins down |
|---|---|
| *adds up records from institutions that cannot see each other* | Aggregation across lenders works, and the lenders' identities stay in private state |
| *will not let a borrower present another borrower's record* | Holding the exact bytes of a valid, on-chain attestation is not enough — you must hold the key it was issued to |
| *stops a revoked record from being provable* | Revocation is enforced by the tree, not by an honour system in the client |
| *shows a different identifier to every lender* | Two institutions comparing customer books cannot tell they share a borrower |

---

## The split, which is the whole product

```
┌─ public ledger ─────────────────────┐   ┌─ never leaves the device ─────────┐
│ which institutions may issue        │   │ loan amounts and terms            │
│ one Merkle root over all attestations│  │ how many repayments, how many     │
│ spent nullifiers                    │   │   were on time                    │
│ thresholds cleared, by nobody named │   │ which institutions lent to you    │
│ counts: issued / revoked / answered │   │ your identity key                 │
└─────────────────────────────────────┘   │ that any two records are yours    │
                                          └───────────────────────────────────┘
```

Every number a lending decision is actually made on is in the right-hand column. The contract cannot read any of it — not because it declines to, but because it only ever receives `persistentHash<Attestation>` of it.

**The flow.** A borrower gives a lender a pseudonym generated for that lender specifically. The lender writes one hash to the tree. Later, the borrower opens that hash inside a circuit, proves the record was issued to them and is still live, sums it with others, and asserts the sum clears a verifier's bar.

---

## Three decisions worth arguing about

### 1. Every lender sees a different you

The obvious design gives each borrower one identifier. It also quietly recreates the problem: two institutions comparing their books immediately learn they share a customer, which is exactly the exposure that keeps people invisible today.

So the identifier is derived from the borrower's key *and the lender's*:

```compact
export pure circuit subjectId(sk: Bytes<32>, lender: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([pad(32, "amana:subject:"), sk, lender]);
}
```

Enda sees `7c2e…`; Taysir sees `f019…`; nothing links them. And yet a single proof gathers both records into one total, because the circuit holds the secret and can recompute both pseudonyms at once. Unlinkable in public, aggregable in zero knowledge — that pairing is the reason to build this on Midnight rather than on a database with good access control.

### 2. Revocation overwrites the leaf. There is no revocation list.

The instinct is a public set of revoked commitments, and a circuit that checks non-membership. That leaks: to test whether *your* attestation is in the set, you have to say something about which one is yours.

Instead, revoking overwrites the leaf with the tree's default value:

```compact
attestations.insertIndexDefault(disclose(index));
```

That changes the root. Every path running through that leaf stops verifying, and the borrower's proof simply stops succeeding. Nothing about the borrower reaches the chain — the lender publishes an index, and an index identifies a slot, not a person.

This is why the tree is a plain `MerkleTree` and **not** a `HistoricMerkleTree`. A historic tree accepts past roots, so a borrower could keep proving with a root from before the revocation, and the mechanism would silently do nothing. The cost is that a borrower's path goes stale whenever anyone else is issued an attestation — so the client rebuilds it from current public state on every proof, which it has to fetch anyway.

### 3. The number of records you hold is not allowed to leak

A proof aggregates up to four attestations. Most borrowers have fewer. The natural way to write that is to skip the unused slots:

```compact
assert(!used[i] || attestations.checkRoot(...), "...");   // rejected
```

The compiler refuses this, and it is right to:

```
potential witness-value disclosure must be declared but is not:
  performing this ledger operation might disclose the boolean value
  of the witness value
```

`||` short-circuits, so a *ledger read* would happen only for slots in use — and an observer counting reads learns how many records the borrower holds. Portfolio size is sensitive on its own: one record reads as "new borrower", four reads as "heavily banked".

The fix is to make the work unconditional and let the flag act only on the result:

```compact
assert(attestations.checkRoot(disclose(merkleTreePathRoot<10, Bytes<32>>(paths[i]))) || !u, "...");
```

Now every proof performs exactly four membership checks. Unused slots repeat a *live* path, so all four disclosed roots equal the tree's real root and distinguish nothing. The padding rule lives in [`witnesses.ts`](contract/src/witnesses.ts) next to a comment explaining why it is not zeros.

The client goes one step further and presents the *fewest* records that clear the bar, rather than everything it has — data minimisation as a policy, tested in `selection policy`.

---

## What the contract enforces

Five circuits, in [`contract/src/amana.compact`](contract/src/amana.compact):

| Circuit | Who calls it | What it guarantees |
|---|---|---|
| `claimAuthority` | registry operator | Once, and only once |
| `registerLender` | authority | Only the authority admits institutions |
| `issueAttestation` | admitted lender | Record is bound to the signing lender; on-time count cannot exceed repayments scheduled; only a hash is written |
| `revokeAttestation` | the issuing lender | Only the issuer can void what it issued |
| `proveCreditStanding` | borrower | Every presented record is theirs, live, recent, and distinct; the total clears the bar; one answer per check |

`proveCreditStanding` is where the work is. It checks, for each of four slots: the record carries this borrower's pseudonym *for the lender that issued it*; the on-time count does not exceed the total; the last repayment is inside the verifier's window; the Merkle path opens to exactly this record; and that leaf is live in the tree right now. Then it rejects duplicates pairwise, folds the on-time counts, compares against the threshold, and burns a nullifier bound to this borrower and this check.

Compact has no mutable locals — assignment requires an ADT on the left — so the fold is written as an explicit chain of four bindings rather than a loop accumulator. The contract says so where it does it.

---

## Run it

**Prerequisites.** Node ≥ 22.17, Docker, and the Compact toolchain. Development is supported on Linux and macOS; on Windows use WSL for the compiler.

```bash
# Compact compiler (compiler 0.31.1 / language 0.23.0)
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update

npm install
npm run compact          # compiles the contract and generates proving keys (~60s)
npm test                 # 31 tests, no network required
```

The test suite runs entirely against the compiled circuits with a real ledger — no mocks, no network, no wallet. `npm run compact:check --workspace=contract` skips key generation for a fast syntax-and-disclosure check (~5s).

**The interface**, against a live network:

```bash
docker run -d -p 6300:6300 midnightntwrk/proof-server:8.1.0 midnight-proof-server -v
npm run ui               # http://localhost:5173
```

You will need the Midnight Lace wallet with a proof server configured under *Settings » Midnight*, and some tDUST from the [faucet](https://midnight-tmnight-preview.nethermind.dev/).

The app carries all four roles, which is how one person can walk the whole loop: **Registry** claims the registry and admits institutions, **Lender** issues and revokes, **Borrower** holds credentials and answers checks, **Verifier** sets terms and reads outcomes. A full demo is scripted in [`docs/DEMO.md`](docs/DEMO.md).

---

## Repository

```
contract/    amana.compact, the witnesses that feed it private state, 31 tests
api/         deploy/join, the four role operations, derived state
amana-ui/    the four-role interface
docs/        DEMO.md, PRIVACY.md, WAVE-1.md
```

Two pieces are worth reading beyond the contract itself. [`contract/src/witnesses.ts`](contract/src/witnesses.ts) is the private-state model — the wallet, the selection policy, and the slot-padding rule. [`amana-ui/src/persistent-private-state-provider.ts`](amana-ui/src/persistent-private-state-provider.ts) replaces the reference in-memory provider with one backed by `localStorage`, because a borrower who refreshes the page should not lose credentials that exist nowhere else. It carries its own codec: `JSON.stringify` cannot represent `Uint8Array` or `bigint`, and both are tagged explicitly rather than sniffed on the way back in.

---

## What this is not

The registry authority is a single key. That models a bureau or consortium, which is how these systems actually work, but it is a trusted role: an authority that admits a dishonest institution admits dishonest attestations. Decentralising it is a Wave 2 question.

Four attestations per proof is a compile-time constant. Raising it costs proving time; it cannot be made dynamic without leaking the number of records held.

A lender can still issue an *inaccurate* record. The circuit enforces internal consistency — the count cannot exceed the schedule, the record must be bound to its issuer — but no circuit can tell you whether a borrower really repaid. That is what admitting institutions to the registry is for.

Amana does not yet prove a *distinct lender count* ("records from at least two institutions"), which is a materially stronger claim than a bare total and the main thing Wave 2 adds. Nor does it support selective disclosure of a band rather than a threshold, or verifier view keys — see [`docs/WAVE-1.md`](docs/WAVE-1.md) for the roadmap and what changed in this Wave.

The check identifier is an out-of-band introduction. Whoever the verifier hands it to is whoever can answer it; Amana deliberately has no opinion about that channel, because a credential the issuer can also read back from a server is a credential the issuer still controls.

---

*أمانة — a trust; something placed in your hands to keep faithfully, and to return intact.*

Apache-2.0
