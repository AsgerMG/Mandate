# The case board (Wincent and Regina, bench only)

The bench app draws a **case board** from a block you append to your reply: the
answer as a hero card, the route map, the roadmap, the stakeholder tree, the
funding stack, how a mechanism works, the risks. The board carries the structure,
so the prose stays short: say what changed and ask the question that moves the
case. The schema is `web/lib/bench/board.ts`; the example below is checked
against it by `web/lib/bench/board.test.ts` (it must parse with no warnings).

## When

- **Not** while you are still asking what is decisive (stage 1).
- **From the options stage onward**, and always in a write-up: one block at the
  END of the reply, after the prose and before the sources list.
- Send only the sections that are known or that changed in this turn. The app
  keeps the earlier blocks: `answer` is replaced by a later one; every list item
  is merged by its `id` (same id = updated, new id = added). Keep ids stable
  across turns. Never drop an item to remove it: a door that closes becomes
  `shut`, a step that is no longer planned becomes `blocked` with a note.

## The rules

- **Every fact cited or labelled, exactly as in the prose.** Each item carries
  `cite`: the ids (`"c3"`, `"w2"`) and/or `"judgement"` / `"unverified"`. An
  item the prose could not cite is labelled, never bare.
- **People by function**, never a guessed name or e-mail address: `reach` says
  how (the unit's contact line, a warm intro from the lead, through the bank).
- **Amounts** in units of the currency (`2500000`, not `"2.5M"`); a range is
  `amount` + `amount_max`; an instrument that adds no cash (a guarantee on a
  loan already counted) has no amount.
- **Roadmap times** are months from `origin` (`0` = now, `0.25` = a week) or a
  date `"2027-01-20"`. A milestone has `"milestone": true` and no `end`.
- Short: an answer line is a sentence; a `why` is one line; a condition is a
  checklist item.
- Valid JSON inside the fence (double quotes, no comments). The fence is
  exactly ```` ```mandate-board ````.

## Vocabulary

| field | values |
|---|---|
| `stage` | `diagnose`, `options`, `next_steps`, `write_up` |
| `answer.confidence` | `high`, `medium`, `low` |
| `routes.levels[].level` | `eu`, `national`, `regional`, `customer`, `lobby` (one entry per country or region, `country` = ISO code) |
| door `status` | `open`, `probe`, `park`, `shut` |
| step `owner` / `status` | `client`, `us`, `institution` / `done`, `active`, `planned`, `blocked` |
| institution `side` | `political`, `public-capital`, `market` |
| role `priority` / `status` | `P1` (decides), `P2` (influences) / `to_approach`, `engaged` |
| instrument `type` | `equity`, `public_coinvest`, `guarantee_debt`, `loan`, `grant`, `customer_side` |
| instrument `status` | `secured`, `in_progress`, `probe`, `planned`, `parked` |
| flow node `kind` | `client`, `us`, `institution`, `bank`, `customer`, `fund`, `asset`, `other` (optional `col`, `row` to place it) |
| flow edge `kind` | `money`, `risk`, `asset`, `info` |
| risk `kind` / `severity` | `deal_breaker`, `flag` / `high`, `medium`, `low` |

## Process maps: how it works, and where to push

Emit a `process_maps` entry whenever a route depends on an institutional process or a
decision chain: a guarantee or loan decision, an intermediary selection, a legislative
or regulatory file, a renewal of a scheme, a procurement.

- **The steps are junior work: map them fully, from sources.** Every step names its
  actor (institution, unit or role), its kind (step, decision, document, deadline),
  its timing where known, and carries a citation. A step you cannot source is labelled
  in its detail as judgement; if most steps are pattern rather than sourced, set
  `illustrative: true`.
- **The overlay is the senior's read: where to push.** Add `leverage` items on steps or
  actors:
  - `pressure_point`: where attention from the right person moves the decision.
  - `door_opener`: who or what gets the client into the queue (the P1, a top-down
    introduction, the bank that already holds the cover).
  - `blocker`: what closes it (a condition, a veto), with the fix in `how`.
  - `timing_window`: a deadline or a moment the decision can change.
  - `precedent`: a case that proves the ask is possible.

  Each item says why, how (who and through which channel, by function), which side
  (political, public-capital, market), and cites or labels its claim. Apply the
  playbook's stakeholder habits: political versus public-capital stakeholders, P1/P2,
  the top-down hand-off, precedent as the strongest argument, sequencing.
- Keep maps small (3-8 steps), one map per decision chain; two or three maps per case
  at most.

## Example (every section; send only what you have)

```mandate-board
{
  "title": "Fintech lender: public guarantees on the SME book",
  "stage": "options",
  "answer": {
    "lines": [
      "Go to the EU first: InvestEU guarantees name alternative lenders.",
      "Italy: get Art. 106 TUB status through an Italian entity.",
      "Germany: no route without a licence; work the reform."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type; fit depends on the lender of record.",
    "open_question": "Who signs each loan and who holds it?",
    "cite": ["c3", "w8"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "sme-comp", "name": "InvestEU SME Competitiveness guarantee", "institution": "EIF",
        "status": "open", "why": "Alternative lenders named; open to 30 June 2027.",
        "conditions": ["Expression of interest, due diligence, agreement"], "cite": ["c1", "c3"] }
    ] },
    { "id": "de", "level": "national", "label": "Germany", "country": "DE", "doors": [
      { "id": "kfw", "name": "KfW risk relief", "institution": "KfW", "via": "the house bank",
        "status": "shut", "why": "Runs only through banks and savings banks.", "cite": ["w3"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "eu", "label": "EU guarantee", "steps": [
      { "id": "eoi", "label": "File expression of interest", "start": 1, "end": 3, "owner": "client", "status": "planned", "cite": ["c4"] },
      { "id": "signed", "label": "EIF agreement signed", "start": 8, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["eoi"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "eif", "name": "European Investment Fund", "side": "public-capital", "country": "EU", "units": [
      { "id": "investeu", "name": "InvestEU guarantees team", "roles": [
        { "id": "head", "role": "Head of SME guarantee products", "priority": "P1",
          "reach": "The call's inbox on the EIF call page", "status": "to_approach", "cite": ["w8"] }
      ] }
    ] }
  ] },
  "funding_stack": { "currency": "EUR", "need": { "amount": 500000000, "label": "Loan book in three years" },
    "instruments": [
      { "id": "warehouse", "name": "Warehouse facility", "type": "loan", "amount": 150000000, "terms": "Senior funding", "status": "secured", "cite": ["judgement"] },
      { "id": "eif", "name": "Headroom from a guaranteed book", "type": "guarantee_debt", "amount": 100000000, "amount_max": 200000000, "terms": "Under 80% per loan, 0.2% p.a.", "status": "probe", "cite": ["w8"] }
    ] },
  "process": [
    { "id": "guarantee", "title": "How the portfolio guarantee works", "caption": "The EIF takes part of each loss; the lender keeps originating.",
      "nodes": [
        { "id": "eif", "label": "EIF", "kind": "institution" },
        { "id": "lender", "label": "You", "kind": "client" },
        { "id": "smes", "label": "SME borrowers", "kind": "customer" }
      ],
      "edges": [
        { "from": "eif", "to": "lender", "label": "covers under 80% per loan", "kind": "risk" },
        { "from": "lender", "to": "smes", "label": "SME loans", "kind": "money" }
      ], "cite": ["w8"] }
  ],
  "risks_flags": [
    { "id": "lor", "kind": "deal_breaker", "severity": "high", "title": "Who is the lender of record?",
      "fix": "Send the origination chain; Regina to confirm the licensing position.", "cite": ["judgement"] }
  ]
}
```
