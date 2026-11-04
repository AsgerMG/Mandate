---
id: BRIEF
stage: brief.document
schema_fields: [caveats]
evidence: []
---

## Purpose

The brief as one object: its length, its closing caveat, and the rule that
nothing about the machine reaches the reader.

## Shape

Exactly four sections, in order, and nothing else:

1. the bottom line (contract BL)
2. the funds to target (contract FUND)
3. positioning (contract POS)
4. the state of play (contract SOP)

The caveat renders as a closing line beneath them, not as a fifth section.

An earlier version published a fifth block between the bottom line and the
funds, listing every documented eligibility rule behind every candidate with
its source document and page. It was an internal artifact rendered as reader
content, and it sat between the reader and the thing they came for.

## Rules

- BRIEF-1 (hard) At most 700 words of prose across the bottom line,
  positioning and the state of play. The funds table is separate and does not
  count toward it. The limit is a ceiling, not a target.
- BRIEF-2 (hard) The caveat is always present: one sentence noting figures are
  committed amounts from public registers, that coverage varies by country,
  and that absence from the database is not proof of no funding.
- BRIEF-3 (hard) No em-dashes anywhere a founder reads.
- BRIEF-4 (hard) Nothing describing the product's own machinery reaches the
  reader: rule counts, coverage ratios, verification status, source-document
  names, page anchors, extraction artifacts.

  **evidence:** a published brief carried a coverage metric of the form "your
  answers speak to N of its M documented rules" on every row, an internal
  verdict phrase as a row heading, and a table of statute quotations each
  printed twice with its source filename and page number.

- BRIEF-5 (hard) An identifier we gave you is ours, not the reader's. Keys,
  references and lookup handles are supplied so you can point at a row without
  ambiguity, and they exist for that and nothing else. Where the reader needs
  to know which fund you mean, use what the fund is called.

  The test: **did a person write this string about the fund, or did we generate
  it to find the fund?** A string of the second kind never reaches the page,
  wherever in the brief it would appear, and there is no position in a sentence
  where printing one helps the reader.

  **evidence:** a brief opened by telling a founder to start with a named
  regional scheme and then printed our storage key for it in brackets, in the
  first thing they read. The rows themselves were clean, so the guard on row
  names passed and so did every other offline check.


## Banned

- BRIEF-B1 Any section, heading or block beyond the four above.
- BRIEF-B2 A closing sign-off, summary or restatement of the bottom line.
