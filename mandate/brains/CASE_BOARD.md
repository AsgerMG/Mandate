# The case board (Wincent and Regina, bench only)

The bench app draws a **case board** from a block you append to your reply: the
answer as a hero card, the route map, the roadmap, the stakeholder tree, the
funding stack, how a mechanism works, the risks. The board carries the structure,
so the prose stays short: say what changed and ask the question that moves the
case. The schema is `web/lib/bench/board.ts`; the example below is checked
against it by `web/lib/bench/board.test.ts` (it must parse with no warnings).

## When

The board follows the consultation arc (method.md): `qualify`, `investigate`,
`options`, `prioritise`, `advise`, `write_up` (the brief). It grows every turn:
- **From the first turn**: `stage`, and as soon as you know the landscape, a first
  `hierarchies` entry (who sits under whom) so the founder sees the field while you
  qualify. No routes or plan yet.
- **options**: routes with every door's status, the hierarchies, the risks.
- **prioritise**: the answer card on the two or three that fit; the rest `park`.
- **advise**: the process maps with each step's `gates` (what must be true to pass),
  the roadmap, the stakeholders, and a `networks` entry where relationships decide.
- **write_up**: the whole board, complete.
- One block at the END of the reply, after the prose and before the sources list.
- Send only the sections that are known or that changed in this turn. The app
  keeps the earlier blocks: `answer` is replaced by a later one; every list item
  is merged by its `id` (same id = updated, new id = added). Keep ids stable
  across turns. Never drop an item to remove it: a door that closes becomes
  `shut`, a step that is no longer planned becomes `blocked` with a note.

## Draw it, do not write it (the visual-by-default rule)

Whenever the structure is there, it goes on the board as a picture, not in prose:
- **A chain of command or of money with three or more bodies** (a ministry, its
  promotional bank and the bank's programmes; a federal bank and the regional
  institutes; one institution's divisions) is a `hierarchies` entry.
- **Three or more actors with ties across institutions** (who leads a ministry, who
  sits on a bank's board, which committee oversees it, who is in parliament and on
  the board) is a `networks` entry. Public professional roles only, every tie cited;
  name a person only where their public role is published, else the role.
- **Any process of three or more steps** (an application, a decision, a legislative
  file) is a `process_maps` entry, and every step carries its `gates`: what must be
  true to pass that step (eligibility, documents, timing), each cited.
Test: if the prose would need "under", "through", "reports to", "sits on", "then",
or "before" more than twice to explain it, draw it.

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
| `stage` | `qualify`, `investigate`, `options`, `prioritise`, `advise`, `write_up` |
| hierarchy node `kind` | `ministry`, `institution`, `division`, `unit`, `programme`, `instrument`, `regional_body`, `channel` (`parent` = the node above; `status` as a door) |
| network node `kind` | `person`, `institution`, `ministry`, `parliament`, `committee`, `party`, `bank`, `association`, `body` |
| network tie `kind` | `member_of`, `leads`, `reports_to`, `oversees`, `funds`, `sits_on`, `works_with`, `advises` |
| process step `gates` | `[{ "label": "what must be true", "cite": [...] }]`, at most 8 per step |
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
- **Use the exact keys of the example below**: a map has `explains` and `flow`; a
  leverage item has `at`, `kind` and `label` (not `on` or `type`).

## Example (every section; the content is a placeholder, the structure is the point)

The names below are deliberately generic: the example teaches the format, not
an answer. Never copy its routes into a case.

```mandate-board
{
  "title": "Example company: public money for the next phase",
  "stage": "advise",
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
  "routes": {
    "levels": [
      {"id": "eu", "level": "eu", "label": "EU", "doors": [{"id": "layer", "name": "Example EU instrument", "institution": "Example EU body", "status": "open", "why": "Names this applicant type; open until the stated close date.", "conditions": ["Expression of interest, due diligence, agreement"], "cite": ["c1", "c3"]}]},
      {"id": "a", "level": "national", "label": "Market A", "country": "XA", "doors": [{"id": "a-scheme", "name": "Example national scheme", "institution": "Example promotional bank", "via": "licensed banks only", "status": "shut", "why": "Runs only through an applicant type you are not.", "cite": ["w3"]}]}
    ]
  },
  "roadmap": {
    "origin": "2026-11",
    "tracks": [
      {"id": "lead", "label": "Lead route", "steps": [{"id": "eoi", "label": "File expression of interest", "start": 1, "end": 3, "owner": "client", "status": "planned", "cite": ["c4"]}, {"id": "signed", "label": "Agreement signed", "start": 8, "milestone": true, "owner": "institution", "status": "planned", "depends_on": ["eoi"]}]},
      {"id": "watch", "label": "Watchlist", "steps": [{"id": "w-reform", "label": "Market A rule review: does it admit your applicant type?", "start": 6, "milestone": true, "owner": "us", "status": "planned", "cite": ["unverified"]}]}
    ]
  },
  "stakeholders": {
    "institutions": [
      {"id": "body", "name": "Example EU body", "side": "public-capital", "country": "EU", "units": [{"id": "unit", "name": "The instrument's team", "roles": [{"id": "head", "role": "Head of the instrument", "priority": "P1", "reach": "The call's inbox on the official call page", "status": "to_approach", "cite": ["w8"]}, {"id": "officer", "role": "Investment officer for the client's market", "priority": "P2", "reach": "Forwarded by the head, or the call's inbox", "status": "to_approach", "cite": ["judgement"]}]}]}
    ]
  },
  "funding_stack": {
    "currency": "EUR",
    "need": {"amount": 5000000, "label": "Need over three years"},
    "instruments": [
      {"id": "own", "name": "Existing credit line", "type": "loan", "amount": 1500000, "terms": "Carries working capital; dear because lenders price the risk high", "status": "secured", "cite": ["judgement"]},
      {"id": "cover", "name": "Headroom from public cover on the line", "type": "guarantee_debt", "amount": 1000000, "amount_max": 2000000, "terms": "Same cost, cheaper: the public side takes part of the loss", "status": "probe", "cite": ["w8"]}
    ]
  },
  "process": [
    {
      "id": "cover",
      "title": "How the cover works",
      "caption": "The public body takes part of each loss; the lender keeps lending.",
      "nodes": [
        {"id": "body", "label": "Public body", "kind": "institution"},
        {"id": "bank", "label": "Your lender", "kind": "bank"},
        {"id": "client", "label": "You", "kind": "client"}
      ],
      "edges": [
        {"from": "body", "to": "bank", "label": "covers part of each loss", "kind": "risk"},
        {"from": "bank", "to": "client", "label": "a larger, cheaper line", "kind": "money"}
      ],
      "cite": ["w8"]
    }
  ],
  "process_maps": [
    {
      "id": "decision",
      "title": "How the guarantee decision is made",
      "explains": "Who files, who checks and who decides, and where attention moves it.",
      "kind": "funding_decision",
      "illustrative": false,
      "actors": [
        {"id": "bank", "name": "Your lender", "side": "market"},
        {"id": "body", "name": "Example public body, credit committee", "side": "public-capital"}
      ],
      "steps": [
        {"id": "file", "label": "Lender files the cover request", "kind": "document", "actor": "bank", "timing": "1-2 weeks", "cite": ["w8"], "gates": [{"label": "An SME under the EU definition", "cite": ["w8"]}, {"label": "Project not yet started", "cite": ["w8"]}]},
        {"id": "check", "label": "Risk unit checks the file", "kind": "step", "actor": "body", "timing": "4-6 weeks", "cite": ["w8"], "gates": [{"label": "Creditworthy, with collateral", "cite": ["w8"]}]},
        {"id": "decide", "label": "Committee decides", "kind": "decision", "actor": "body", "timing": "monthly sitting", "cite": ["w8"]}
      ],
      "flow": [{"from": "file", "to": "check"}, {"from": "check", "to": "decide", "label": "complete file"}],
      "leverage": [
        {"id": "door", "at": "bank", "kind": "door_opener", "label": "The lender that already holds this cover", "why": "It knows the process and files faster.", "how": "Your finance lead asks the lender's relationship manager.", "side": "market", "cite": ["judgement"]},
        {"id": "window", "at": "decide", "kind": "timing_window", "label": "Committee sitting", "why": "A file that misses the sitting waits a month.", "how": "Agree the filing date backwards from the sitting.", "side": "public-capital", "cite": ["unverified"]}
      ],
      "cite": ["w8"]
    }
  ],
  "risks_flags": [
    {
      "id": "entity",
      "kind": "deal_breaker",
      "severity": "high",
      "title": "Which entity applies?",
      "fix": "Confirm the applying entity; a regulatory question goes to Regina.",
      "cite": ["judgement"]
    }
  ],
  "hierarchies": [
    {
      "id": "field",
      "title": "Who sits under whom",
      "explains": "The national promotional bank lends through your bank; the regional institute covers part of the risk.",
      "nodes": [
        {"id": "min", "label": "Example ministry", "kind": "ministry", "cite": ["w8"]},
        {"id": "bank-pb", "label": "Example promotional bank", "kind": "institution", "parent": "min", "cite": ["w8"]},
        {"id": "prog", "label": "SME loan programme", "kind": "programme", "parent": "bank-pb", "status": "open", "note": "Through your bank, before the project starts.", "cite": ["w8"]},
        {"id": "reg", "label": "Example regional institute", "kind": "regional_body", "parent": "min", "status": "probe", "cite": ["unverified"]}
      ],
      "cite": ["w8"]
    }
  ],
  "networks": [
    {
      "id": "oversight",
      "title": "Who moves the programme",
      "explains": "The bank answers to the ministry and a board that includes members of parliament.",
      "nodes": [
        {"id": "min", "label": "Example ministry", "kind": "ministry", "cite": ["w8"]},
        {"id": "pb", "label": "Example promotional bank", "kind": "bank", "cite": ["w8"]},
        {"id": "board", "label": "The bank's supervisory board", "kind": "committee", "cite": ["w8"]},
        {"id": "minister", "label": "The minister (role)", "kind": "person", "role": "Chairs the board", "cite": ["w8"]}
      ],
      "edges": [
        {"from": "min", "to": "pb", "kind": "oversees", "cite": ["w8"]},
        {"from": "minister", "to": "min", "kind": "leads", "cite": ["w8"]},
        {"from": "minister", "to": "board", "kind": "sits_on", "label": "chair", "cite": ["w8"]},
        {"from": "board", "to": "pb", "kind": "oversees", "cite": ["w8"]}
      ],
      "cite": ["w8"]
    }
  ]
}
```
