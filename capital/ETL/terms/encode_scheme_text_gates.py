"""Cut GATES from the scheme text a fetch already landed.

── The hole this fills ──────────────────────────────────────────────────────
`load_scheme_text.py` writes `funding_instruments.eligibility_text` and says so
in as many words: it does NOT write `eligibility_gates`, because turning prose
into a formal gate means assigning `gate_role` and `verification_level`, and a
seeded gate with a NULL role is silently inert. That was the right call. It
also left the text stranded.

Measured 2026-08-08 against Postgres: 99 French instruments carry eligibility
text, 58 carry any gate, and only 24 carry both. **75 French funds hold
eligibility prose that has never been encoded.** The ranker scores on gates
(`gateFitScorer` in shortlist.ts), never on prose, so a collection workstream
that took French coverage 55% -> 74% moved the corpus and left French EXACT@5
exactly where it was. The data landed; nothing converted it.

All 75 are children of one regime (`ademe_aid`), and `mergeInheritedGates`
gives every child the parent's rules. So today every ADEME leaf assesses
IDENTICALLY, `gateFitScorer` sees hi === lo, and returns neutral for the whole
regime. That is the structural ceiling the scorer's own docstring names ("68%
of multi-leaf regimes... inherit one rule set and are therefore genuinely
indistinguishable"). It is breakable here only because the leaves DO publish
distinct text — 57 distinct texts across the 75 rows.

── What it writes, and why that tier ────────────────────────────────────────
One gate row per rule found, at `llm_cited`: a verbatim `quote` is REQUIRED and
is checked mechanically against the instrument's own `eligibility_text` before
anything is written. A gate whose quote is not a substring of the source is
dropped, not repaired. That is exactly the llm_cited bar (quote present and
verified; no paid entailment second pass), and it is what entitles these rules
to disqualify a founder at all — `verdict.ts` lets only a cited rule condemn.

`gate_role` is always set. Never NULL: 790 gates once landed NULL because an
INSERT omitted it, and they were inert while looking encoded.

It writes `gate_role` / `intake_field_resolved` and leaves `value_spec` to
`encode_gates.py encode`, which owns the comparator vocabulary
(data/vocabularies.json) and the permission-vs-restriction rules learned from
the reality audit. Two encoders would drift; there is one.

`intake_field` is never written — `classify_gates_bulk.py`'s ON CONFLICT
overwrites it on every re-run, so a correction there reverts silently.

── The two properties, enforced mechanically ────────────────────────────────
Both came out of reading the French corpus, and both are stated as properties
with a machine test (`check_gate_subject.py`), never as a note on the rows that
happened to show them.

  1. THE APPLICANT IS NOT ALWAYS THE BENEFICIARY.
     "Accompagnement des agriculteurs": the eligible structure is an *organisme
     de conseil*; the text then says the *bénéficiaire final* must be a PME in
     primary agriculture. An exploitant agricole cannot apply. "PACTE
     Entreprises": the applicant is a *structure relais*; the PMEs named are the
     audience the relais serves. Encoding either on "agriculteur" or "PME"
     sends precisely the wrong founder to a fund they cannot apply to — worse
     than omitting the fund, because `verdict.ts` would show it as open.

     Property: a gate may be a FILTER only if it constrains the entity that
     SUBMITS the application (or the project that entity submits). Text about
     who benefits downstream is a fact about the programme.

     Enforced here: the model must label every gate's `subject`, and a subject
     of `final_beneficiary` or `fund` can never become a filter, whatever role
     the model asked for.

  2. AN ENUMERATION IS NOT AN EXCLUSION.
     Two of the source platforms publish eligibility as taxonomy facets, and
     one of them is written for collectivités: "Bénéficiaires : Commune,
     Intercommunalité, Département, Établissement public...". The absence of
     "entreprise" from that list is a gap in their taxonomy, not a rule. The
     framework rule these schemes actually run on is "personne morale publique
     ou privée (hors particulier ou service de l'État)". Where companies really
     are excluded — AVELO — the text says so in prose.

     Property: a filter may be cut only from text that ASSERTS a restriction —
     a stated requirement, a stated exclusion, or a list the text itself calls
     exhaustive. A bare enumeration of eligible categories asserts nothing
     about who is left out.

     Enforced here: the model must label every gate's `basis`, and
     `enumeration_only` can never become a filter.

── One rule set per call, not per alias ─────────────────────────────────────
The 75 rows carry 57 distinct texts: three ORMAT vintages, three geothermie
studies and three heavy-vehicle rows are the same call reached by different
names. Work is keyed on the NORMALISED TEXT, so one call is read once and its
gates are written to every alias. Cheaper, and it makes the duplication
measurable instead of inventing three rule sets where one exists.

<<<<<<< HEAD
Usage (no --country means every market, which is what `make eligibility` wants;
--country scopes a run so a workstream can measure its own before and after):
  python3 ETL/terms/encode_scheme_text_gates.py plan
  python3 ETL/terms/encode_scheme_text_gates.py run     [--country FR] [--limit N] [--dry-run]
  python3 ETL/terms/encode_scheme_text_gates.py publish [--country FR]
  python3 ETL/terms/encode_scheme_text_gates.py status  [--country FR]
=======
Usage:
  python3 ETL/terms/encode_scheme_text_gates.py plan    --country FR
  python3 ETL/terms/encode_scheme_text_gates.py run     --country FR [--limit N] [--dry-run]
  python3 ETL/terms/encode_scheme_text_gates.py publish --country FR
  python3 ETL/terms/encode_scheme_text_gates.py status  --country FR
>>>>>>> workstream-au-es-gates
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402
import unicodedata  # noqa: E402

MODEL = "claude-sonnet-5"
MAX_GATES = 8

GATE_FAMILIES = ["G1_nexus", "G2_size_ownership", "G3_financial",
                 "G4_borrower_model", "G5_use_of_funds", "G6_conditionality"]
ROLES = ["filter", "obligation", "programme_fact", "vague"]

# Who or what the rule is about. Only the first two may ever gate a founder.
SUBJECTS = ["applicant", "project", "final_beneficiary", "fund"]
FILTERABLE_SUBJECTS = {"applicant", "project"}

# What in the text carries the restriction. Only the first three assert one.
BASES = ["stated_requirement", "stated_exclusion", "stated_exhaustive_list",
         "enumeration_only", "programme_description"]
ASSERTING_BASES = {"stated_requirement", "stated_exclusion", "stated_exhaustive_list"}

# The intake vocabulary, READ rather than restated — same file and same reason
# as encode_gates.py: a hand-copied vocabulary drifts, and when it drifts
# nothing fails, the rule just silently stops gating.
_VOCAB_PATH = _Path(__file__).resolve().parents[2] / "data" / "vocabularies.json"
try:
    _VOCAB = json.loads(_VOCAB_PATH.read_text())
except FileNotFoundError:  # pragma: no cover
    raise SystemExit(f"missing {_VOCAB_PATH}. Generate it with:\n"
                     f"  cd website/frontend && npx tsx scripts/emit_vocabulary.ts")

def intake_fields() -> list[str]:
    """The founder attributes a gate may resolve to.

    Taken from encode_gates.FIELDS rather than restated, so the two passes can
    never disagree about what a resolvable field is.
    """
    import encode_gates
    return list(encode_gates.FIELDS)


SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"gates": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "gate_family": {"type": "string", "enum": GATE_FAMILIES},
            "subject": {"type": "string", "enum": SUBJECTS},
            "basis": {"type": "string", "enum": BASES},
            "role": {"type": "string", "enum": ROLES},
            "field": {"type": "string"},
            "requirement": {"type": "string"},
            "value": {"type": "string"},
            "quote": {"type": "string"},
        },
        "required": ["gate_family", "subject", "basis", "role", "field",
                     "requirement", "value", "quote"]}}},
    "required": ["gates"],
}

PROMPT_HEAD = """You are cutting machine-readable ELIGIBILITY GATES out of a public \
funding scheme's own eligibility text, for an engine that tells European founders which \
funds are open to them. A wrong "you qualify" costs a founder months; a wrong "you are \
excluded" hides a fund they could have had. Both are worse than saying nothing.

Read the text below and return one entry per distinct rule it states, at most {max_gates}. \
Every entry needs FIVE judgements plus a verbatim quote.

1. quote — VERBATIM text copied from the eligibility text, in its original language. It \
   is checked mechanically as a substring; anything you paraphrase, translate, join with \
   an ellipsis or tidy up is DROPPED. Copy one contiguous run of characters. Keep it under \
   300 characters.

2. subject — WHO OR WHAT the rule is about. This is the most important field here:
   - applicant: the entity that SUBMITS the application and would sign for the money.
   - project: the work being funded — where it happens, what it buys, what it costs.
   - final_beneficiary: someone who benefits DOWNSTREAM but cannot themselves apply.
     Watch for schemes with two tiers: an advisory body, relais, operator or
     intermediary applies, and the companies or people it then serves are described
     as "bénéficiaires finaux", "le bénéficiaire du conseil", or the audience the
     applicant must reach. THE AUDIENCE IS NOT THE APPLICANT. If the text says the
     eligible structures are advisory bodies and then describes the farms or SMEs
     they advise, the farms are final_beneficiary and the advisory bodies are the
     applicant.
   - fund: a fact about the programme itself — budget, aid rate, call window,
     the granting body.

3. basis — WHAT IN THE TEXT carries the restriction:
   - stated_requirement: the text states a condition applicants must meet
     ("les bénéficiaires sont les entreprises situées en France").
   - stated_exclusion: the text names who or what is NOT eligible
     ("ne sont pas éligibles : ...", "les secteurs suivants sont exclus").
   - stated_exhaustive_list: a list the text itself presents as closed
     ("seules les collectivités dotées d'un schéma directeur peuvent prétendre").
   - enumeration_only: a bare list of categories the scheme serves, with no
     statement that anything outside it is ineligible.
     THE TEST FOR EXHAUSTIVENESS: strike the list out of the sentence. Does what
     remains still assert that entities outside the list may not apply? If the only
     evidence that something is excluded is that it does not appear in the list,
     the answer is enumeration_only. Several of these catalogues publish
     eligibility as taxonomy facets and are maintained for local authorities, so
     their category set can simply have no row for companies — an absence in
     their taxonomy, not a rule in the scheme. THE ABSENCE OF A CATEGORY FROM A
     LIST IS NOT A RULE. Where a scheme really does exclude a kind of applicant,
     the text says so in prose, and that is stated_exclusion.
   - programme_description: descriptive prose carrying no restriction.

4. role — what the rule IS:
   - filter: a testable condition that could decide whether THIS APPLICANT qualifies.
   - obligation: binds the beneficiary AFTER an award or governs how money is spent
     and reported ("l'opération ne doit pas avoir commencé", reporting duties).
   - programme_fact: a fact about the fund — aid rate, budget, deadline, who the
     programme ultimately serves.
   - vague: too hedged or generic to test.
   Only subject=applicant or subject=project may be a filter, and only
   basis=stated_requirement / stated_exclusion / stated_exhaustive_list may be. If
   either is not met, the rule is real but it is not a filter — say programme_fact.

5. field — ONLY IF role is 'filter': which founder-supplied attribute decides it.
   Use 'none' when the condition is real but nothing we ask could decide it (a NAF
   code, a certification, a distance from a cycle route). For any non-filter role,
   field MUST be 'none'.

Available attributes:
{fields}

Also give `requirement`: one line of plain ENGLISH stating the rule from the applicant's
point of view, and `value`: the threshold or list it turns on, or "" if none. Where the
subject is final_beneficiary, the requirement line must SAY SO — begin it with
"Final beneficiary (not the applicant):" — so a human reading the row later cannot
mistake the audience for the eligible applicant.

Return ONLY the JSON object. Fewer, well-grounded rules beat many weak ones; a text that
states no real condition should return an empty list."""


def norm(s: str) -> str:
    """Normalise for substring comparison: unicode-fold, collapse whitespace.

    Deliberately does NOT strip punctuation. A quote check that ignores
    punctuation would accept a sentence stitched from two clauses, which is
    exactly the fabrication the check exists to catch.
    """
    s = unicodedata.normalize("NFKC", s or "")
    s = s.replace(" ", " ").replace("’", "'").replace("‘", "'")
    s = s.replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-").replace("…", "...")
    return re.sub(r"\s+", " ", s).strip().lower()


def text_key(s: str) -> str:
    return hashlib.sha256(norm(s).encode()).hexdigest()[:16]


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB, timeout=60)
    conn.row_factory = sqlite3.Row
    return conn


<<<<<<< HEAD
def work_rows(conn: sqlite3.Connection, country: str | None, redo: bool) -> list[sqlite3.Row]:
=======
def work_rows(conn: sqlite3.Connection, country: str, redo: bool) -> list[sqlite3.Row]:
>>>>>>> workstream-au-es-gates
    """Instruments with text and nothing cut from it yet.

    `redo` re-reads instruments this script has already processed (matched on
    encoding_method, so a re-run never disturbs gates another pass owns).
    """
    extra = "" if redo else (
        " AND NOT EXISTS (SELECT 1 FROM eligibility_gates g "
        "WHERE g.instrument_id = fi.id)")
    return conn.execute(f"""
        SELECT fi.id, fi.name, fi.eligibility_text, fi.eligibility_source_url
          FROM funding_instruments fi
<<<<<<< HEAD
         WHERE (? IS NULL OR fi.country = ?) AND fi.is_framework = 0
           AND fi.eligibility_text IS NOT NULL
           AND length(trim(fi.eligibility_text)) > 40{extra}
         ORDER BY fi.id""", (country, country)).fetchall()
=======
         WHERE fi.country = ? AND fi.is_framework = 0
           AND fi.eligibility_text IS NOT NULL
           AND length(trim(fi.eligibility_text)) > 40{extra}
         ORDER BY fi.id""", (country,)).fetchall()
>>>>>>> workstream-au-es-gates


def group_by_text(rows: list[sqlite3.Row]) -> dict[str, list[sqlite3.Row]]:
    groups: dict[str, list[sqlite3.Row]] = {}
    for r in rows:
        groups.setdefault(text_key(r["eligibility_text"]), []).append(r)
    return groups


<<<<<<< HEAD
=======
def scoreable(conn: sqlite3.Connection, rows: list[sqlite3.Row]) -> tuple[int, int]:
    """How many of these rows can `gateFitScorer` ever score? (scoreable, total)

    WHY THIS IS THE FIRST QUESTION, not a footnote.

    `gateFitScorer` (shortlist.ts) groups leaves by `parent_id ?? id` and opens
    with `if (group.length < 2) continue`. It is a SIBLING discriminator: it
    ranks the leaves of one regime against each other and does nothing else. A
    row with no siblings is a group of one and is skipped, so a gate written to
    it is never evaluated by the ranker, however good the gate is.

    Spain's 88 BDNS convocatorias were all parent-less -- deliberately and
    correctly, since they come from dozens of bodies under dozens of regulatory
    bases and inventing a parent would assert a regime that does not exist. Every
    one of their 596 gates and 88 comparators is therefore unscoreable. The work
    was sound, passed every check, and could not move a number.

    So the plan states this before any money is spent. It is a fact about the
    ranker, tested against the rows in front of it, and it holds for any market:
    the next register that publishes standalone calls will hit it too.
    """
    ids = [r["id"] for r in rows]
    if not ids:
        return 0, 0
    qs = ",".join("?" * len(ids))
    # The regime key is exactly the scorer's: parent_id when there is one, else
    # the row's own id. Read from the same column the ranker reads.
    sizes = dict(conn.execute(
        f"""SELECT COALESCE(parent_id, id) AS regime, COUNT(*)
              FROM funding_instruments
             WHERE COALESCE(parent_id, id) IN (
                   SELECT COALESCE(parent_id, id) FROM funding_instruments
                    WHERE id IN ({qs}))
             GROUP BY 1""", ids).fetchall())
    keys = dict(conn.execute(
        f"SELECT id, COALESCE(parent_id, id) FROM funding_instruments "
        f"WHERE id IN ({qs})", ids).fetchall())
    return sum(1 for i in ids if sizes.get(keys.get(i), 0) > 1), len(ids)


>>>>>>> workstream-au-es-gates
def cmd_plan(args) -> None:
    conn = connect()
    rows = work_rows(conn, args.country, args.redo)
    groups = group_by_text(rows)
    dupes = {k: v for k, v in groups.items() if len(v) > 1}
<<<<<<< HEAD
    print(f"{len(rows)} {args.country or 'ALL'} instruments carry unencoded eligibility text")
    print(f"{len(groups)} distinct texts -> {len(groups)} model calls "
          f"({len(rows) - len(groups)} rows are aliases of another call)")
=======
    print(f"{len(rows)} {args.country} instruments carry unencoded eligibility text")
    print(f"{len(groups)} distinct texts -> {len(groups)} model calls "
          f"({len(rows) - len(groups)} rows are aliases of another call)")

    n_ok, n_all = scoreable(conn, rows)
    print(f"\nSCOREABLE BY THE RANKER: {n_ok} of {n_all} "
          f"({100 * n_ok / max(1, n_all):.0f}%)")
    if n_ok == 0:
        print("  NONE of these rows has a sibling. gateFitScorer skips groups of")
        print("  one, so every gate cut here would be written, checked, published")
        print("  -- and never evaluated. Spend nothing until they have a regime,")
        print("  or route the text somewhere the ranker reads (see")
        print("  encode_declared_catchment.py for the catchment route).")
    elif n_ok < n_all:
        print(f"  {n_all - n_ok} rows are parent-less and cannot be scored on gates;")
        print("  the estimate below still bills for their text.")
>>>>>>> workstream-au-es-gates
    if dupes:
        print("\naliased calls (one rule set, several names):")
        for v in sorted(dupes.values(), key=lambda g: -len(g)):
            print(f"  x{len(v)}: " + " | ".join(r["name"][:44] for r in v))
    print(f"\nestimated cost: ~${len(groups) * 0.02:.2f} (Sonnet 5, one call per text)")
    conn.close()


def build_prompt(fields: list[str]) -> str:
    import encode_gates
    lines = []
    for f in fields:
        if f == "none":
            continue
        vals = encode_gates.ENUM_VALUES.get(f) or encode_gates.BAND_ORDERS.get(f)
        lines.append(f"  {f}" + (f": {vals}" if vals else ""))
    lines.append("  none")
    return PROMPT_HEAD.format(max_gates=MAX_GATES, fields="\n".join(lines))


def extract_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return json.loads(text[text.find("{"): text.rfind("}") + 1])


def coerce(g: dict, source_text: str, fields: set[str]) -> tuple[dict | None, str]:
    """Apply every invariant that must hold whatever the model said.

    Returns (gate, reason_if_dropped). The invariants are the point of this
    function: they are the machine form of the two properties in the module
    docstring, and they hold for texts nobody has read yet.
    """
    quote = (g.get("quote") or "").strip()
    if len(quote) < 12:
        return None, "quote too short"
    if norm(quote) not in norm(source_text):
        return None, "quote not verbatim"

    subject = g.get("subject")
    basis = g.get("basis")
    role = g.get("role")
    field = g.get("field") or "none"
    if subject not in SUBJECTS or basis not in BASES or role not in ROLES:
        return None, "bad enum"

    # PROPERTY 1 — the eligible applicant is the entity that SUBMITS.
    if role == "filter" and subject not in FILTERABLE_SUBJECTS:
        role, field = "programme_fact", "none"
    # PROPERTY 2 — an enumeration is not an exclusion.
    if role == "filter" and basis not in ASSERTING_BASES:
        role, field = "programme_fact", "none"
    # A field we do not ask cannot decide anything, and a non-filter never has one.
    if role != "filter" or field not in fields:
        field = "none"

    return {
        "gate_family": g["gate_family"], "role": role, "field": field,
        "subject": subject, "basis": basis,
        "requirement": (g.get("requirement") or "").strip()[:600],
        "value": (g.get("value") or "").strip()[:200] or None,
        "quote": quote[:1200],
    }, ""


def cmd_run(args) -> None:
    import anthropic

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (checked env + .env.local)")
    conn = connect()
    rows = work_rows(conn, args.country, args.redo)
    groups = group_by_text(rows)
    keys = list(groups)
    if args.limit:
        keys = keys[: args.limit]
    fields = intake_fields()
    prompt = build_prompt(fields)
    fieldset = set(fields)
    print(f"reading {len(keys)} distinct texts covering "
          f"{sum(len(groups[k]) for k in keys)} instruments ({MODEL})")

    cl = anthropic.Anthropic()
    n_written = n_dropped = n_filters = 0
    drops: dict[str, int] = {}
    for n, key in enumerate(keys, 1):
        members = groups[key]
        lead = members[0]
        body = (f"Scheme name: {lead['name']}\n"
                f"Source: {lead['eligibility_source_url'] or 'unknown'}\n\n"
                f"Eligibility text:\n{lead['eligibility_text']}")
        res = cl.messages.create(
            model=MODEL, max_tokens=4000, thinking={"type": "disabled"},
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": prompt + "\n\n" + body}])
        text = "".join(b.text for b in res.content if b.type == "text")
        gates = extract_json(text).get("gates", [])[:MAX_GATES]

        kept = []
        for g in gates:
            ok, why = coerce(g, lead["eligibility_text"], fieldset)
            if ok is None:
                n_dropped += 1
                drops[why] = drops.get(why, 0) + 1
                continue
            kept.append(ok)
        n_filters += sum(1 for k in kept if k["role"] == "filter")
        print(f"  [{n}/{len(keys)}] {lead['name'][:52]:54} "
              f"{len(kept)} gates ({sum(1 for k in kept if k['role']=='filter')} filters)"
              f"{' x' + str(len(members)) if len(members) > 1 else ''}")
        if args.dry_run:
            for k in kept:
                print(f"        {k['role']:14} {k['field']:18} {k['subject']:18}"
                      f" {k['basis']:22} {k['requirement'][:70]}")
            continue

        for inst in members:
            for i, k in enumerate(kept):
                conn.execute("""
                    INSERT INTO eligibility_gates
                      (instrument_id, gate_key, gate_family, requirement, value,
                       intake_field, quote, source_file, source_locator,
                       verification_level, verify_note, gate_role,
                       intake_field_resolved, encoding_method, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'none', ?, ?, ?, 'llm_cited', ?, ?, ?,
                            'scheme_text_extract', CURRENT_TIMESTAMP)
                    ON CONFLICT (instrument_id, gate_key) DO UPDATE SET
                      gate_family=excluded.gate_family,
                      requirement=excluded.requirement, value=excluded.value,
                      quote=excluded.quote, source_locator=excluded.source_locator,
                      verify_note=excluded.verify_note,
                      gate_role=excluded.gate_role,
                      intake_field_resolved=excluded.intake_field_resolved,
                      encoding_method='scheme_text_extract',
                      updated_at=CURRENT_TIMESTAMP
                """, (inst["id"], f"scheme_text_{i}", k["gate_family"],
                      k["requirement"], k["value"], k["quote"],
                      "eligibility_text", inst["eligibility_source_url"],
                      f"subject={k['subject']}; basis={k['basis']}",
                      k["role"], k["field"]))
                n_written += 1
        conn.commit()

    conn.close()
    print(f"\nwrote {n_written} gate rows ({n_filters} distinct filters before fan-out), "
          f"dropped {n_dropped}")
    if drops:
        print("dropped because: " + ", ".join(f"{k}={v}" for k, v in sorted(drops.items())))
    if args.dry_run:
        print("[dry run] nothing written")


def cmd_status(args) -> None:
    conn = connect()
<<<<<<< HEAD
    cc = args.country or "FR"
=======
    cc = args.country
>>>>>>> workstream-au-es-gates
    has_text = ("FROM funding_instruments fi WHERE fi.country=? AND fi.is_framework=0 "
                "AND fi.eligibility_text IS NOT NULL AND length(fi.eligibility_text)>0")
    queries = [
        ("instruments with text", f"SELECT COUNT(*) {has_text}"),
        ("  ... and a gate", f"SELECT COUNT(*) {has_text} AND EXISTS"
         "(SELECT 1 FROM eligibility_gates g WHERE g.instrument_id=fi.id)"),
        ("  ... and an ENCODED gate", f"SELECT COUNT(*) {has_text} AND EXISTS"
         "(SELECT 1 FROM eligibility_gates g WHERE g.instrument_id=fi.id "
         "AND g.value_spec IS NOT NULL)"),
    ]
    print(f"=== {cc}, SQLite ===")
    for label, sql in queries:
        print(f"{label:26} {conn.execute(sql, (cc,)).fetchone()[0]:>5}")
    print("\nrows written by this script, by role:")
    for role, n, enc in conn.execute(
        """SELECT g.gate_role, COUNT(*), COUNT(g.value_spec)
             FROM eligibility_gates g JOIN funding_instruments fi ON fi.id=g.instrument_id
            WHERE fi.country=? AND g.gate_key LIKE 'scheme_text_%'
            GROUP BY 1 ORDER BY 2 DESC""", (cc,)):
        print(f"  {str(role):16} {n:5}  encoded={enc}")
    print("\nby subject (verify_note):")
    for note, n in conn.execute(
        """SELECT g.verify_note, COUNT(*) FROM eligibility_gates g
             JOIN funding_instruments fi ON fi.id=g.instrument_id
            WHERE fi.country=? AND g.gate_key LIKE 'scheme_text_%'
            GROUP BY 1 ORDER BY 2 DESC""", (cc,)):
        print(f"  {str(note):58} {n:5}")
    conn.close()


# Columns published for a gate row. Kept explicit rather than SELECT *: the
# publish is scoped to rows this script owns, so it must never carry a column
# another pass is mid-way through writing.
#
# Rows are identified by GATE_KEY, never by encoding_method. `encode_gates.py
# encode` sets encoding_method='llm_encode' when it fills in a value_spec, so a
# provenance-keyed scope loses exactly the rows that gained a comparator --
# which is to say it publishes everything except the work that mattered. The
# gate_key is this script's own and nothing else writes it.
OWNED = "g.gate_key LIKE 'scheme_text_%'"
PUB_COLS = ["instrument_id", "gate_key", "gate_family", "requirement", "value",
            "value_spec", "intake_field", "quote", "source_file", "source_locator",
            "verification_level", "verify_note", "gate_role",
            "intake_field_resolved", "encoding_method"]


def cmd_publish(args) -> None:
    """Mirror this script's rows into Postgres, scoped.

    Deliberately not `migrate_to_postgres.py`: that is a full truncate and
    reinsert of everything currently in SQLite, which would publish any other
    pass's in-flight work alongside this one. Scoped, so what ships is what was
    measured.
    """
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set (expected in the repo-root .env.local)")
    conn = connect()
    rows = conn.execute(f"""
        SELECT {', '.join('g.' + c for c in PUB_COLS)}
          FROM eligibility_gates g JOIN funding_instruments fi ON fi.id = g.instrument_id
<<<<<<< HEAD
         WHERE (? IS NULL OR fi.country = ?) AND g.gate_key LIKE 'scheme_text_%'""",
                        (args.country, args.country)).fetchall()
    print(f"{len(rows)} rows to publish for {args.country or 'ALL'}")
=======
         WHERE fi.country = ? AND g.gate_key LIKE 'scheme_text_%'""",
                        (args.country,)).fetchall()
    print(f"{len(rows)} rows to publish for {args.country}")
>>>>>>> workstream-au-es-gates
    if args.dry_run:
        print("[dry run] nothing written")
        return
    import psycopg2
    pg = psycopg2.connect(dsn)
    cols = ", ".join(PUB_COLS)
    ph = ", ".join(["%s"] * len(PUB_COLS))
    sets = ", ".join(f"{c} = EXCLUDED.{c}" for c in PUB_COLS
                     if c not in ("instrument_id", "gate_key"))
    with pg, pg.cursor() as cur:
        cur.executemany(
            f"INSERT INTO eligibility_gates ({cols}) VALUES ({ph}) "
            f"ON CONFLICT (instrument_id, gate_key) DO UPDATE SET {sets}",
            [tuple(r[c] for c in PUB_COLS) for r in rows])
    pg.close()
    print(f"published {len(rows)} gate rows to Postgres")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, fn in (("plan", cmd_plan), ("run", cmd_run),
                     ("status", cmd_status), ("publish", cmd_publish)):
        p = sub.add_parser(name)
<<<<<<< HEAD
        # No default country: `make eligibility` must convert every market's
        # text, not the one a workstream happened to be looking at. --country
        # scopes a run for measurement, exactly as it does on encode_gates.
        p.add_argument("--country", default=None)
=======
        p.add_argument("--country", default="FR")
>>>>>>> workstream-au-es-gates
        p.add_argument("--limit", type=int, default=0)
        p.add_argument("--dry-run", action="store_true")
        p.add_argument("--redo", action="store_true",
                       help="re-read instruments already processed")
        p.set_defaults(func=fn)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
