---
name: case-board
description: Draw the case board for a Mandate case (Wincent or Regina, bench). Use on every turn of a client conversation, before appending the mandate-board block, to pick and build the right visuals for the stage: a hierarchy when bodies sit under one another, a network when actors are tied across institutions, a process map with each step's eligibility gates when there is a procedure, plus routes, roadmap, stakeholders, funding stack and risks.
---

# Draw the case board

The founder sees the structure, not a wall of text. Before you append the
```` ```mandate-board ```` block at the END of your reply, run these steps.

1. **Read the format once per conversation:** `mandate/brains/CASE_BOARD.md`
   (vocabulary, the per-stage contents, a full example that parses).
2. **Set the stage:** `qualify`, `investigate`, `options`, `prioritise`, `advise` or
   `write_up`. Send only what is known or changed this turn; keep ids stable (the app
   merges by id).
3. **Decide what to draw.** Scan what you are about to say:
   - Three or more bodies in a chain of command or of money (a ministry, its
     promotional bank, the bank's programmes; federal and regional institutes; one
     institution's divisions)? Call the `institution_tree` tool first (it holds the official org
     charts), then draw a **`hierarchies`** entry: nodes with `parent`,
     `kind`, a door `status` where it is a door for this client, a `note` on what it
     does for them, `cite` on every node.
   - Three or more actors tied across institutions (who leads a ministry, who sits on
     a bank's board, which committee oversees it, who is in parliament and on the
     board)? Call the `network` tool (cited ties and the people who bridge institutions) and the
     `stakeholders` tool for the people (from the official org charts, dated),
     then draw a **`networks`** entry: nodes (`person` for a public role; name a
     person only where the role-holder is published, else the role) and ties
     (`leads`, `sits_on`, `oversees`, `funds`, `member_of`, `reports_to`,
     `works_with`, `advises`), every tie cited.
   - A procedure of three or more steps (an application, a credit decision, a
     legislative file)? Call the `processes` tool first (official procedure pages, steps with gates), then draw a **`process_maps`** entry, and give EVERY step its
     **`gates`**: what must be true to pass it (eligibility, documents, timing), each
     cited. Add `leverage` where pushing helps.
   - Then the standing sections for the stage: `routes` (every door with status),
     `answer` (from prioritise on), `stakeholders` (P1 and P2 by name, cited and dated, where the tool returns a holder; else by function), `roadmap`
     with a `watch` track, `funding_stack` (which cost each money carries),
     `risks_flags`.
   Test: if your prose needs "under", "through", "reports to", "sits on", "then" or
   "before" more than twice to explain something, it belongs on the board instead.
4. **Check before sending:** valid JSON; every item has `cite` (ids, or "judgement" /
   "unverified"); no guessed names or e-mail addresses; the prose does not repeat what
   the board shows.
