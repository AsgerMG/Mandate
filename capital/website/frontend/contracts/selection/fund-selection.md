---
id: SELECT
stage: gate2.select
inputs: [founder_profile, candidate_subset]
output: five instrument indices
---

## Purpose

Gate 1 hands over a subset of ~40 funds that contains the right one about 80%
of the time. This prompt is gate 2: read that subset properly and choose the
five a founder should actually see.

It is a file, not a string in a script, because it is the thing most worth
iterating on and it needs to be diffable.

## What the model is given

Per candidate: name, administering body, channel, country, the instrument
profile (what it funds, sectors it has really backed, typical award), and up to
four verbatim `filter` gates in the fund's own words.

It is NEVER given award history, the answer, or anything identifying which fund
the company actually won.

## Rules

- SELECT-1 (hard) Return exactly five indices from the list, best first.
- SELECT-2 (hard) Never invent an index outside the list.
- SELECT-3 A fund whose stated requirements the founder plainly cannot meet is
  not a candidate, however well it matches thematically. A consortium
  requirement against a solo applicant is a dealbreaker, not a detail.
- SELECT-4 Prefer the fund whose OWN eligibility text matches this founder over
  one that is merely large, famous or generic. Size is not fit.
- SELECT-5 Spread across funding levels — EU, national, regional — where
  candidates are otherwise comparable. A founder with three routes at three
  levels has real alternatives; five variants of one scheme is one option shown
  five times.
- SELECT-6 Two funds from the same regime are allowed ONLY when both are
  genuinely and separately relevant. Do not fill slots with siblings.

## Measured

`scripts/measure_gate2.ts` against the committed gate-1 fixture. Baseline to
beat is the deterministic top-5 on the same companies.
