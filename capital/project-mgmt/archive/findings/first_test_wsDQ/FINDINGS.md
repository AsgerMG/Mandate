# wsDQ — the first real test of the ranker, read

Run 2026-08-11. Twelve real companies, one per next-generation archetype, at the
selection seam and nowhere downstream of it. **EUR 0.2058 for the ranker, EUR 1.65
for the whole workstream including three memo runs a mid-run correction retired.**

```
corpus=postgres instruments=1088 at 2026-08-11T07:04:33.485Z
ranker: all 12 request(s) on EMBEDDING
agent-select: arm=adviser depth=40 count=6 effort=low lookups=0 (0 brief(s) retrieved)
  model=claude-sonnet-5 — 12/12 chose, 0 FELL BACK to the shipped order
  (0 empty reply, 0 unparseable), 0 short reply, 0 unusable id(s),
  EUR 0.2058 total, EUR 0.0171 per brief
levers: AGENT_SELECT=adviser depth=40 count=6 effort=low lookups=5 pool=18 published_cap=7
check_answer_not_reachable: ok — 49 modules, none names an answer-bearing source
check_recall_leaks: ok — 1,898 described rows, 0 leaks at exact / 8-gram / sibling
```

Per company, `<slug>/seam.md` holds the founder as the system saw them, all 18
pool rows with our own per-fund verdict on each, what the model chose and how far
down it reached, and the published projection both ways. `<slug>/prompt_r1.txt`
and `<slug>/reply_r1.txt` hold the bytes: 11,022 characters of system prompt and
23-30k of user prompt, uncut, and the reply exactly as it arrived.

---

## The control, and what it is worth

One process, one pool object per company. `poolOff` is the array as it stands at
the seam — `scripts/_wsdl_equiv.ts` proves the off arm returns its argument BY
REFERENCE on 60/60 founders, so that IS the control and not a reconstruction of
it — and `poolOn` is what `agentSelectMemoPool` returns when handed that same
object. Same millisecond of corpus state, same peers, same semantic scores.
Nothing can drift between the arms because there is no between.

Two things this deliberately does not do, both stated rather than buried:

* **No writer.** The published tables below are the PROJECTION: production's own
  `orderMemoCandidates` and `buildRowsForCheck` on each arm's pool, cut to the
  7-row cap — what a writer obeying "already ranked, already cut, do not reorder,
  do not omit" would publish. wsDP established the standing of that projection:
  it is the last free step and it is **not a proof**, because the writer can
  reorder, omit and demote and all three are model outputs.
* **No web search.** `runIntelligence` unions the comparable-company search into
  `fieldChannels`, which is tier 1 of the row sort. That is a memo-stage cost. So
  tier 1 here comes from the company's own corpus record and its DB-native peers
  only — a lower bound, applied identically to both arms, which cannot advantage
  either because both read the same pool.

---

## The headline: the arm works, and three of its four moving parts are dark

**It works.** 12/12 returned a usable answer, zero fallbacks, zero unparseable
replies, zero invented indices, at EUR 0.0171 a company. It reached a mean depth
of 13.6 of 17 and changed a mean of 2.3 of 7 published rows. Nothing about the
mechanism is fragile.

**But look at what did not happen.**

| designed to | happened |
|---|---|
| think, at effort `low` over an adaptive budget | **10 of 12 spent ZERO thinking tokens.** Nortal spent 310, Silvr 79 |
| declare what it cannot separate | **0 of 12 named anything in `unsure`** |
| retrieve those funds' own rules from `eligibility_embeddings` | **0 lookups. Round two never ran, on any company** |
| weigh the peer prior and overrule it | the prior line is on **18 of 18 rows** for 6 companies and on **0 rows** for Neura Robotics |

So this run priced and graded a **single-shot 27,000-character pick with no
reasoning, no self-declared uncertainty and no retrieval**. The `unsure` ->
retrieve -> re-ask loop is the adviser arm's whole distinguishing feature, and
`eligibility_embeddings` — the one index with zero production call sites, i.e.
the only genuinely NEW information in the system — was never queried once.

Two candidate causes, both visible in the bytes, neither acted on because tuning
mid-run would leave two uncontrolled runs and no baseline:

1. The system prompt says, in its second paragraph: *"Your reply is a list of
   index numbers and nothing else. No founder reads a word you write, so spend
   the effort on the choice rather than on explaining it."* That is an
   instruction not to spend output tokens, and thinking bills as output.
2. The `unsure` instruction ends *"and only where the extra rules could actually
   change your answer — if you already know, leave it empty."* An empty list is
   the compliant answer to a model that has done no reasoning about whether it
   knows.

**And we paid for reasoning we cannot read.** Nortal's response reports
`output_tokens_details.thinking_tokens: 310` while zero content blocks of
`type: "thinking"` arrived, so the transcript records `THINKING (0 chars)`. Same
for Silvr's 79. The arm bills at the output rate for reasoning the trace
structurally cannot show.

---

## What it did that the score would not — company by company

### It removed a film fund from an AI company's table, and left a cinema fund on a fintech's

**Aleph Alpha** (sovereign LLMs, DE) is the strongest single result. The shipped
order published, at row 4, the **Bayerische Richtlinien fuer die Foerderung von
Film-, Fernseh- und anderen audiovisuellen Projekten** — Bavarian film and
television funding — to a company building sovereign large language models. It
also published **NRW.SeedCon**, a North Rhine-Westphalia seed co-investment
scheme, at row 2. The model dropped both out of its six and put in, at its own
rank 1, **KMU-innovativ: Informations- und Kommunikationstechnologie**, whose own
words on the row it read are *"Der innovative Kern der Vorhaben soll massgeblich
im Bereich IKT liegen"* — the innovative core of the project must lie in ICT.
That is the fund's own scope sentence separating it from its neighbours, which is
exactly the line wsDO measured as separating 83% of otherwise-identical siblings.
It also reached to **6G-Industrieprojekte** at pool rank 14. Four rows of seven
changed. This is the same defect class as the Lailaps example the owner cited
from the other direction, and the model fixed it.

**Silvr** (revenue-based financing for e-commerce SMEs, FR) is the counter-case
and it is the same fund family. The pool's row 2 is the **CNC — Soutien a la
modernisation des industries techniques et a l'innovation**, whose own words are
*"Aides aux moyens techniques de production et de diffusion, CNC"*: the French
National Centre for Cinema. The model kept it, at its own rank 4, on a company
that lends money to online shops. It did reach to **EIC Accelerator** at pool rank
16 — a genuinely good reach for a scaling fintech — but it did not do for Silvr
what it did for Aleph Alpha.

### It found the obviously right fund the score had buried

**SMART Photonics** (indium-phosphide photonic IC foundry, NL): the shipped order
filled rows 4-6 with regional EFRO / OPZuid / JTF cohesion schemes. The model
reached to pool rank 11 and put **Chips JU KDT** at its own rank 2 — the European
Chips Joint Undertaking, for a semiconductor foundry. Three rows changed. That is
the canonical correct answer and the score had it eleventh.

**Nebius** (GPU cloud for AI training, NL) reached the whole way to pool rank 17
for **NXTGEN HIGHTECH**, the Dutch National Growth Fund high-tech programme, and
dropped **EIC Transition** from row 3 — correctly, since EIC Transition's own row
says it funds *"maturing a proof of concept from an earlier EU-funded project"*
and Nebius is a commercial cloud operator with no such project. But it then spent
two of its six seats on **two different DEI+ energy-demonstration rows** (pool 0
and pool 7), which is a duplicate, not a choice.

**eAgronom** (farm software and soil carbon, EE) demoted the one row the score put
first — *"Toetus ettevotjate toote-, teenuse ja protsessiarenduse... - mostly
agrifood"* — to its own rank 5, and promoted three Estonian **applied-research**
grants tagged *"mostly software & AI"*. eAgronom's sector answer is `agrifood`
and its description is farm-management software. The score can only read the
sector field; the model read the description. That is precisely the judgement the
arithmetic cannot make, and it made it correctly.

### Where it was wrong, and the quotes

**bunq** (licensed consumer neobank, NL) picked, at its own rank 6, **Horizon EU
CL1**, whose own description printed on the row it read says:

> *"Collaborative R&I grants for health research that generates clinical evidence
> — disease..."*

Health research, for a bank. The disqualifying fact was on the row, in the fund's
own words, and it picked it anyway.

**Neura Robotics** (cognitive humanoids and cobots, DE) picked, at its own rank 3,
**Horizon EU CL6**:

> *"Collaborative research and innovation grants for food systems, farming,
> forestry, fisheries..."*

for a humanoid robot company — and CL6 was one of only four rows in that pool
carrying a named obstacle, which the code then demotes below every open row
whatever place the model gives it. It picked a second obstructed row, **EIC
Pathfinder**, at rank 2. So two of its six votes could not publish where it put
them. Across the run, **4 of 72 picks landed on a row carrying a named
obstacle**, on 3 of 12 companies.

**sennder** (digital road-freight brokerage, DE) is the null case: 0 rows changed.
It ratified the score's top three — **Clean Aviation, Europe's Rail, SESAR JU** —
which are aircraft, rolling stock and air-traffic-management programmes offered to
a software freight broker. All three carry the descriptor *"mostly mobility &
transport"*, which is a corpus aggregate over what a fund has historically paid
for and not a statement of what it funds. On this company that descriptor actively
misled, and the model followed it.

### The single sharpest evidence about reliability

**ERC PoC, the same row, decided both ways.** For **Corti** the model dropped ERC
PoC from the table — correct, and the row's own text says why: *"A EUR 150 000,
18-month lump sum that lets a current or recent ERC frontier-research grantee..."*.
Corti is a company, not an ERC grantee. For **BioNTech** it PUT ERC PoC IN, at its
own rank 5, reaching down to pool rank 11 to do it. BioNTech is a 250+ FTE
commercial vaccine manufacturer and is no more an ERC grantee than Corti is. Same
row, same eligibility sentence, opposite decisions, one run apart.

### Duplicate suppression is the most consistent failure

On **4 of 12** companies the model spent two of six seats on two versions of one
programme: ZIM and ZIM (Aleph Alpha, pool 12 and 16), *Ettevotja rakendusuuringute
toetus* 2023 and 2024 (Nortal, and again eAgronom), DEI+ and DEI+ (Nebius). The
prompt never asks for six DISTINCT programmes — only for six distinct index
numbers, which siblings satisfy.

---

## The three findings that are not about the model

**1. The prompt states a base rate that is wrong by more than a factor of two,
and it is the sentence that licenses the whole behaviour.** Every user prompt
says:

> *"measured on held-out companies the scheme that actually paid out is in its
> first six rows about a quarter of the time, and somewhere in this list about
> three quarters of the time. So the fund you are looking for is usually here,
> and it is usually NOT at the top."*

The 75% was measured on `computeVerdict`'s candidate list — min 25, median 105
rows. **This list is 18.** A free screen of 45 real recall founders run before any
spend (`_wsdq_pick.ts`) found the won fund present in the 18-row memo pool on
**15 of 45 — 33%**, and already published with the arm off on 12 of 45. wsDD's own
depth table puts the ceiling at K=20 at 46.7%. Either number contradicts "usually
here". The model is being told to reach down a list that usually does not contain
the answer.

**2. Our own per-founder verdict — the one fact on the row that is about THIS
company — is very nearly constant, so it can separate nothing.** "Nothing we can
check rules them out" appears on 17 or 18 of the 18 rows for eleven of the twelve
companies; on Aleph Alpha it is 18 of 18. This is structural, not a bug:
`accessiblePool` removes conclusively-blocked rows before the pool is cut, so what
survives is open almost by definition. wsDL added this line specifically so the
model would see our own read; on this pool it carries no information.

**3. The peer prior is either on everything or on nothing.** For Nebius the
`#n most-won by comparable companies` line appears on all 18 rows with ranks #2
through #23 — a feature present on every option is not a discriminator. For Neura
Robotics it appears on none. And the `PriorDecision` record cannot detect this:
"followed 6, overrode 12" is what you get mechanically when the prior ranks all 18
and the model picks 6, and it reads identically to a real override. Six of the
twelve companies report exactly that.

Two more, found for nothing on the way:

**4. Three modules still build their Anthropic client at module scope.**
`adaptiveRound.ts`, `research.ts` and `pipeline.ts` each run `new Anthropic()` at
import, static imports are hoisted above `loadEnvLocal()`, and the first attempt
at this run therefore made three calls that all failed authentication and wrote a
founder file saying "0 questions asked" — a silent degradation into a screen-1
founder that no error surfaced. `agentSelect.ts` documents this exact failure from
its own first run and fixed it lazily for itself. The other three were not fixed.

**5. A full brief costs EUR 0.24, not the ~$4 assumed** — and in one of the three
memo runs made before the correction, the writer **timed out at 90 seconds,
produced nothing usable, and was retried with thinking off**. That retry is what
published.

---

## The Lailaps finding, preserved

The film company was dropped on the owner's instruction — a film producer is not
who this product serves — but the measurement that prompted it stands, because it
is the same defect Aleph Alpha shows from the other side.

Lailaps Films GmbH: with the arm off the memo offered construction research,
rental-housing modernisation and rural development. A **nonsense reversal**
surfaced the Bavarian film-and-audiovisual directive and the medienboard
Berlin-Brandenburg. `_wsdq_probe.ts` explains why exactly: **both film schemes are
in the 18-row pool, at positions 16 and 17 of 18** — the right neighbourhood, at
the bottom, which a reversal puts on top. The fund it actually won,
`satr_de_equity__sa_118637__lfa_forderbank_bayern`, is a 2025 extension of the
scheme sitting at position 17 and is not itself in the pool.

And the reason the order could not find it is not judgement: **the selector's
prompt never contains the company's name.** It gets `country: DE`,
`sector: other`, and a description that for this founder is one of eleven canned
sector sentences — *"We develop and commercialise other. We are seeking public
funding for research and development work."* The single most informative token
available about Lailaps Films GmbH is the word "Films", and it is withheld from
the only stage that could use it. 73% of the recall corpus is in that state.

---

## What I would change next, and the evidence for each

Ordered by evidence, not by appeal. **None of this was applied during the run.**

1. **Correct the base-rate sentence to the depth actually shown.** Evidence: 15/45
   on the 18-row pool against the prompt's "about three quarters". It is the
   sentence that authorises reaching, so its being wrong is not cosmetic.
2. **Make the model spend the thinking it is billed for, or stop paying for the
   adaptive mode.** Evidence: 10/12 at zero thinking tokens, 2/12 billed for
   thinking that arrived as no readable block. The system prompt's "spend the
   effort on the choice rather than on explaining it" is the first thing to test
   against, and the honest comparison is a no-thinking arm at a lower price.
3. **Ask for six distinct PROGRAMMES, not six distinct indices.** Evidence: 4/12
   spent two of six seats on a sibling pair.
4. **Move the seam earlier, or widen the menu.** Evidence: the reachable headroom
   on the 18-row pool is 3 of 45 founders — 15 have the answer in the pool and 12
   already publish it. The mean deepest reach was 13.6 of 17, so the model is
   already reading to the bottom of what it is shown. Depth, not judgement, is the
   binding constraint. agentSelect.ts's own header names this trade and resolves
   it in favour of pool invariance; that resolution is now the thing costing most.
5. **Either make `unsure` reliable or delete the retrieval path.** Evidence: 0/12
   declared anything, so `eligibility_embeddings` — the only index in the system
   with no production call site — has still never been read on a real request. A
   cheaper alternative is to fire retrieval on the rows the model PICKED rather
   than on the rows it doubts.
6. **Fix the three module-scope clients** before another harness silently measures
   an unauthenticated arm.

## What I cannot tell from this run

There is **no answer key** for the twelve bench companies — they are archetypes
chosen to be plausible, not recall pairs with a known won fund. So every
"right"/"wrong" above is a documented reading of a named row against that fund's
own printed words, and none of it is a score. The two things that ARE measured
here are the mechanism (12/12, 0 fallbacks, EUR 0.0171) and the movement (2.3 of 7
published rows changed, mean reach 13.6 of 17). Whether the changed rows are
better in the sense the product is graded on needs the recall set, an answer key
and an N large enough to separate 33% from 40% — a different run, and a more
expensive one.
