"""The repair rule in scheme_title.py, tested on cases NOBODY HERE HAS SEEN.

Credential-free and instant: hand-built case records shaped like the register's,
so this runs anywhere the tree does. The three real instances are in here as a
floor, but most of what follows is invented on purpose -- a Bulgarian scheme in
Cyrillic, a Japanese one, a case linked to two schemes -- because a suite built
out of the three rows that provoked the fix would pass forever and catch nothing
that arrives next year.

Run: python3 ETL/lib/test_scheme_title.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "ETL" / "lib"))
from scheme_title import (  # noqa: E402
    fold_any_script, link_map, named_after_its_granting_body, officially_named,
    repair_body_named_rows, scheme_title_via_links)

FAILURES: list[str] = []


def check(cond, msg):
    if not cond:
        FAILURES.append(msg)


def case(title, links=None):
    rec = {"caseTitle": [title]}
    if links:
        rec["caseLinks"] = list(links)
    return rec


# ── The fold decides equality in every script ─────────────────────────────
for a, b in [
    ("Ministère de l'économie et des finances", "MINISTERE DE L ECONOMIE ET DES FINANCES"),
    ("Finanzamt München Abt. 3", "Finanzamt Munchen Abt 3"),
    ("Изпълнителна агенция", "изпълнителна   агенция"),   # Cyrillic
    ("Οργανισμός Ερευνας", "ΟΡΓΑΝΙΣΜΟΣ ΕΡΕΥΝΑΣ"),          # Greek
    ("経済産業省", "経済産業省"),                              # no Latin at all
    ("Valsts ieņēmumu dienests", "VALSTS IENEMUMU DIENESTS"),
]:
    check(named_after_its_granting_body(a, b),
          f"the fold failed to see {a!r} and {b!r} as the same string. A rule "
          "about equality must not know which alphabet it is reading -- this is "
          "the hole that made the first TypeScript version return False for two "
          "identical Bulgarian strings.")

# ...and never collapses two DIFFERENT bodies together.
for a, b in [
    ("Finanzamt Erlangen", "Finanzamt Heilbronn"),
    ("Изпълнителна агенция", "Изпълнителна агенция за наука"),
    ("Forschungszulage", "Finanzamt Erlangen"),
]:
    check(not named_after_its_granting_body(a, b),
          f"{a!r} and {b!r} folded equal. Over-folding renames a correctly "
          "named row, which is worse than leaving a wrong one.")

# Silent, never true, when a column is missing: withholding or rewriting a row
# is a claim, and an unfilled column is not evidence for it.
for a, b in [(None, "X"), ("X", None), ("", ""), ("   ", "!!!"), ("!!!", "???")]:
    check(not named_after_its_granting_body(a, b),
          f"({a!r}, {b!r}) was called a defect on missing or punctuation-only data")

# ── The escape clause defaults CLOSED ─────────────────────────────────────
for src in ("curated", "programme_feed", "case_register"):
    check(officially_named(src), f"{src} must excuse a body-shaped name")
for src in ("deterministic", "partition_key", "llm_guess", "inferred_2027", "", None):
    check(not officially_named(src),
          f"{src!r} was treated as an official naming. A vocabulary nobody has "
          "declared must not silently start excusing collisions, and "
          "`deterministic` is us composing the string in the first place.")

# ── The link map is symmetric ─────────────────────────────────────────────
# SA.40391 is the real case: its own record carries no caseLinks, and the link
# to the scheme exists only on the other side. A forward-only reading loses it.
cases = {
    "SA.111": case("Plan d'évaluation"),                       # no links of its own
    "SA.222": case("Régime cadre RDI 2014-2023", ["SA.111"]),  # links back
}
edges = link_map(cases)
check(edges.get("SA.111") == {"SA.222"},
      "the link map is not symmetric, so a plan whose scheme filed the link "
      "resolves to nothing -- which is exactly SA.40391, three offerable French "
      "rows, in production today")
title, via = scheme_title_via_links("SA.111", cases)
check((title, via) == ("Régime cadre RDI 2014-2023", "SA.222"),
      f"reverse-linked scheme not resolved: got {title!r} via {via!r}")

# ── It refuses to guess ───────────────────────────────────────────────────
two = {
    "SA.900": case("Evaluation plan", ["SA.901", "SA.902"]),
    "SA.901": case("Scheme A"),
    "SA.902": case("Scheme B"),
}
title, reason = scheme_title_via_links("SA.900", two)
check(title is None and "refusing to guess" in reason,
      f"a case linked to TWO titled schemes was resolved anyway ({title!r}). "
      "Picking one would put a name in front of a founder that the register "
      "does not support; the loud failure is the correct one.")

none = {"SA.910": case("Evaluation plan"), "SA.911": {"_reference": "SA.911", "_miss": True}}
title, reason = scheme_title_via_links("SA.910", none)
check(title is None and "links to no case record" in reason,
      f"an unlinked case resolved to something ({title!r})")

# ── The repair fires ONLY on the defect ───────────────────────────────────
reg = {
    "SA.001": case("Evaluierungsplan", ["SA.002"]),
    "SA.002": case("Steuerliche Förderung von Forschung und Entwicklung [BMF]"),
    "SA.010": case("Национална програма за иновации", ["SA.011"]),
    "SA.011": case("Схема за подпомагане на научни изследвания"),
    "SA.020": case("A perfectly good scheme title"),
}
rows = [
    # THE DEFECT, in German
    dict(id="satr_de__a", scheme_code="SA.001", name="Finanzamt Erlangen",
         administering_body="Finanzamt Erlangen", name_source="deterministic"),
    # THE DEFECT, in a script no word list in this repo covers
    dict(id="satr_bg__a", scheme_code="SA.010", name="Изпълнителна агенция",
         administering_body="Изпълнителна агенция", name_source="deterministic"),
    # already named by the register -- MUST NOT be touched
    dict(id="satr_de__b", scheme_code="SA.020", name="A perfectly good scheme title",
         administering_body="Finanzamt Erlangen", name_source="case_register"),
    # a scheme whose registered title genuinely IS its agency's name: an
    # official source vouched for it, so it is named, and renaming it would
    # replace the register's answer with our own.
    dict(id="satr_gr__a", scheme_code="SA.030", name="Ταμείο Επιχειρηματικότητας",
         administering_body="Ταμείο Επιχειρηματικότητας", name_source="case_register"),
    # no scheme code at all -- out of reach of the register, left alone
    dict(id="ndb__a", scheme_code=None, name="Bpifrance",
         administering_body="Bpifrance", name_source="deterministic"),
]
before = {r["id"]: (r["name"], r["name_source"]) for r in rows}
recs = repair_body_named_rows(rows, reg)
after = {r["id"]: (r["name"], r["name_source"]) for r in rows}

check(after["satr_de__a"] == ("Steuerliche Förderung von Forschung und Entwicklung [BMF]",
                             "case_register"),
      f"the German row was not repaired: {after['satr_de__a']}")
check(after["satr_bg__a"] == ("Схема за подпомагане на научни изследвания", "case_register"),
      f"the Cyrillic row was not repaired: {after['satr_bg__a']}. This is the "
      "whole point of the rule being relational: no word list in this repo "
      "contains any of these strings.")
for untouched in ("satr_de__b", "satr_gr__a", "ndb__a"):
    check(after[untouched] == before[untouched],
          f"{untouched} was renamed and must not have been: "
          f"{before[untouched]} -> {after[untouched]}")

check({r["instrument_id"] for r in recs} == {"satr_de__a", "satr_bg__a"},
      f"the evidence record covers the wrong rows: {[r['instrument_id'] for r in recs]}")
check(all(r["applied"] for r in recs), "a repaired row was recorded as not applied")
check(all(r["old_name"] and r["new_name"] and r["via_scheme_code"] for r in recs),
      "an evidence record is missing the old name, the new name or the SA number "
      "it came from -- the three things that make the rename checkable")

# It writes `name` and `name_source` and nothing else.
row = dict(id="x", scheme_code="SA.001", name="Finanzamt Erlangen",
           administering_body="Finanzamt Erlangen", name_source="deterministic",
           country="DE", total_eur=1.0, scheme_end_date="2024-06-29")
repair_body_named_rows([row], reg)
check(row["country"] == "DE" and row["total_eur"] == 1.0
      and row["scheme_end_date"] == "2024-06-29" and row["administering_body"] == "Finanzamt Erlangen",
      f"the repair touched a column other than name/name_source: {row}")

# ── Idempotent: running it twice changes nothing the second time ─────────
again = repair_body_named_rows(rows, reg)
check(again == [], f"a second pass wanted to rename {len(again)} more row(s); the "
                   "repair must be a fixed point or a rebuild loop will drift")

# ── The real three, against the register snapshot on disk if it is here ──
_real = _ROOT / "data" / "raw" / "state_aid_cases" / "cases.json"
if _real.exists():
    real = json.loads(_real.read_text())
    e = link_map(real)
    for sa in ("SA.40391", "SA.56245", "SA.49781"):
        t, v = scheme_title_via_links(sa, real, e)
        check(t and v.startswith("SA."),
              f"{sa} no longer resolves against the fetched register: {t!r} / {v!r}")
else:
    print("  (data/raw/state_aid_cases/cases.json absent -- gitignored; "
          "the three real cases were not re-checked here)")

if FAILURES:
    print("FAIL: the body-named repair rule does not hold\n")
    for f in FAILURES:
        print(f"  - {f}\n")
    sys.exit(1)
print("ok: the repair fires on the defect in every script, refuses to guess, "
      "leaves officially named rows alone, and is a fixed point")
