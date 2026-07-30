---
id: FUND
stage: brief.funds
schema_fields: [institutionNotes]
evidence: [institutions, processes, eligibilityScreen, projectAnswers]
---

## Purpose

The five doors worth walking through, and the first step at each. This section
IS the eligibility statement: a fund appears here because the founder can go
after it, so nothing else in the brief needs to argue that case separately.

## What this section does not decide

**Which funds appear is not the writer's decision.** They are selected by a
deterministic fit score, ranked upstream, and handed over already cut. Write
about the rows given: do not add one, do not argue against one, and do not
describe them as ranked relative to each other.

  **evidence:** while the writer held a disqualification flag, a fund whose own
  eligibility screen showed its gates as met was deleted from a brief, and the
  reader saw both facts on one page. A later run rejected five of seven
  candidates and shipped a two-row brief. The flag needed roughly forty lines
  of prompt guardrail, which is what a wrong mechanism looks like.

If a row is genuinely wrong for this company, that is a scoring failure worth
reporting, not prose to publish. Say what the row is and let it stand.

## Rules

- FUND-1 (hard) At least one row publishes. An empty table is never the answer
  while any door is open.
- FUND-2 (hard) At most five rows.
- FUND-3 (hard) No two rows resolve to the same institution under the same
  legal basis. One route shown twice spends a scarce row on nothing.
- FUND-4 (hard) `nextStep` is an action the founder can start. Never
  "monitor", "revisit", "deprioritise", "treat as informational" or any other
  instruction to wait.
- FUND-5 (hard) `whyEligible` and `nextStep` are always written. The fallback
  text the pipeline substitutes when they are missing is a defect, not a
  default.
- FUND-6 (hard) A row's own explanation may never argue against the row. If
  the honest `whyEligible` would say the fund targets something this company
  is not, that is a scoring failure to report, not prose to publish.
- FUND-7 (hard) The institution named must be a body a founder can approach. A
  government department administers schemes; it is not itself a door.
- FUND-8 (judged) `whyEligible`, at most 25 words, is specific to this company
  and grounded in the eligibility screen and its answers. Where a project
  answer bears on this fund, use it: name the requirement and how this company
  sits against it, rather than describing the fund generically.
- FUND-9 (judged) `nextStep`, at most 15 words, is one concrete action drawn
  from the process briefs.
- FUND-10 (judged) Where a row carries a single obstacle, `blockerPlain`
  restates that rule in one plain sentence naming the real threshold, with the
  statute language dropped. Where there is no obstacle it is an empty string.
  `nextStep` then becomes the action that clears the obstacle.
- FUND-11 (judged) A row with no award recorded for over three years is dormant,
  not closed — we cannot tell which. Never promise it an upcoming call. Say it
  has been dormant since the year given, and make the next step confirming it
  still runs.
- FUND-12 (soft) Rows are not ranked in the brief and must not be described as
  first, best or strongest relative to each other. The bottom line names the
  first move; the table presents five open doors.

## Banned

- FUND-B1 Restating support type, ticket size or comparable firms in prose —
  they already render in the table.
- FUND-B2 Writing that the founder qualifies, or might not qualify, or should
  check whether they are eligible. Every published row has been screened; the
  defensible claim is that nothing documented rules them out.

## Worked example

### Pass

> whyEligible: Your stated project cost sits inside this scheme's €1-5M band,
> and your national registration meets its establishment rule.
> nextStep: Open a dossier with the regional office for the next wave.

### Fail — breaks FUND-6 and FUND-B2

> whyEligible: This programme targets industrial value chains rather than
> software companies like yours, so check carefully whether you qualify.

A row arguing against itself, and asking the reader to do the screening the
product exists to do.
