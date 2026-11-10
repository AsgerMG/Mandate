# The Wincent bench

Talk to Wincent inside Claude Code, on the owner's plan: no Anthropic API credit, no
production writes. Phase 1 of `mandate/plans/master_plan.md` until the budget returns.
The tools are production's own handlers (`web/lib/mandate/agent/`), run read-only by
`web/scripts/brain_tool.ts`, so a fix found on the bench is a fix in production.

## Start a conversation

In Claude Code, in `~/Mandate`:

> ask the wincent agent: We are a fintech lender, EUR 40M raised, no banking licence.
> We want our SME loan book guaranteed in DE, FR, IT and at EU level. What are our routes?

Wincent reads the three playbooks, asks the structure and intent questions first, and
stops. Answer in the chat ("tell wincent: German GmbH, no licences, ..."); Wincent then
works the case and answers in the fixed shape (answer, where you stand, flags, decisions,
actions and drafts, plan, watches, precedents, sources, open questions). Every claim is
`[cN]` (grounding), `[wN]` (a web page fetched in the run) or labelled judgement /
unverified. A case from `mandate/eval/scenarios/` works too: "ask the wincent agent to
run the fintech_guarantees case".

## Save the run

Say "save the run". Wincent writes, under `mandate/eval/runs/bench/`:
- `<YYYY-MM-DD>_<case>.md`: the case, questions and answers, one line per tool call,
  the answer, sources, and the grading block below;
- `<YYYY-MM-DD>_<case>.profile.json` and `.ledger.json`: the profile used and every
  grounding citation (quote, URL, sha256, span), so each `[cN]` can be re-checked.

## Grade it

Fill the block at the end of the transcript and commit it:

```
## Grade (owner)
grade: 1-5        # 5 send as is, 4 light edits, 3 right idea / rework, 2 misses the point, 1 wrong
must/must_not:    # the scenario's checkpoints that failed, by number
edits: |          # your corrected text, or what you would have said instead
playbook: |       # the lesson, phrased as a rule for the playbook
```

The `playbook:` line is the point. Each one becomes an edit to
`mandate/playbooks/funding-routes.md` (or `wincent.md`), so the next run starts from it.
Grades across runs give the Phase 1 baseline (median grade, ask-first rate).
