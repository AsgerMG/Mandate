# Agentic architecture — fleet of looping agents (TODO / design)

Status: **planning**. Captured 2026-06-15 at user direction ("we want to build
agentic intelligence at scale here — not just fiddling with one agent"). Not yet
built. The Haiku classifier (`scripts/classify_llm.py`) is the first concrete
LLM-in-the-loop step; this doc is the larger vision it slots into.

## Goal

Move from **one** continuous-improvement loop (`scripts/improve_loop.sh`, RALPH.md)
to a **fleet** of specialised agents looping in parallel, each owning a workstream,
coordinated through the shared backlog and the integrity gates — with a way to see
what is running at any moment.

## Workstreams (one looping agent each)

| Agent | Owns | Reads | Writes |
|---|---|---|---|
| `data-ingest` | new sources, re-pulls, freshness | gap_analysis, coverage tiers | extractors, loads (SATR-gate first) |
| `enrichment` | classification, dedup, entity typing | classify.py, audit findings | classify.py, migrations, llm tables |
| `refactor` | perf, dead code, test coverage | whole tree | scripts/, lib/ |
| `site` | UX, page copy, accessibility, build perf | site/ | site/app, components |
| `integrity` | gates: stat-verifier, load-auditor, scope | db.sqlite, methodology | findings, blocks merges |

Each runs the RALPH single-item loop but scoped to its workstream's backlog section.

## Hard constraints (carry over from RALPH)

- Each agent on its own `improve/<workstream>-<date>` branch, ideally its own git
  **worktree** (`EnterWorktree` / `git worktree`) so parallel agents never collide.
- Never commit to `main`; never push; never open/merge a PR. A human merges.
- One atomic, verified item per iteration. Gates must pass before commit.
- Shared backlog needs **per-item locking** (an agent claims an item before working
  it) so two agents don't grab the same item. Add a `claimed_by`/`claimed_at` field.

## Open design decisions (TODO)

- [ ] **Orchestration substrate.** Options to evaluate:
  - Local: N× `improve_loop.sh` in parallel worktrees, each a `claude -p` loop.
    Cheapest, no new infra; quota is the bottleneck (today's loop hit the cap).
  - Cloud: **Managed Agents (CMA)** — Anthropic runs the loop + sandbox per session,
    persisted/versioned agent configs, SSE event stream, GitHub repo mount, Outcomes
    (rubric-graded iterate loops). Best fit for "several great agents looping at the
    same time" without burning the local quota. See the claude-api skill
    (`shared/managed-agents-*`). Needs an API key + budget.
  - Hybrid: local for cheap/fast workstreams, CMA for long-horizon ones.
- [ ] **Coordination.** Shared backlog with locking vs. a coordinator agent
  (CMA `multiagent: {type: "coordinator"}`) that delegates to sub-agents.
- [ ] **Merge policy.** Who merges the N branches, in what order, with what conflict
  policy. Probably a human-reviewed `babysit-prs`-style queue.
- [ ] **Budget guardrails.** Per-agent token/$ ceilings (CMA Task Budgets); stop on
  cap rather than spin.
- [ ] **Cost model.** Local loop = Claude Code quota. CMA = API spend; estimate per
  workstream before turning it on.

## Observability — "which agents are running right now?"

Build `scripts/agents/fleet_status.sh` (TODO) that shows, in one view:
- local loops: running `claude -p --dangerously-skip-permissions` PIDs + their branch/worktree;
- git worktrees and each one's branch + last commit + dirty state;
- recent commits per `improve/*` branch (who did what, when);
- if CMA is used: `client.beta.sessions.list()` → id / title / status / usage
  (or `ant beta:sessions list --transform '{id,title,status}'`).
- tail of `plans/loop_log.md` for the human-readable trail.

Frontier tooling to wire in:
- Claude Code **background tasks** + `/bashes` to see running shells.
- CMA **webhooks** (`session.status_idled`, `session.status_terminated`) → a status
  file or Slack ping, so the fleet reports in rather than being polled.
- CMA **Console** session UI for live watching.

## First steps when we build this (ordered)

1. `scripts/agents/fleet_status.sh` — observability first, so we can watch the fleet.
2. Backlog item-locking (`claimed_by`/`claimed_at`) + a `--workstream` filter on the loop.
3. Parallel worktree runner: `scripts/agents/run_fleet.sh <workstreams...>`.
4. Spike one CMA agent (the `data-ingest` workstream) end-to-end; compare cost/quality
   to the local loop.
5. Decide local vs CMA vs hybrid per workstream; document in this file.

## Related

- Current single-loop spec: `RALPH.md`; harness doc: `docs/agent_architecture.md`.
- First LLM-in-loop step: `scripts/classify_llm.py` (Haiku sector classification).
- House rules the fleet must honour: methodology.md "Known limitations", the
  SATR-overlap gate, no em-dashes in reader-facing copy.
