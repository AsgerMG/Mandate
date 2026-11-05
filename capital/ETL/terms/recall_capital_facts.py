"""What the record says a fund ACTUALLY pays, per instrument and per company.

Reads a JSON list of {"name", "instrument"} on stdin and writes a JSON object
keyed "<name> <instrument>" on stdout. Consumed by
web/scripts/diagnose_capital_pool.ts, which uses it to decide
whether a fund the capital filter removed would in fact have served the
founder.

── The three fields, and why three ────────────────────────────────────────
`funding_instruments.capital_type` is ONE value chosen by a majority vote over
the instrument's awards (`family_capital_type` in
ETL/events/load/populate_funding_instruments.py). The per-award kinds that lost
the vote are discarded. So the label alone cannot answer "does this fund pay
grants" -- it only answers "is grant what most of its awards were".

Three independent records are therefore returned, strongest first:

    ownKinds / schemeKinds   from `satr_staging.aid_instrument_text`, the raw
                             per-award wording. Exact, but only exists for
                             state-aid rows -- roughly half the corpus.
    siblingKinds             what OTHER funds built from the same scheme and
                             the same granting body carry. See below: a fund is
                             (scheme, body, capital type), so the sibling set is
                             the rest of the same real-world programme.
    label                    `capital_type` itself.
    vote                     `capital_type_basis`, the audit string the ETL
                             writes beside the label: "majority row vote
                             (n/total)" or "split vote {...}". n < total means
                             the label provably denies some of the instrument's
                             own awards, even where we cannot name their kind.

── On parsing our own audit string ────────────────────────────────────────
`capital_type_basis` is a human-readable note, not an interface, and parsing it
would be the wrong thing to do in product code -- the fix for that is a real
`capital_mix` column, and this file is not it. It is done HERE, in a
diagnostic, because the alternative is worse: without the vote counts, an
instrument with no state-aid rows has no per-award capital evidence at all, and
the diagnostic would score "we cannot tell" as "the fund does not pay it" --
which is exactly the direction that would flatter one of the two hypotheses it
exists to separate. Absence of evidence is reported as absence of evidence.

── Keyed on (company, scheme, GRANTING BODY), and that is not a detail ─────
A fund in this corpus is not a scheme. It is a scheme AS DELIVERED BY ONE BODY,
and for 21 (scheme, body) pairs the loader splits even that into two funds by
capital type -- a grant fund and a loan fund, in two different regimes. Keying
the register on the scheme alone therefore attributes one sibling's awards to
the other, and the first version of this file did exactly that: it reported the
grant sibling as "a fund that paid this company a loan", which read as a filter
defect and was nothing of the kind. The loan sibling exists, carries 3,053
awards, and is what a founder asking for a loan is correctly routed to.

That mistake has a real finding underneath it, which is why `siblingKinds` is
returned: when the register says a company was paid a kind its answer-key fund
does not carry, and a sibling under the same scheme and body DOES carry it, the
key names the wrong sibling. That is neither the filter nor the derived answer.

`capital_kind` is IMPORTED from `enrich_recall_answers.py`, the module that
wrote the derived answers, rather than copied: a second copy could disagree
with the one under test, and the divergence would then decide the question.
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
_sys.path.insert(0, str(_Path(__file__).resolve().parent))
from store import connect  # noqa: E402

import ast  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402

from enrich_recall_answers import capital_kind  # noqa: E402

MAJORITY = re.compile(r"^majority row vote \((\d+)/(\d+)\)$")
SPLIT = re.compile(r"^split vote (\{.*\})$")


def read_vote(basis: str | None) -> dict:
    """The vote behind a label, as far as the audit string preserves it.

    `kind` is what the caller keys on:
      unanimous  every award agreed; the label hides nothing
      lossy      n of total agreed, so total-n awards fall outside the label.
                 Their kind is NOT recoverable -- the counter is discarded --
                 and `total` includes awards whose kind the ETL could not
                 determine, so this is an upper bound on real erasure.
      split      no kind reached the threshold; the label is "blended", which
                 says nothing about whether anything dilutive is involved
      unknown    no vote was taken (framework rows, synthetic rollups, register
                 sources that state instruments directly)
    """
    b = (basis or "").strip()
    m = MAJORITY.match(b)
    if m:
        n, total = int(m.group(1)), int(m.group(2))
        return {"kind": "unanimous" if n >= total else "lossy",
                "agreed": n, "total": total, "kinds": []}
    m = SPLIT.match(b)
    if m:
        try:
            d = ast.literal_eval(m.group(1))
            kinds = sorted(d)
        except (ValueError, SyntaxError):
            kinds = []
        return {"kind": "split", "agreed": 0, "total": 0, "kinds": kinds}
    return {"kind": "unknown", "agreed": 0, "total": 0, "kinds": []}


def main() -> None:
    pairs = json.load(_sys.stdin)
    with connect(readonly=True, dict_rows=True) as conn:
        out = facts(conn, pairs)
    json.dump(out, _sys.stdout)


def facts(conn, pairs: list[dict]) -> dict:

    inst = {r["id"]: r for r in conn.execute(
        "SELECT id, scheme_code, capital_type, capital_type_basis, administering_body "
        "FROM funding_instruments")}
    # Every fund built from the same (scheme, body), so a mis-keyed answer can
    # be told apart from a filter that removed a fund the founder needed.
    siblings: dict[tuple, set] = collections.defaultdict(set)
    for r in inst.values():
        key = ((r["scheme_code"] or "").strip(), (r["administering_body"] or "").strip())
        if key[0] and key[1]:
            siblings[key].add(r["capital_type"])
    company: dict[str, int] = {}
    # First id wins for a duplicated name: ORDER BY id is the rowid order
    # SQLite scanned in, stated.
    for r in conn.execute("SELECT id, canonical_name FROM companies ORDER BY id"):
        company.setdefault(r["canonical_name"], r["id"])

    own: dict[tuple, set] = collections.defaultdict(set)
    by_company: dict[int, dict[str, set]] = collections.defaultdict(
        lambda: collections.defaultdict(set))
    delivered: dict[tuple, set] = collections.defaultdict(set)
    for r in conn.execute("""
            SELECT company_id, sa_number, granting_authority, aid_instrument_text
              FROM satr_staging
             WHERE sa_number IS NOT NULL AND TRIM(sa_number) <> ''"""):
        kind = capital_kind(r["aid_instrument_text"])
        if not kind:
            continue
        sa = r["sa_number"].strip()
        body = (r["granting_authority"] or "").strip()
        delivered[(sa, body)].add(kind)
        cid = r["company_id"]
        if cid is None:
            continue
        own[(cid, sa, body)].add(kind)
        by_company[cid][sa].add(kind)

    out = {}
    for p in pairs:
        row = inst.get(p["instrument"])
        code = (row["scheme_code"] or "").strip() if row else ""
        body = (row["administering_body"] or "").strip() if row else ""
        cid = company.get(p["name"])
        elsewhere: set = set()
        if cid is not None:
            for sa, kinds in by_company[cid].items():
                if sa != code:
                    elsewhere |= kinds
        key = (code, body)
        out[f"{p['name']} {p['instrument']}"] = {
            "label": row["capital_type"] if row else None,
            "vote": read_vote(row["capital_type_basis"] if row else None),
            "hasAwardRecord": bool(code and body and key in delivered),
            "ownKinds": sorted(own.get((cid, code, body), set())) if cid is not None else [],
            "schemeKinds": sorted(delivered.get(key, set())),
            "siblingKinds": sorted(siblings.get(key, set()) - {row["capital_type"] if row else None}),
            "elsewhereKinds": sorted(elsewhere),
        }
    return out


if __name__ == "__main__":
    main()
