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

## Required content from the options stage onward

The board's fixed structure is the completeness check: a section left empty is
a habit dropped. From the options stage onward every block (with what is known
so far) carries:
- **routes**: every level you checked, each door with its status, including the
  shut and parked ones (one line why).
- **stakeholders**: for EACH main route, the institution, the unit, a `P1`
  (decides) and a `P2` (forwards or influences) by function, on both the
  political and the public-capital side where both exist.
- **roadmap**: the plan as tracks (this week, this month, this quarter, later),
  with what must happen first (`depends_on`) and what not to do yet (a step
  with status `blocked` and a note in its label).
- **a watch track** in the roadmap (`"id": "watch"`, `"label": "Watchlist"`):
  every route recommended, probed or parked and every rule that could reopen or
  close one, as a milestone at its next review moment, cited or labelled.
- **funding_stack**: each instrument's `terms` says which cost it carries and
  why that money is cheap or dear for it.
- **risks_flags**: every deal-breaker and every flag with its fix, including a
  regulatory flag handed to Regina.

## Example (every section; the content is a placeholder, the structure is the point)

The names below are deliberately generic: the example teaches the format, not
an answer. Never copy its routes into a case.

```mandate-board
{
  "title": "Example company: public money for the next phase",
  "stage": "options",
  "answer": {
    "lines": [
      "Lead with the door that is open for your applicant type today.",
      "Market B: obtain the status that opens its national scheme, in sequence.",
      "Market A: no route today; work the rule change."
    ],
    "confidence": "medium",
    "confidence_why": "Eligible by type; fit depends on which entity applies.",
    "open_question": "Which entity would sign and hold the financing?",
    "cite": ["c3", "w8"]
  },
  "routes": { "levels": [
    { "id": "eu", "level": "eu", "label": "EU", "doors": [
      { "id": "layer", "name": "Example EU instrument", "institution": "Example EU body",
        "status": "open", "why": "Names this applicant type; open until the stated close date.",
        "conditions": ["Expression of interest, due diligence, agreement"], "cite": ["c1", "c3"] }
    ] },
    { "id": "a", "level": "national", "label": "Market A", "country": "XA", "doors": [
      { "id": "a-scheme", "name": "Example national scheme", "institution": "Example promotional bank", "via": "licensed banks only",
        "status": "shut", "why": "Runs only through an applicant type you are not.", "cite": ["w3"] }
    ] }
  ] },
  "roadmap": { "origin": "2026-11", "tracks": [
    { "id": "lead", "label": "Lead route", "steps": [
      { "id": "eoi", "label": "File expression of interest", "start": 1, "end": 3, "owner": "client", "status": "planned", "cite": ["c4"] },
      { "id": "signed", "label": "Agreement signed", "start": 8, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["eoi"] }
    ] },
    { "id": "watch", "label": "Watchlist", "steps": [
      { "id": "w-reform", "label": "Market A rule review: does it admit your applicant type?", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"] }
    ] }
  ] },
  "stakeholders": { "institutions": [
    { "id": "body", "name": "Example EU body", "side": "public-capital", "country": "EU", "units": [
      { "id": "unit", "name": "The instrument's team", "roles": [
        { "id": "head", "role": "Head of the instrument", "priority": "P1",
          "reach": "The call's inbox on the official call page", "status": "to_approach", "cite": ["w8"] },
        { "id": "officer", "role": "Investment officer for the client's market", "priority": "P2",
          "reach": "Forwarded by the head, or the call's inbox", "status": "to_approach", "cite": ["judgement"] }
      ] }
    ] }
  ] },
  "funding_stack": { "currency": "EUR", "need": { "amount": 5000000, "label": "Need over three years" },
    "instruments": [
      { "id": "own", "name": "Existing credit line", "type": "loan", "amount": 1500000, "terms": "Carries working capital; dear because lenders price the risk high", "status": "secured", "cite": ["judgement"] },
      { "id": "cover", "name": "Headroom from public cover on the line", "type": "guarantee_debt", "amount": 1000000, "amount_max": 2000000, "terms": "Same cost, cheaper: the public side takes part of the loss", "status": "probe", "cite": ["w8"] }
    ] },
  "process": [
    { "id": "cover", "title": "How the cover works", "caption": "The public body takes part of each loss; the lender keeps lending.",
      "nodes": [
        { "id": "body", "label": "Public body", "kind": "institution" },
        { "id": "bank", "label": "Your lender", "kind": "bank" },
        { "id": "client", "label": "You", "kind": "client" }
      ],
      "edges": [
        { "from": "body", "to": "bank", "label": "covers part of each loss", "kind": "risk" },
        { "from": "bank", "to": "client", "label": "a larger, cheaper line", "kind": "money" }
      ], "cite": ["w8"] }
  ],
  "risks_flags": [
    { "id": "entity", "kind": "deal_breaker", "severity": "high", "title": "Which entity applies?",
      "fix": "Confirm the applying entity; a regulatory question goes to Regina.", "cite": ["judgement"] }
  ]
}
```
