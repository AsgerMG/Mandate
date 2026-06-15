---
description: Dual-audience review of a shipped artifact — fans out investor-lens + founder-lens (and stat-verifier for numbers) in parallel and merges their verdicts.
argument-hint: "[target — a page path, finding, dataset, or omit for the current diff]"
---

Run the audience-review loop on: **$ARGUMENTS**

If no target is given, review the current working-tree diff (`git diff` +
untracked files under `site/` and `docs/`).

Do this:
1. Identify the target artifact and read it.
2. Launch these subagents **in parallel** (one message, multiple Agent calls):
   - `investor-lens` — the golden-standard investor read.
   - `founder-lens` — the company-seeking-funding read.
   - If the target contains any quantitative claims, also launch `stat-verifier`.
   Give each agent the concrete target path(s) and the relevant
   `docs/methodology.md` / `docs/decision_log.md` context so it doesn't cold-start
   blind.
3. Merge their reports into one decision:
   - **Combined verdict:** SHIP / FIX / CUT (the strictest of the three wins).
   - **Must-fix before ship:** the union of ship-blockers, de-duplicated and
     ranked by impact. Label each with the lens that raised it.
   - **Untraceable / unsourced numbers:** anything stat-verifier or investor-lens
     could not reproduce.
   - **Nice-to-have:** lower-priority improvements.
4. Do NOT edit anything. This command reviews; the human decides what to apply.

Keep the merged report tight — a decision-maker should read it in under a minute.
