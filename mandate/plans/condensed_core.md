# The condensed core: what a senior has on file, per market (pilot: Germany)

## Context
Five consultation-arc conversations with the database (18 Nov) graded 2, 4, 4, 3, 3. The weakest
check across all five is **grounding** (weight 5.5): the plan rests on figures Wincent fetched live
and could not confirm (agritech's loan terms, cleantech's aid intensities, fintech's Bpifrance
mechanics). Two of the three must_not hits are exactly that. The owner (18 Nov): build a super
condensed database with what is typically needed to get 80% of the way (structures, hierarchies,
updated stakeholder lists); internet search only for easy lookups and freshness. Inventory (read-only,
18 Nov) shows the deciding core is largely MISSING: grounding holds no GBER (651/2014), no regional aid
map, no de minimis rule; KfW 5 documents, Bpifrance 4, EIF 5, LfA / Bürgschaftsbanken /
gesetze-im-internet 0; there is no institution-hierarchy table and no stakeholder register (policy.actors
has 526 actors from debates). Italy and EIFO/InvestEU have small cores already (load_batch_italy.py,
load_batch_eifo_investeu.py: 36 status rules, 44 region priorities, 60 intermediaries).
This stays "a brain, not an encyclopedia": one fixed template per market, the few things that decide
most cases; the long tail stays live research.

## The template (per market; the same five parts everywhere)
1. **Institution hierarchy**: ministry -> promotional bank / agency -> division -> programme ->
   channel (house bank, regional institute, guarantee bank), each node with its URL and citation.
   New table `capital.institutions` (id, parent_id, kind, country, level, name, role, url, source
   citation, last_verified). Feeds the board's `hierarchies` directly.
2. **Deciding rules**, held as documents in grounding plus a small structured table
   `capital.rule_facts` (rule, jurisdiction, region class, value, unit, valid_from/to, citation):
   GBER 651/2014 (consolidated; intensities, incentive effect, cumulation, SME and undertaking in
   difficulty definitions), the member state's approved regional aid map, de minimis 2023/2831, the
   SME recommendation 2003/361. EU-wide documents are loaded once.
3. **Main programme terms**: the few flagship products per institution (rate basis, ceiling, channel,
   who applies, deadline), into the existing `capital.funding_instruments` / gates with citations,
   refreshed weekly by the existing refresh.
4. **Stakeholders**: by function (unit, role) plus the role-holder's name only where the institution
   publishes it, with url and last_verified. New `mandate.stakeholders` (the actors register the
   master plan designed; public professional roles only). Feeds the board's `networks` and
   stakeholders.
5. **Precedents**: the published deal lists (EIF transaction list, institution press lists), small.

## Reuse
- The batch pattern of `capital/ETL/terms/load_batch_italy.py`: pinned `sources.json`, grounding via
  `mandate/grounding/store.py` (`store_original`, `fill_text`, `add_passages`, `locate`), dry run
  against production that rolls back, refuses on drift, idempotent. One `load_batch_<market>.py` per
  market, sources in `capital/reference/batch_<market>/`.
- Brain tools in `web/scripts/brain_tool.ts` / `web/lib/mandate/agent/`: add `institution_tree`
  {country, institution?}, `rule` {rule, jurisdiction, region?}, `stakeholders` {institution |
  topic}; `find_instruments` and `match_status` already read the instrument and status tables.
- The data-gap miner (`mandate/eval/data_gaps.py`, now reading the arc runs) re-ranks after each
  market so the next one earns its place.

## Steps
0. **Exposure check (free)**: list what the brain tools can and cannot read today; any held data no
   tool exposes is wired first (the dead-route pattern).
1. **Germany pilot**: hierarchy (BMWE/BMF -> KfW -> SME, innovation and start-up programmes ->
   Hausbank; Länder: LfA, NRW.BANK, SAB, ILB ...; Bürgschaftsbanken; GRW via the Länder), GBER +
   the German regional aid map + de minimis, ~10 flagship programme terms, stakeholders by function
   for KfW / LfA / BMWE units, KfW + EIF precedents. Owner sees a dry run (counts, sample rows,
   every citation) before anything is written.
2. **Measure**: re-run the two Germany-heavy conversations (forklift, cleantech) on the subscription
   and compare with arc1: database vs web citations, ungrounded facts, the grounding check, grade.
   Keep the template only if grounding improves and nothing regresses.
3. **Then** France, Italy (extend the existing core), EU level, UK; then the hubs; each re-ranked
   by the miner first.

## Cost and permissions
- No language-model API credits: building runs on the owner's Claude subscription (Claude Code);
  Voyage embeddings for the new passages (approved by the owner, 18 Nov).
- Production writes only by the load script, after the owner approves its dry run (AskUserQuestion).

## Verification
- Free: dry run against production (rolls back), schema tests, tool tests (each new tool returns
  cited rows; a tool with no data says so), a board fixture built from `institution_tree`.
- Plan usage (~$25 each): forklift and cleantech re-run as arc conversations; the health line must
  show more database citations and fewer unverified figures; grade compared with arc1.
