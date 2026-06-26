# Deterministic company-merge pipeline — design & build plan

**Status:** design, evidence-based (2026-06-20). Supersedes the abandoned LLM
Layer 2 (see `project-mgmt/decision_log.md` D-24 and the 23k-blob post-mortem).
**Goal:** roll every sister entity of a real-world company up to one `parent_group`
**deterministically** — reproducible, idempotent, no LLM, no API, and **re-runnable
on every future data load** so new companies merge automatically.

---

## 1. The problem, with evidence

Exact-name dedup (Layer 1, shipped) collapses only byte-identical normalised
names. It therefore **fragments real companies** along two axes the user spotted:

- **Suffix noise.** `Novo Nordisk A/S`, `Novo Nordisk A/S - E1`, `- NN1`, `- 6AB`,
  `Novo Nordisk Pharmatech A/S`, `Novo Nordisk Denmark A/S` — all one company, but
  the `- CODE` internal ids and division words break exact match. **4,216 companies
  carry a `- CODE` suffix**; stripping them yields **~2,448 new merges**.
- **Cross-country fragmentation.** `Siemens Gamesa Renewable Energy` exists under
  DE/DK/FR/NL/ES; Layer 1 split it into separate groups per suffix token and never
  bridged the countries. The "Siemens Gamesa under Denmark" the user saw is one
  shard of a multinational that should roll up to one parent.

This is a global pattern: **4,186 leading-bigram families span more than one
distinct name, covering 13,253 event-bearing entities** (~8.6% of the corpus).

## 2. What the data says works — and what doesn't

Measured with `ETL/transform/analyze_merge_signals.py` (read-only) on 153,603
event-bearing companies:

| Signal | Verdict | Evidence |
|---|---|---|
| **PIC equality** (same EU id → same entity) | ❌ **useless for merging** | 0 PIC groups span >1 distinct name; PICs are unique per name |
| **Website / dealroom id** | ❌ too sparse | website 1.4%, dealroom 0% |
| **Suffix/code stripping** | ✅ high value, needs guards | ~2,448 merges; but naive stripping over-reaches (`M-TRON`→`M`) |
| **Leading distinctive bigram** (naive) | ⚠️ recall good, precision bad raw | 4,186 families but top ones are generic legal/org forms (`groupement forestier` ×229, `societa agricola` ×145) |
| **+ document-frequency cap alone** | ❌ insufficient | generic multilingual org/legal bigrams still pass (`sabiedriba ierobezotu`=LV "LLC", `zemedelske druzstvo`=CZ ag-coop, `casa cura`) |
| **Multi-country span** | ✅ strong precision signal | `saint gobain` 14c, `air liquide` 6c, `robert bosch` 11c are real; single-country large bigrams are overwhelmingly generic forms |
| **Curated brand dictionary** | ✅ needed for the tail | single-country brand families (`Novo Nordisk` all-DK) and cross-name cases (`Gamesa Electric` → Siemens Gamesa) can't be safely inferred by rule |

**Robustness bonus:** the bigram approach is *inherently immune* to the false-bridge
traps that destroyed the LLM merge — `josef` spreads across 63 distinct bigrams,
`aqua` across 59, `biotech` across 151. Shared first names / industry words never
group, because the merge key is the *ordered leading pair*, not a single token.

## 3. Design principles (the Layer-2-LLM lessons, encoded)

1. **Rules decide, never a model.** Every merge traces to an inspectable signal.
2. **Anchor, don't chain.** Group by the shared anchor (stripped stem / bigram /
   dictionary brand). **No union-find over overlapping candidates** — that is what
   chained one bad edge into a 23,619-company blob.
3. **Precision over recall.** A wrong merge corrupts every aggregate; a missed
   merge just leaves a company slightly fragmented. Tune for precision.
4. **Guard every rule** with a stoplist + frequency cap + size cap.
5. **Gate on a precision eval** against hand-verified truth (incl. false-bridge
   traps) before any apply. Refuse to apply below threshold.
6. **Idempotent & deterministic.** `parent_group` is recomputed from scratch each
   run, a pure function of `(name, country)` + versioned config.

## 4. The pipeline (layered, safest first)

Each layer only ever *adds* merges and writes a single `parent_group` per
connected company; layers compose by **anchor union** (share an anchor → same
group), never by transitive member chaining.

### Layer 1 — exact normalised-name dedup *(shipped)*
`dedup_key` = strip accents/punctuation/legal forms, sort tokens. 4,774 companies
/ 2,310 groups. Bulletproof by construction.

### Layer 2a — suffix & country-tag normalisation *(highest-precision new layer)*
Strip **internal codes** and **country tags**, then re-run exact dedup on the stem:
- Spaced internal id: `^(.*?)\s+[-–]\s+<code>$` where `<code>` is ≤6 chars and
  contains a digit or is short uppercase (`- E1`, `- NN1`, `- 6AB`, `- BOA0032`).
- Country tag: `^(.*?)[-\s](<ISO2>|DEUTSCHLAND|FRANCE|ESPAÑA|ITALIA|…)$`
  (`NXP-AT`, `NXP-DE`, `IFX-DE` → `NXP`/`IFX`).
- **Guard:** the stem must remain distinctive — ≥2 tokens or ≥4 chars, never a
  single letter (prevents `M-TRON`→`M`, `DAWN-BIO`→`dawn`). Require bare-hyphen
  splits to leave a multi-token stem.
- Expected: ~2,448 merges (Novo Nordisk `- E1/NN1/6AB`, NXP/IFX country variants).

### Layer 2b — multi-country distinctive-brand bigram
Group companies sharing a **leading distinctive bigram** `(t1, t2)` when **all** hold:
- neither token in the **multilingual stoplist** (§5),
- neither token document-frequency above the cap (default 120),
- token length ≥ 3,
- **and** the bigram spans **≥ 2 countries** *(the precision multiplier — catches
  Saint-Gobain, Air Liquide, Robert Bosch, Siemens Gamesa cross-border, rejects
  single-country generic forms)*.
- Anchor/group key = the bigram. Hard **size cap** (default 60); larger families
  are written to a review file, not auto-applied.

### Layer 2c — curated brand dictionary *(the tail rules can't infer)*
A hand-verified `brands.yaml`: `{ match patterns → canonical parent, country-agnostic }`
for high-value entities and the cases 2a/2b miss:
- single-country families (`Novo Nordisk *` → Novo Nordisk, all DK),
- cross-name sub-brands (`Gamesa Electric *` → Siemens Gamesa),
- the top recipients by euros (Siemens, Bosch, Airbus, Thales, Leonardo, …) so the
  names that move league tables are guaranteed correct.
Each entry is auditable and reviewed once; ~150 entries cover most of the money.

### Layer 3 — GLEIF LEI cross-name *(backlogged)*
Different-name parents (Google↔Alphabet). Low LEI coverage on this SME corpus; see
`plans/backlog/gleif_lei_cross_name_merge.md`.

## 5. The linchpin: a versioned multilingual stoplist

`ETL/lib/merge_stoplist.py` — the single highest-leverage asset. Tokens that
must never anchor a brand merge, grouped and sourced:
- **Legal forms** (all EU languages): gmbh, sa, srl, spa, oy, ab, as, bv, nv,
  sabiedriba/ierobezotu/atbildiba (LV), uzdaroji/akcine/bendrove (LT), spolka/zoo
  (PL), spol/sro (CZ), kft/zrt (HU)…
- **Org-type words:** societa, azienda, agricola, cooperativa, groupement,
  forestier, comunidad, propietarios, vereniging, eigenaars, chambre, syndicat,
  communaute, agglomeration, association, fondation/fundacion/fundacio, universita,
  ecole, institut(ul), vyzkumny/ustav, siec/badawcza, druzstvo, zemedelske, casa,
  cura, office, tourisme, parc/ferme/centrale + eolien(ne)/solaire …
- **Geographies & directions:** country names, regions, nord/sud/est/ouest, europe…
- **First names** (the LLM killer): josef, giuseppe, jean, maria, … (top EU given
  names) — so `Josef Müller` ≠ `Josef Schmidt`.

Built semi-automatically: rank tokens by document frequency, human-classify the
head (a few hundred tokens cover the long tail of generic phrases), version the
file. **This is where review effort should go** — it is reused by every layer.

## 6. Guardrails & acceptance gate

- **Precision eval** (`merge_companies.py --eval`): extend `TRUTH_SETS` with the
  patterns above (Novo Nordisk family merges; `casa cura`/`parc eolien`/`josef`
  non-merges; Siemens Gamesa cross-country). Report pairwise precision/recall/F1.
  **CI/Stop-hook gate: refuse to apply if precision < 0.98.**
- **Dry-run first:** every layer writes proposals to CSV; a trap-scan (largest
  groups, single-country families, generic-token anchors) runs before `--apply`.
- **Size cap + review queue** for oversized families.
- **No chaining** assertion: each company gets exactly one anchor per layer.

## 6b. Risk management — how we ensure (effectively) no false merges

Honest framing: entity resolution can never *prove* zero false merges. What we can
do is drive the false-merge rate to ~0, **bound it with a measured number**, make
every false merge **detectable, contained, and reversible**, and adopt a
**zero-tolerance set** of pairs that must never merge. Four layers of control —
*Prevent → Detect → Contain → Recover* — each independent, so a miss in one is
caught by another.

### Prevent (a false merge is never proposed)
- **Precision-first thresholds.** Every tunable (DF cap, min country span, stem
  length, size cap) defaults to the conservative end. When in doubt, do **not**
  merge — a missed merge costs a little fragmentation; a wrong one corrupts a
  ranking. Recall is sacrificed for precision on purpose.
- **Multi-signal corroboration for risky merges.** Single-country bigram merges
  (the weakest 2b case) require a **second independent signal** to be accepted —
  shared sector, a shared distinctive trigram, or presence in `brands.yaml`. One
  signal alone is never enough off the safe path (multi-country / suffix-code).
- **Stoplist + golden-negative-aware rules.** The multilingual stoplist (§5) plus
  the golden-negative set (below) are inputs to rule construction, not just tests:
  any anchor that would bridge a golden-negative pair is rejected at build time.

### Detect (a false merge is caught before it ships)
- **Golden-negative set — zero tolerance.** A maintained list of pairs/clusters of
  *genuinely distinct* companies that must NEVER share a `parent_group`: the traps
  (`casa cura`, `parc eolien`, `josef X`≠`josef Y`, the 7 unrelated biotechs,
  John Deere≠John Cockerill, `M-TRON`≠`M-Files`). **A run that merges any
  golden-negative pair fails hard — non-negotiable, no threshold.**
- **Precision eval gate.** `merge_companies.py --eval` scores pairwise
  precision/recall/F1 against `TRUTH_SETS` (positives + the negatives above).
  **Apply is blocked if precision < 0.99** (Stop-hook + CI). The bar is precision,
  not F1.
- **Sampling-based precision estimate.** After every dry run, randomly sample N
  (e.g. 200) newly-merged pairs into a review CSV for human spot-check; record the
  observed false rate + Wilson interval. Apply only if the upper bound clears the
  target. This catches systematic errors the fixed eval set can't anticipate.
- **Diff review, largest-first.** Each run emits a diff vs the current
  `parent_group` state (new groups, grown groups). The biggest new families are
  always eyeballed before apply — that is exactly where a bad rule shows up first.

### Contain (blast radius is bounded if one slips through)
- **Anchor, never chain** (§3) — structurally impossible to form the 23k-blob class
  of error; one bad edge stays local to its anchor.
- **Hard size cap** — no family above the cap auto-applies; it goes to the review
  queue. A misfiring rule can mangle at most `cap` rows, not the corpus.
- **Per-run volume guard.** If a run proposes >X% more merges than the last
  accepted run, it halts for review — a spike means a regression (a stoplist gap, a
  loosened threshold), not a discovery.
- **Invariant assertions (fail the run if violated):** euro/event totals are
  *identical* before vs after merge (merging must never move money); distinct
  company count only decreases; no group mixes more than K distinct distinctive-
  token-sets. These are cheap, absolute, and catch whole classes of bug.

### Recover (any false merge is cheap to undo)
- **Fully reversible & idempotent.** `parent_group` is a derived column recomputed
  from scratch each run; nothing is deleted, source rows and original names are
  untouched. Fix the rule/config and re-run — the bad merge simply disappears.
- **Provenance on every merge.** Persist *why* each company got its group
  (`merge_layer` + `merge_anchor`: the stripped stem / the bigram+countries / the
  `brands.yaml` key). Every merge is explainable and auditable in one query; no
  unexplained groupings.
- **Manual override lists, applied last.** `force_split` (deny) permanently vetoes
  a specific bad merge the rules get wrong; `force_merge` (allow) pins a known-good
  one. Human judgment always wins and persists across re-runs.

### The one number to report
Each run publishes: precision on the eval set, golden-negative violations (must be
0), sampled false-merge rate + interval, total merges, and the largest new group.
"No false merges" = **golden-negatives 0, eval precision ≥ 0.99, sampled upper
bound below target** — a defended, measured claim, re-checked on every future load.

## 7. Scalability — apply to all future companies automatically

The pipeline is a pure, deterministic function of the `companies` table, so:
- **One command, idempotent:** `merge_companies.py --build-parent-groups --apply`
  recomputes `parent_group` from scratch (Layer 1 → 2a → 2b → 2c). Safe to re-run
  any time; output depends only on data + versioned config.
- **Wire into the load path:** add it as the final step of the source-load workflow
  (after a new source loads), so newly-loaded companies merge on arrival. Add a
  post-load QA check that `parent_group` coverage didn't regress.
- **Config, not code, evolves:** new generic terms → stoplist; new must-merge
  multinationals → `brands.yaml`. No pipeline changes needed as the corpus grows.
- **Reproducible builds:** no LLM/API/network, no rate limits — runs in seconds,
  identical every time, so site rebuilds stay deterministic.

## 8. Build order

1. `ETL/lib/merge_stoplist.py` — seed from DF ranking + manual head-classify.
2. **Risk scaffolding first:** the `golden_negatives` set, the `merge_layer` +
   `merge_anchor` provenance columns, the `force_split`/`force_merge` override
   files, and the invariant + volume-guard asserts — so every later layer is built
   against the controls, not retrofitted.
3. Layer 2a (suffix/country-tag) + guards → measure, dry-run, trap-scan.
4. Extend `TRUTH_SETS` (positives + golden-negatives); stand up the precision-eval
   gate (block apply < 0.99) + the sampling-based precision estimate.
5. Layer 2b (multi-country distinctive bigram, single-country needs a 2nd signal)
   → dry-run, diff review, eval.
6. `config/brands.yaml` + Layer 2c loader → dry-run, eval.
7. Compose into `--build-parent-groups` (anchor-union of 1+2a+2b+2c, then apply
   overrides), apply.
8. Re-wire rollups (`COALESCE(parent_group, id)`) everywhere it matters
   (the `website/build/` builders — `synthesis.py`, `investor_insights.py`,
   `company_search.py`, `companies_index.py`), rebuild site, validate against the eval.
9. Integrate into the source-load workflow + post-load QA (incl. golden-negative +
   volume guards on every load); document in `methodology.md`.

## 9. Risks & mitigations

- **Stoplist gaps** → generic families leak in. *Mitigation:* multi-country
  requirement on 2b + size-cap review queue + precision gate catch most.
- **Brand dictionary staleness** → new multinationals unmerged. *Mitigation:* the
  review queue surfaces large single-country families as dictionary candidates.
- **Over-merge of genuine distinct firms sharing a rare bigram** → *Mitigation:*
  the ≥2-country requirement makes same-bigram-different-company collisions rare;
  the eval traps the known ones.
- **Recall ceiling:** single-country, single-token, or cross-name parents need
  2c/Layer 3. Accepted — precision is the priority.

## 10. Expected outcome

Deterministic, auditable rollup of the Novo Nordisk / Siemens Gamesa class across
the whole corpus and all future loads, at precision ≥ 0.98, with every merge
traceable to a stripped stem, a multi-country brand bigram, or a reviewed
dictionary entry — and zero dependence on a model that can hallucinate a 23k blob.
