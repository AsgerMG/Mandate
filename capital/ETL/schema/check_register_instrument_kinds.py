"""What kind of capital an instrument is must agree with the register that
published it, and no kind a register publishes may vanish from the corpus.

HERMETIC: three committed files -- the register's own words
(reference/register_instruments.json), our decision
(SATR_INSTRUMENT_MAP in ETL/events/load/populate_funding_instruments.py) and
the shipped corpus snapshot
(website/frontend/public/data/instrument_terms.json). No database, no network,
no credentials.

── The defect this exists for ────────────────────────────────────────────
`StateAidInstrumentG` (Guarantee) and `StateAidInstrumentDG` (Direct grant) were
transposed on the day the map was written. Both read `grant`. Every check in
this repo stayed green while the state_aid_satr channel held 546 grants, 85
loans, 27 tax credits and ZERO guarantees, from a feed publishing 17,023
guarantee awards -- and while SA.57625 Fondo di garanzia per le PMI, the corpus's
fifth-largest instrument by euro, was rendered to founders as "Grant (national
government, state aid)" and excluded from every founder who asked for
guarantees.

Two lines of this repo already held the register's answer. Nothing compared them
to the map that decides what a founder is shown.

── The two properties, stated for kinds nobody has seen yet ─────────────
P1  THE KIND WE ASSIGN A CODE IS THE KIND THE REGISTER'S OWN WORDS NAME.
    Corroboration is a word-level test against the product's own capital
    vocabulary rather than a list of enum values: the kind `guarantee` is named
    by a label containing "guarantee", `tax_credit` by one containing "tax". A
    code the register labels "Guarantee" and we call `grant` is red, and so is
    the next transposition nobody has made yet.

    Where the register's words name NO kind in that vocabulary -- "Provision of
    risk capital" -- the corroboration cannot run and a `kind_basis` is required
    instead, stating the judgement and citing it. Silence is the one forbidden
    state, because the codes that will hurt are the ones nobody enumerated.

P2  THE CORPUS CONTAINS A NON-ZERO COUNT OF EVERY KIND ITS REGISTERS PUBLISH.
    A feed publishing 17,023 guarantee awards whose channel holds no guarantee
    instrument is a defect however the map reads, and this is the assertion that
    would have caught the transposition from the other side.

    Asked per CHANNEL, not per feed, and that is deliberate: Innovasjon Norge's
    risk-loan family genuinely mixes Lan and Garanti awards and votes `blended`,
    which every capital option admits. Calling a legitimate blend a failure
    would teach the next reader to raise the threshold.

── What is deliberately NOT asserted ────────────────────────────────────
Nothing about award VOLUME reaching a kind proportionally. A code with 16 awards
may legitimately lose every family's majority vote; requiring otherwise would be
a threshold nobody could defend and would go red for reasons that are not
defects.

Usage: python3 ETL/schema/check_register_instrument_kinds.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "reference/register_instruments.json"
POPULATE = ROOT / "ETL/events/load/populate_funding_instruments.py"
SNAPSHOT = ROOT / "website/frontend/public/data/instrument_terms.json"


def satr_instrument_map() -> dict[str, str]:
    """Our decision, read off the source rather than imported.

    Importing would pull the whole loader -- sqlite, the NDB taxonomy, the
    liveness module -- into a check that must run on a bare CI checkout. The
    literal is a flat dict of string keys to string values, so reading it is
    exact; a shape this cannot parse must stop the check rather than return a
    quietly wrong set.
    """
    src = POPULATE.read_text()
    m = re.search(r"^SATR_INSTRUMENT_MAP = \{(.*?)^\}", src, re.S | re.M)
    if not m:
        raise SystemExit(
            "check_register_instrument_kinds: SATR_INSTRUMENT_MAP not found in "
            f"{POPULATE.relative_to(ROOT)}. Teach this check the new shape "
            "rather than deleting it -- a diagnostic that cannot find its "
            "subject passes for the wrong reason.")
    body = re.sub(r"#[^\n]*", "", m.group(1))
    pairs = re.findall(r'"([^"]+)"\s*:\s*"([^"]+)"', body)
    if not pairs:
        raise SystemExit("check_register_instrument_kinds: SATR_INSTRUMENT_MAP "
                         "parsed to nothing. Refusing to pass on an empty set.")
    return dict(pairs)


def kinds_named_by(labels: list[str], vocabulary: set[str]) -> set[str]:
    """Which capital kinds the register's OWN WORDS name, if any.

    A kind's name is its own evidence: `guarantee` is named by a label
    containing "guarantee", `tax_credit` by one containing "tax" or "credit".
    Splitting the kind on `_` is what lets an unseen kind be corroborated
    without being listed here.
    """
    text = " ".join(labels).lower()
    named = set()
    for kind in vocabulary:
        if any(re.search(rf"\b{re.escape(word)}", text)
               for word in kind.split("_")):
            named.add(kind)
    return named


def main() -> int:
    ref = json.loads(REFERENCE.read_text())
    instruments: dict[str, dict] = ref["instruments"]
    feeds: dict[str, dict] = ref["feeds"]
    decided = satr_instrument_map()
    # The vocabulary is every kind our own map assigns. Not a list maintained
    # here: a new kind entering the map is corroborated on the day it does.
    vocabulary = set(decided.values())
    problems: list[str] = []

    # ── P1a: every code the register publishes carries a decision ──────────
    for code in sorted(set(instruments) - set(decided)):
        problems.append(
            f"  {code}: the register publishes it "
            f"({instruments[code].get('awards', 0):,} awards) and "
            "SATR_INSTRUMENT_MAP does not type it.\n"
            "    Every award under it falls through to the amount columns, "
            "where several sources put a loan in grant_amount_eur.")

    # ── P1b: no invented codes ─────────────────────────────────────────────
    for code in sorted(set(decided) - set(instruments)):
        problems.append(
            f"  {code}: typed by SATR_INSTRUMENT_MAP with no evidence in "
            f"{REFERENCE.name}.\n"
            "    Record the register's own words for it, or remove it -- a "
            "mapping nothing corroborates is a guess with a comment.")

    # ── P1c: the kind agrees with the register's own words ─────────────────
    for code in sorted(set(instruments) & set(decided)):
        ev = instruments[code]
        assigned = decided[code]
        labels = list(ev["labels"])
        if ev.get("label_en"):
            labels.append(ev["label_en"])
        named = kinds_named_by(labels, vocabulary)
        if named and assigned not in named:
            problems.append(
                f"  {code}: the register calls it {ev['labels'][0]!r}, which "
                f"names {sorted(named)}, and SATR_INSTRUMENT_MAP says "
                f"{assigned!r}.\n"
                f"    {ev.get('awards', 0):,} awards are typed by this line. "
                "The register's own words decide.")
        elif not named and not ev.get("kind_basis"):
            problems.append(
                f"  {code}: the register calls it {ev['labels'][0]!r}, which "
                f"names no kind in {sorted(vocabulary)}, and no `kind_basis` "
                "states the judgement.\n"
                "    Write one, citing the source that settles it. A kind "
                "nobody has justified is the shape the G/DG transposition had.")

    # ── P2: no kind a register publishes is absent from its channel ────────
    snapshot = json.loads(SNAPSHOT.read_text())["records"]
    in_channel: dict[str, set[str]] = {}
    for rec in snapshot:
        in_channel.setdefault(rec.get("sourceFamilyBucket") or "", set()).add(
            rec.get("capitalType") or "")
    for code, ev in sorted(instruments.items()):
        if not ev.get("awards") or code not in decided:
            continue
        channel = feeds[ev["feed"]]["channel"]
        kind = decided[code]
        if kind not in in_channel.get(channel, set()):
            problems.append(
                f"  {channel}: the {ev['feed']} register publishes "
                f"{ev['labels'][0]!r} on {ev['awards']:,} awards and the corpus "
                f"holds NO {kind} instrument in that channel.\n"
                "    Either the code is typed wrong, or a whole kind of capital "
                "is invisible to every founder who asks for it.")

    if problems:
        print("check_register_instrument_kinds: FAIL\n")
        print("\n".join(problems))
        print(f"\n  register evidence: {REFERENCE.relative_to(ROOT)}")
        print(f"  our decision:      {POPULATE.relative_to(ROOT)} "
              "(SATR_INSTRUMENT_MAP)")
        return 1

    kinds = sorted({decided[c] for c in instruments if c in decided})
    print(f"check_register_instrument_kinds: ok — {len(instruments)} register "
          f"instrument codes, every kind the registers publish "
          f"({', '.join(kinds)}) present in its channel")
    return 0


if __name__ == "__main__":
    sys.exit(main())
