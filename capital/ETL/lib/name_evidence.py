"""Does anything outside a row's own id name it?

── The property ───────────────────────────────────────────────────────────
A ROW MAY BE OFFERED ONLY IF SOMETHING OUTSIDE ITS OWN ID NAMES IT.

The test for an unseen row: point at the field in the source record, or the
official publication, that the name was read from. If the loader assembled the
name from its own partition keys, the row is a bucket and not a fund.

── What it cost to leave unasked ─────────────────────────────────────────
`publishableInstruments()` asks whether a row has CHILDREN, not whether it is a
FUND, and eleven childless bucket labels passed it. `satr_pt_equity` reached a
Portuguese founder's 18-row pool unblocked, rendered as "National state aid
(equity)" with a typical award of EUR 255,571. Poland's entire offerable pool
was eight `sudop_*` rows: not one real Polish fund was in it. None of the eleven
carries a scheme code, an application URL or a register name.

── Why the answer is DECLARED and not inferred ───────────────────────────
Because inference was tried and over-fired. `name_source = 'deterministic'`
selects 372 rows. "The name is a mechanical re-casing of the id" selects 94 --
and 83 of those are real funds: the eleven IPCEI waves, the eight Innovation
Fund lots, every Horizon Europe cluster and Joint Undertaking. Nothing readable
from the ROW separates `horizon_eu_cl4`, whose token is CORDIS's own topic-code
prefix, from `satr_pt_equity`, whose token is a country crossed with the filter
set we send to a search API.

The distinction lives in the EXTRACTOR, where the `source` string is composed.
So it is recorded there, in reference/family_name_evidence.json, exactly as
`source_window_policy` is -- and read here by both the rebuild and the corpus.

Silence is the one forbidden state: a family whose name is a mechanical
re-casing and that matches no declaration FAILS THE LOAD.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "reference" / "family_name_evidence.json"

# The three verdicts a declaration may carry. `partition_key` is the only one
# that withholds a row, and it is the only one that is a statement about US
# rather than about a source -- which is why its `source` is a file:line in this
# repo and the others' are a register field or an official page.
NAMES_SOURCE_FIELD = "source_field"
NAMES_OFFICIAL_PUBLICATION = "official_publication"
NAMES_PARTITION_KEY = "partition_key"
NAMES_VERDICTS = frozenset(
    {NAMES_SOURCE_FIELD, NAMES_OFFICIAL_PUBLICATION, NAMES_PARTITION_KEY})

# The `name_source` value a partition-key row carries. It joins the vocabulary
# migration 011/021/022 built -- deterministic / curated / programme_feed /
# case_register -- and it is deliberately a fourth PEER rather than a flag,
# because "who named this" has exactly one answer per row and a second column
# would let the two disagree.
NAME_SOURCE_PARTITION_KEY = "partition_key"

_cache: list[dict] | None = None


def _declarations() -> list[dict]:
    global _cache
    if _cache is None:
        if not REFERENCE.exists():
            raise SystemExit(
                f"name_evidence: {REFERENCE} is missing.\n"
                "  It is gitignored by the repo-wide `data` rule and must be "
                "force-added (`git add -f`).\n"
                "  source_window_policy.json was lost exactly this way once "
                "already -- see its own $note.")
        raw = json.loads(REFERENCE.read_text())
        decls = raw["declarations"]
        for d in decls:
            if d["names"] not in NAMES_VERDICTS:
                raise SystemExit(
                    f"name_evidence: unknown verdict {d['names']!r} in "
                    f"{REFERENCE.name}. Allowed: {sorted(NAMES_VERDICTS)}")
            if not d.get("source"):
                raise SystemExit(
                    f"name_evidence: declaration {d['match']} carries no "
                    "`source`. Every entry cites a file:line or a URL, so a "
                    "reader can check the claim instead of trusting it.")
        _cache = decls
    return _cache


def declaration_for(family: str) -> dict | None:
    """The declaration governing this family, or None if nobody has made one.

    An exact `id` beats any `id_prefix`, and a longer prefix beats a shorter
    one, so a single family can be carved out of its feed's answer without
    restating the feed. Returning None is the caller's cue to FAIL -- never to
    assume, in either direction.
    """
    best: dict | None = None
    best_rank = -1
    for d in _declarations():
        match = d["match"]
        if match.get("id") == family:
            return d
        prefix = match.get("id_prefix")
        if prefix and family.startswith(prefix) and len(prefix) > best_rank:
            best, best_rank = d, len(prefix)
    return best


def names_the_object(family: str) -> bool:
    """Does something outside this family's own id name it?

    Raises if undeclared: the caller must not be able to get a quiet `False`
    (which would delete a real fund) or a quiet `True` (which would keep the
    bucket) out of a question nobody has answered.
    """
    d = declaration_for(family)
    if d is None:
        raise KeyError(family)
    return d["names"] != NAMES_PARTITION_KEY


def undeclared_error(families: list[str]) -> str:
    """The message a load dies with. Written once because two callers raise it."""
    return (
        "name_evidence: no declaration for instrument "
        f"famil{'y' if len(families) == 1 else 'ies'}: {', '.join(sorted(families))}\n"
        "  Each of these has a name that is nothing but a mechanical re-casing "
        "of its own id,\n  so the corpus cannot say whether it is a fund or a "
        "bucket the loader invented.\n"
        f"  Answer it in {REFERENCE.relative_to(ROOT)} by reading the "
        "EXTRACTOR that composes\n  `public_funding_events.source` for the "
        "feed, and saying which it is:\n"
        f"    {NAMES_SOURCE_FIELD}         the token IS a field of the fetched "
        "record (name the field)\n"
        f"    {NAMES_OFFICIAL_PUBLICATION}  a human read the body's own page or "
        "decision (cite it)\n"
        f"    {NAMES_PARTITION_KEY}         nothing but our own query "
        "partitioning produced it -- NOT A FUND\n"
        "  Do NOT guess. A wrong `partition_key` deletes a real fund from every "
        "founder in that\n  country; a wrong `source_field` puts a register "
        "artefact in front of them as an offer."
    )
