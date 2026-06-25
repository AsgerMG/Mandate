# Agent architecture

> Status: **design — nothing built yet.** This document specifies the Claude Code
> harness (agents, skills, commands, hooks) we intend to add to EuroInvTracker.
> Review and amend before any file under `.claude/agents/`, `.claude/skills/`, or
> `.claude/commands/` is created.

Date: 2026-06-15 · Owner: Asger

---

## 1. Why this exists

The project produces three kinds of artifact every sprint: **data loads**,
**analysis findings**, and **site pages/sub-sites**. Each is governed by rules
that today live in our heads, in `docs/methodology.md`, `docs/decision_log.md`,
and the auto-memory index. Every new session re-derives them; every hand-off
risks dropping one (a missing coverage indicator, an unsourced number, a
SATR-overlap double-count).

The goal is **not** "use every Claude feature." It is to move the rules we
already wrote into machinery that enforces them, and to put two reader-audiences
in the loop *before* something ships rather than after.

### Design principles

1. **Few agents, rich briefs.** A subagent starts cold and re-derives context.
   Value lives in a sharp, self-contained brief that points at our canonical
   docs — not in the number of agents. Split an agent only when its brief is
   genuinely overloaded.
2. **Deliberate triggers, not blanket automation.** Spawning review agents is
   the expensive path. The audience-review loop is a **manual** `/ship-review`
   run at milestones. Hooks are reserved for *cheap, deterministic gates*
   (freshness, missing files), never for spawning judgment agents.
3. **Skills for procedures, agents for judgment.** If a task is a checklist with
   a right answer, it's a skill. If it requires reading like a person and
   forming an opinion, it's an agent.
4. **Every artifact traces to a rule.** Agents cite `methodology.md` /
   `decision_log.md` sections by name so their feedback is auditable, not vibes.

---

## 2. The two audiences (the golden standard)

Every reader-facing artifact is judged against exactly these two readers. They
are the spec for `investor-lens` and `founder-lens`.

### A. The investor (golden-standard audience)
VC / growth-equity / PE / corporate-development professional. Reads to make or
inform a capital decision. What they want:
- **Signal over trivia.** Does this tell me something I can act on or didn't
  already know from public sources?
- **Credibility.** Is every number sourced and reconcilable? Does it respect the
  four headline limitations (floors not totals, coverage-tier caveats, mixed
  amount bases, equity invisibility)?
- **Decision relevance.** Momentum, conviction, co-investor behaviour, cap-table
  signal, mortality — the framings in the v2 investor brief.
- The kill test: *would I forward this to a partner without a caveat?*

### B. The founder (company seeking EU funding)
Operator/founder/grants lead at a European company looking for non-dilutive or
public capital. What they want:
- **Findability.** Can they locate their instrument by sector, stage, country?
- **Actionability.** Eligibility, ticket size, who distributes it, deadline /
  cadence, and a concrete next step.
- **Honesty about gaps.** If we can't see an instrument (Art. 107-conform
  equity, tax credits, structural funds), say so rather than imply absence.
- The kill test: *could a founder read this and know their next move?*

---

## 3. Agent roster

Location: `.claude/agents/<name>.md` (frontmatter: `name`, `description`,
`tools`, `model`). Start with **five**, not eight.

### Layer A — audience lenses (judgment)

| Agent | Reads as | Core tests | Tools |
|---|---|---|---|
| `investor-lens` | VC/PE/corp-dev partner | signal vs. trivia · every number sourced · respects the 4 limitations · "forward to a partner?" | read-only (Read, Grep, Glob, Bash for queries) |
| `founder-lens` | founder/grants lead | findable · actionable · honest about invisible channels · "knows their next move?" | read-only |

Both are **read-only reviewers**. They take a target (a page, a finding, a JSON
dataset, a diff) and return: verdict (ship / fix / cut), the 3–5 highest-value
changes, and any number they could not trace to a source. They must cite the
methodology section behind each objection.

### Layer B — technical pods

These three are the "keep the data strong, make the picture more accurate" pod.
`source-scout` widens coverage; `load-auditor` defends integrity; `stat-verifier`
defends every number that ships.

| Agent | Domain | Responsibility |
|---|---|---|
| `source-scout` | **source discovery** | A *standing, gap-driven* mission, not a passive validator. Reads `coverage_indicator.json` tiers + the "Coverage gaps" / "What we cannot see" sections of `methodology.md`, identifies where the corpus is weakest (thin/EU-layer-only countries, under-covered instruments, the Art. 107-invisible channels), and hunts candidate registers/sources to close those gaps. For each candidate: passes the **SATR-overlap gate**? is it direct-funding (Scope Option A)? what tier-lift does it give? → recommend extract / skip / defer with the gap it closes. Can be run ad hoc *or* on a `/schedule` sweep (§5). |
| `load-auditor` | data integrity | post-load: orphan rows, NULL timestamps, dedup pairs, `europe_scope` trigger violations, and **registration completeness** — `views.sql` + coverage indicator + `classify.py` *and* `methodology.md` "Source coverage" all updated for the new source (see §6 methodology gate). |
| `stat-verifier` | number integrity | every published number traces to a runnable query against `db.sqlite`; flags cross-family sums, per-capita-without-tier artifacts, ceiling-vs-disbursement mixing. |

**No methodology agent.** Methodology consistency is not delegated to an agent —
it is enforced as a *documentation gate* baked into the workflow: a required
step in `ship-a-source` (§4), a `load-auditor` check, and a staleness hook (§6).
The sector-vocab/limitations-tier consistency checks fold into `stat-verifier`
and the lenses. This keeps the roster at five and makes "methodology is always
updated" a gate the pipeline cannot skip, rather than someone's job to remember.

---

## 4. Skills (deterministic procedures)

Location: `.claude/skills/<name>/SKILL.md`.

### `ship-a-source`
The full add-a-source checklist, in dependency order, derived from the
established rule "new source → views.sql + coverage indicator + classify.py":
1. SATR-overlap gate (measure collision before loading).
2. Extract via `ETL/extract/extract_<x>.py`, country via
   `europe_scope.canonicalise_country()`.
3. Load; confirm `BEFORE INSERT` scope trigger passes.
4. Register in `analysis/views.sql`.
5. Add/refresh coverage indicator (`gen_coverage_indicator.py`).
6. Extend `classify.py` if new sector/instrument vocab appears.
7. Run `load-auditor`.
8. **Methodology gate (mandatory, cannot skip):** update `docs/methodology.md`
   — "Source coverage" entry, any new amount-basis caveat in the limitations
   tiers, and the decision-log entry — plus the memory index. `load-auditor`
   fails the load if a new `source` value exists in `db.sqlite` with no
   matching `methodology.md` mention.

### `publish-finding`
Analysis → investor-grade finding: state the claim, attach the exact query,
apply the relevant limitation caveat, run `stat-verifier`, then `investor-lens`.

(Site-build is already a script — `build_site_data.py` with its `STEPS` and
`--check` freshness gate — so it does **not** need a skill; it needs the hook in
§6 and the command in §5.)

---

## 5. Commands

Location: `.claude/commands/<name>.md`.

### `/ship-review [target]`
The audience-review loop, **manual trigger** (chosen 2026-06-15). Fans out
`investor-lens` + `founder-lens` in parallel over the target (defaults to the
current diff). Returns a merged report: per-lens verdict, the union of
high-value fixes, and any untraceable number flagged by either. Run it when an
artifact is actually done — at the milestone, not every turn.

### Optional: scheduled source sweep (`/schedule`)
`source-scout` can run as a periodic cloud agent that re-reads the coverage
tiers + gap analysis and reports the highest-value sources to add next. Off by
default; enable once the manual flow is proven. This is how "always be improving
the accuracy of the picture" becomes continuous rather than sprint-bound.

---

## 6. Hooks (cheap deterministic gates only)

Location: `.claude/settings.json` → `hooks`. **No agent-spawning in hooks.**

| Event | Gate | Action |
|---|---|---|
| `PostToolUse` (Edit/Write on `site/public/data/*.json`) | data edited by hand without a rebuild | warn: "edited generated data — `build_site_data.py` is the source of truth (writer map in GENERATED)" |
| `Stop` | site data stale vs. `db.sqlite` | run `python3 scripts/build_site_data.py --check`; surface its stale-file report |
| `Stop` | **methodology gate** — a `source` value in `db.sqlite` with no mention in `docs/methodology.md` | warn: "new source loaded but methodology.md not updated — see ship-a-source step 8" |

These mirror checks the codebase already has (`GENERATED` map + `check_fresh()`),
just promoted to automatic. Everything requiring judgment stays in `/ship-review`.

---

## 7. File layout

```
.claude/
  agents/
    investor-lens.md
    founder-lens.md
    source-scout.md
    load-auditor.md
    stat-verifier.md
  skills/
    ship-a-source/SKILL.md
    publish-finding/SKILL.md
  commands/
    ship-review.md
  settings.json          # + hooks block (§6)
docs/
  agent_architecture.md  # this file
```

---

## 8. Build order

1. **This doc, reviewed.** ← we are here.
2. `investor-lens` + `founder-lens` + `/ship-review` — the loop you most wanted.
3. `stat-verifier` + `publish-finding` — analysis quality.
4. `source-scout` + `load-auditor` + `ship-a-source` — collection discipline.
5. Hooks (§6) — once the manual flow is proven.

Each phase is independently useful; stop after any of them.

---

## 9. Anti-patterns (things we are deliberately *not* doing)

- **Auto-firing review agents on every `Stop`.** Expensive, noisy, trains us to
  ignore them. Graduate a specific check to a hook only after it earns it.
- **A swarm of micro-agents.** Cold-start cost + overlap. Five rich agents beat
  eight thin ones.
- **Skills that duplicate existing scripts.** `build_site_data.py` already
  orchestrates the build; we wrap it, not reimplement it.
- **Agents that assert numbers from memory.** Every figure must come from a
  query against `db.sqlite` at review time.

---

## 10. The continuous-improvement engine (frontier loop)

The goal: the site **improves itself** toward being the authoritative picture of
public capital in Europe — for buy-side and sell-side investors and for startups,
scaleups, and incumbents — while a human stays in the merge seat. This is a
"Ralph" loop (after ralphify): a fixed prompt run repeatedly with **fresh context
each iteration**, committing incremental, verified progress to git.

### The closed loop
```
   source-scout / lenses ─┐                 (discovery refills the queue)
                          ▼
            plans/improvement_backlog.md  ── ranked, audience-tagged tasks
                          │  top item
                          ▼
        ┌─────────────────────────────────────────┐
        │  ONE iteration (RALPH.md, fresh context) │
        │   pick → do (via skill) → VERIFY (gates) │
        │   → commit on branch  OR  revert + flag  │
        └─────────────────────────────────────────┘
                          │ commits
                          ▼
                improve/<date> branch ──► human reviews ──► PR ──► main
```

### Pieces
- **`plans/improvement_backlog.md`** — the ranked queue. P0 correctness, P1
  journeys, P2 coverage. Tagged by audience (`buy`/`sell`/`startup`/`scaleup`/
  `incumbent`) and type (`data`/`analysis`/`narrative`/`hygiene`). Seeded from the
  first `/ship-review` smoke test. `source-scout` refills the P2 section.
- **`RALPH.md`** — the one-iteration prompt (ralphify-compatible frontmatter +
  body). Picks one item, does it via the right skill, runs every gate
  (stat-verifier / load-auditor / both lenses / freshness / stop-gate), then
  commits or reverts.
- **`scripts/improve_loop.sh`** — self-contained runner (no ralphify needed).
  Injects live repo state into each fresh context and bounds the run by an
  iteration count.

### Guardrails (autonomy = PR-only, human merges — chosen 2026-06-15)
- **Never on main, never pushes, never merges.** The runner refuses a dirty tree,
  forces an `improve/*` branch, and stops if an iteration leaves the tree dirty.
  The agent's job ends at a local commit; a human opens and merges the PR.
- **Gates are mandatory.** No number ships unless reproduced from `db.sqlite`; no
  load ships without load-auditor + the methodology gate; no page ships without
  surviving both lenses. Fail → revert, don't compound.
- **Atomic.** One backlog item per iteration; small and verified beats big and
  unchecked. The iteration count is the cost ceiling.
- **Never** touches the europe-scope destructive trigger or hand-edits generated
  data.

### Rollout (earn autonomy in stages)
1. **Supervised** — `scripts/improve_loop.sh 1` watched live (the dry run).
2. **Bounded** — `scripts/improve_loop.sh 3-5` on a branch; review the PR.
3. **Scheduled discovery** — `source-scout` as a `/schedule` routine that only
   refills the backlog (and optionally opens a draft PR); execution stays
   human-triggered until trust is established.

The engine never expands its own autonomy — that is a human decision, recorded in
the decision log.
