# wsHM — the writer was handed four euro figures on four different bases, and it matched them; the arithmetic wsHE removed from the score was still being done in prose

**FOR THE OWNER, VERBATIM.** wsHE fixed the award band in the score and named
the one site it could not reach: the writer's prompt. That site is real, the
contradiction is real, and I could settle it without spending, because the
recorded briefs already show the model doing the arithmetic in its own words.
The writer's candidate block prints up to **four euro quantities per row, on
four different bases, all bare** — the founder's stated amount (one figure for
their whole need), a hand-curated per-programme *ticket* band, this scheme's
measured *typical award*, and a comparable firm's *lifetime total across a whole
channel*. Nothing said which was which, so the model did what a reader does: it
assumed they were comparable. On a founder who answered €15M–€50M it wrote
**"Innovation Fund SSP is the standout first move: it is sized for capex grants
from €2.5M into the tens or hundreds of millions, matching your €15M to €50M ask
directly"** — that row's measured median is **€4.0M over 57 awards, below the
floor of the band it was said to match**. In the same brief the two smallest
payers on the table were talked down (*"typically funds smaller
proof-of-concept extensions"*, *"normally SME-scaled"*). Across three
independent recorded runs of that founder, on **three different code orders**,
the writer's named first move was the largest payer every time — including the
run where the score had ranked it **last of eight**, and the run where **it was
not on the table at all**. That is wsHE's "prefer the larger payer", surviving
one stage later. **And it matters more than a wording defect, because BL-5 makes
the bottom line name the first move**: the writer no longer deletes rows
(`worth: Boolean(note)` is gone, wsGC), but it still tells the founder which
door to open, and it was choosing on the one signal measured pointing backwards.

**What I could not do: price it.** The free ladder has no model in it. Nothing
offline can tell you what labelling the money is worth in EXACT@6, and I did not
manufacture a number. What the change buys is that the queued paid run measures
a prompt that is not arguing with itself — the score now says "below the ask is
normal" and so does the prompt, instead of one undoing the other.

---

```
run             2026-08-18, isolated worktree wsHM-writer, ONE session
cost            ZERO. One Voyage embed and one Postgres read per archetype for
                the measurement; every quote is read off a brief someone
                already paid for. ANTHROPIC_API_KEY never used.
measurement     npx tsx scripts/_wshm_money.ts        (free, ~2 min, 12 archetypes)
prompt as sent  npx tsx scripts/_wsde_prompt.ts       (free, production's own builder)
tapes read      project-mgmt/research/wsde_briefs_after.json
                project-mgmt/research/wsdc_briefs_at_seven.json
                project-mgmt/findings/broken_memos_wsCY/neura_robotics_brief_after.json
                website/frontend/lib/intelligence/__fixtures/report.json
                (4 companies, 6 rendered briefs, 40 published rows)
artifacts       MEASURED.txt  — every money quantity on every archetype's table
                QUOTES.txt    — every bottom line beside the order it was ranked in
```

---

## §1 Every money-shaped thing the writer is shown, read from the builder

Not from memory: `eligibilityContext` and `writerCandidateEvidence` in
`lib/intelligence/pipeline.ts`, and the block they produce, rendered for free by
`scripts/_wsde_prompt.ts`.

| # | what the model sees | where it comes from | on how many rows |
|---|---|---|---|
| 1 | `Ticket sought: €15M – €50M` in the **AUTHORITATIVE** scoping profile | the founder's answer to *"How much are you looking for?"* — one band, one figure | every request |
| 2 | `ticket Wide, scheme-dependent: from €100k to tens of €M under GBER` | **hand-written prose**, one line per CHANNEL in `fund-processes/*.md`, carried by every leaf under it | **84 of 84**, either on its own row line or in its group header |
| 3 | `typical award: 713,442 over 86 awards` | this leaf's **measured median** over real awards | **72 of 84** — never on row 0, by construction |
| 4 | `comparable firms funded through it: VLC Photonics (€5.4M)` | that company's **total across the whole channel**, summed over years | every row with a traced peer |
| 5 | `how the money is shaped: ... capped at €2.5 million per project` | the scheme's own structuring prose | where held |
| 6 | `Co-financing capacity: >50% of project cost`, `share of project cost covered: 50%` | shares, not amounts | where held |
| 7 | the founder's own traced footprint, and every peer amount in the comparables block | the corpus | every request |

Two of these are where the damage is.

**#2 is on every single row and is not measured.** It is editorial, written once
per programme, and 53 of 84 rows carry the same string. It is also the only one
of the four stated in the same units and at the same scale as the ask — which is
why the model reaches for it.

**#3 is absent exactly where it would help most.** `distinguisherPhrases` is
empty on row 0 by construction ("nothing stands above it"), so **the top row —
the one the score ranks highest — is the one row whose measured median the
writer never sees.** Its only money fact is the curated band. 12 of 12
archetypes.

## §2 The contradiction is real, and the tape shows the writer reasoning from it

The two quantities are not comparable and the arithmetic says so. Measured on
production's own path, twelve archetypes, at the published cap:

```
84 of 84 published rows pay a median award BELOW the founder's stated band FLOOR
median gap to the band's geometric midpoint: 1.82 decades — a factor of 66 below
12 of 12 rank-1 rows are shown no measured median at all
```

wsHE measured the same direction on the doors people actually **won**: 89.2%
pay below the stated band, median 0.81 decades (a factor of 6.5), p10 at 1.39. So the ask sits above essentially
every candidate, and a symmetric "closest to the ask" reading is not a proximity
rule at all.

The model performs exactly that reading. From `QUOTES.txt`, one founder
(€15M–€50M), three recorded runs:

| run | what the score ranked #1 | what the writer named as the first move | its median |
|---|---|---|---|
| wsCY | Horizon CL1 (€415k) | **Innovation Fund SSP** — *"the fund sized to your €15M-50M ticket"* | €4.04M, **and not on the table at all** |
| wsDE | EIC Transition (€660k) | **Innovation Fund SSP** — *"fits your capex profile directly"* | €4.04M, ranked **7th of 8** |
| wsDC | Innovation Fund SSP | *"the standout first move ... matching your €15M to €50M ask directly"* | €4.04M, ranked 1st |

Three different orders, one answer: **the largest payer**, chosen on money, and
once named from outside the published table (BL-B1). The same brief demotes the
smallest payers in prose — ERC POC (€150k, the smallest on its table) as
*"typically funds smaller proof-of-concept extensions ... rather than
industrial-scale deployment"*, EIC Transition (€660k) as *"this lane is normally
SME-scaled"*.

It also slid the basis inside a single memo, which is the clearest evidence that
nothing told it what the number was: one answer became *"your ask"*, *"a project
ticket of €15M-€50M"* and *"your capex ask"* in three sentences.

**And it resolves the row's own internal disagreement in the wrong direction.**
NXTGEN HIGHTECH prints `typical award €605,861 over 264 awards` and
`comparable firms: VLC Photonics (€5.4M)` on the same row — a median and a
lifetime channel total, eight times apart. The brief published *"peers VLC
Photonics and LioniX drew €5.4M and €5.2M through it"*, attributing a
whole-channel total to one leaf. Bigger number, wrong basis, printed as fact.

## §3 What it should say instead, and why that option

Three options were open: drop the ask from the writer's prompt, label the
quantities, or state the relationship. **I took stating the relationship, and
labelling is the part of it that makes the statement possible.**

- **Dropping the ask does not remove the comparison.** The curated `ticket` band
  is on 84 of 84 rows, in the same units, and the founder's own description and
  co-financing answer stay in the prompt. The model would still match, against a
  worse number, and we would have lost a figure BL-6 legitimately needs.
- **Labelling alone leaves the model to infer the relationship**, and the tapes
  are the record of what it infers.
- **Stating it is the only option that is TRUE and that makes the prompt agree
  with the score.** After wsHE the score is one-sided: neutral at or below the
  ask, penalised far above it. The prompt now says the same thing in words, so
  the paid run measures one position rather than two that cancel.

The property, in `lib/intelligence/money.ts`:

> **A money quantity handed to a model carries the basis it is measured on.**
> The test, for a field nobody has added yet: of any euro figure a prompt
> prints, *a quantity of what, paid by whom to whom, over what span?* If the
> prompt does not answer, the reader answers for it.

It is a property and not a patch in three ways. `ROW_QUANTITIES` declares
**every quantity a row renders** — money with its basis, and everything else
with what it counts instead — so there is no third state, the same shape as
`UNENFORCED_RULES` and `UNROUTED_STAGES`. **Finding** the quantities is a test
over rendered values, so a field added tomorrow is inside the rule with no edit;
**deciding** which are euros cannot be a test and is not pretended to be one
(`typicalAward: 4043400` and `gatesChecked: 7` are both bare positive numbers),
so `check_money_basis.ts` stops the build until a person says. And the block is
rendered from `AXIS_LABEL`, the same map the rows themselves are rendered from,
so the explanation and the thing explained cannot drift.

Two contract texts were **teaching** the bad comparison and are fixed with it:
`02-funds.md`'s worked example passed *"Your stated project cost sits inside
this scheme's €1-5M band"*, and `SELECT-7` in the selector contract said a
typical cheque *"an order of magnitude from what this company asked for is the
wrong fund"* — symmetric, and measured backwards by wsHE. `GND-9` states the
rule for every stage, and is declared in `unenforcedRules.ts` as a judgement,
because *"matching your ask directly"* names no figure and would pass any
pattern over amounts.

**What it costs to send.** The block is ~1,700 characters, about 430 input
tokens, stated once per brief rather than once per row. Priced on `caps.ts`'s
own measurement of the same prompt (258 input tokens per candidate, EUR 0.0013
each, against a recorded EUR 0.24 brief) that is roughly EUR 0.002. It is not a
consideration either way, and it is stated so nobody has to re-derive it.

**No rate is stated anywhere in the prompt.** `check_prompt_rates` forbids one
in `contracts/` because those files are byte-identical on every corpus;
`money.ts` is assembled into the same prompt from the same kind of literal and
was outside that guard's tree, so the detector moved to `scripts/promptRates.ts`
and both guards read it. The measured figures live in this file. The prompt gets
the direction, which does not move.

## §4 Does the writer drop candidates on money grounds? No — that channel is already shut

The brief's premise (`pipeline.ts:1318`, `worth: Boolean(note)`) is **out of
date**. wsGC removed it: which rows publish is `assembleBriefRows`, by rank, and
a candidate the writer said nothing about publishes from its own facts and logs
`WRT-NO-NOTE`. wsGK then removed the last permutation, a watch-only sort over
the writer's wording. `SHIPPED_PUBLISH_ORDER = "candidates"`, and the sort is one
expression reading only the rank. **Nothing below the writer permutes.**

So the surviving channel is not deletion, it is **voice** — and BL-5 hands it the
founder's first move by contract: *"the middle bullets name which of the
published funds is the right first move and why it is that one rather than
another"*. That is the selector nobody chose, it was choosing on money, and it
is what this change addresses. **Worth knowing rather than fixing here:** the
writer named a fund that was not in the published table (BL-B1) in one of six
recorded briefs, and BL-B1 is declared unenforced. That is a cheap mechanical
check on a finished brief and it is somebody's next hour.

## §5 What this does NOT close

**It is unmeasured, and it cannot be measured for free.** Every claim above is
about what the model was HANDED and what it WROTE on tapes already bought.
Whether the new block changes what it writes costs one paid call per founder.
If the owner's queued run is spent, the two things to read are whether the
bottom line still names the largest payer, and whether the smallest payer on a
table still gets talked down.

**The intake question is still the cleaner fix.** "How much are you looking
for?" offers one band, and the vocabulary declares its subject is the *project*
while every band hint names an *instrument*. `askLine` now states that ambiguity
to the model rather than resolving it silently, which is the honest thing to do
from here — but the real repair is asking the round and the project cost
separately, and that belongs to whoever owns the intake. wsHE said the same.

**The comparable-firm attribution is a separate defect and is only labelled, not
fixed.** `comparableFirmsForChannel` sums a peer's awards across the whole
CHANNEL and attaches the total to a single LEAF row. The writer is now told what
that number is; it is still the wrong number to attach to that row.
`attribution_audit_wsBQ` owns it.
