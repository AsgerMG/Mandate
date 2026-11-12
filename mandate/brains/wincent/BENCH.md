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

## Or in the bench app (local)

```
cd ~/Mandate/web && MANDATE_BENCH_LOCAL=1 npm run dev     # then open http://localhost:3000/bench
```

Wincent, Regina and the interviewer, in an app: every turn runs `claude -p --agent <name>`
(resumed per turn) on your plan, with the API key stripped from its environment, so it
costs no API credit (`web/lib/bench/turns.ts`). The page and every `/api/bench/*` route
exist only in development with `MANDATE_BENCH_LOCAL=1`, and only answer localhost
(`web/lib/bench/guard.ts`).

- **Mandates and recent cases.** Conversations and mandates (client, brief, markets,
  status, a short profile the brains read before the first message) are saved
  automatically as JSON in `~/Mandate-backups/bench/` (outside the repo: client details).
  A turn belongs to the server: reload the page and it re-attaches; Stop kills the claude
  process group; a failed turn has Retry.
- **Speech.** Hold the mic (or Space in an empty box), or click to start and click to
  stop. Transcribed on this Mac by whisper.cpp; the clip is deleted afterwards. One-time
  setup: `brew install whisper-cpp ffmpeg`, and the model (574 MB) at
  `~/Mandate-backups/whisper/ggml-large-v3-turbo-q5_0.bin` from
  huggingface.co/ggerganov/whisper.cpp. Without it the browser's recognizer is used.
- **Train.** Interviews (`.claude/agents/interviewer.md` runs a guide from
  `mandate/playbooks/interviews/`; Finish & distil proposes playbook edits and eval cases
  as diffs you accept), Grade runs (writes the grading block below), Playbooks, Progress.
  Accepted files are written, never committed.

"Save the run" asks the brain to save as below; the app copies the scratch ledger next
to the transcript.

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
