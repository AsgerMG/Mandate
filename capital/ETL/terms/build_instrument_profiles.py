"""Build and embed one "what this fund actually funds" profile per instrument.

WHY THIS EXISTS (the bug it fixes)
----------------------------------
`embed_eligibility.py` embeds eligibility GATES AND CLAUSES — legal
requirements. Retrieval against a founder's company description then compares
two different semantic spaces, and it shows: querying "predictive maintenance
software for railway rolling stock" returned IPCEI's "only depreciation costs
incurred during the construction period" above Europe's Rail, and
"immunotherapy for solid tumours" returned EIT Urban Mobility. Europe's Rail IS
embedded (13 chunks) — the corpus was never the problem. Rule text simply is
not a description of what a fund funds.

So this builds the document that SHOULD be matched against, per instrument:

  1. Identity        — name, administering body, country, capital type, family.
  2. Stated scope    — the G5_use_of_funds sentences, minus cost/admin prose
                       (see ADMIN_NOISE; CHP's "solid oxide" cost rule is why
                       "solid tumours" matched the hydrogen fund).
  3. Demonstrated    — REAL project titles this instrument has funded, from the
     scope            events corpus. This is the corpus's unique asset and by
                       far the strongest signal: Clean Aviation's own titles are
                       "HYdrogen DEmonstrator for Aviation" and "Hybrid ElectriC
                       regional Aircraft", which no legal text conveys.

Sectors are deliberately excluded — see the note in build_profiles().

282,867 of 308,469 non-duplicate events (92%) carry a project_title, and
coverage is effectively 100% on the high-volume instruments.

`eligibility_embeddings` is KEPT and unchanged — it is the right index for RAG
over requirements (what a fund DEMANDS). This is the index for matching (what a
fund FUNDS). Two different questions, two different indexes.

Storage follows the lesson from eligibility_embeddings (see
website/build/postgres_schema.sql): keyed on the natural key, and deliberately
NO foreign key to funding_instruments, because migrate_to_postgres.py
truncate-and-reloads that table with CASCADE and silently destroyed 3,327
embeddings that way.

Usage:
  python3 ETL/terms/build_instrument_profiles.py status
  python3 ETL/terms/build_instrument_profiles.py run [--limit N] [--rebuild]
  python3 ETL/terms/build_instrument_profiles.py show <instrument_id>
  python3 ETL/terms/build_instrument_profiles.py query "text" [-k 5]
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

import argparse
import json
import os
import re
import sqlite3

import psycopg
import voyageai

MODEL = "voyage-3.5"
BATCH = 64
# Titles are the strongest signal, but a fund with 27,000 events must not
# produce a 27,000-title document: past a few dozen distinct titles the marginal
# information is ~0 and the embedding just gets blurrier.
MAX_TITLES = 40
MAX_PROFILE_CHARS = 6000
# Above this title-diversity ratio an instrument is treated as holding real
# project titles no matter what the classifier says. See cmd_classify_titles().
MAX_SCHEME_DIVERSITY = 0.10
# Same anti-pattern as relevance.ts: keep stated scope, drop cost/admin prose.
ADMIN_NOISE = re.compile(
    r"\b(cost|costs|purchase|purchases|equipment|infrastructure|depreciation|"
    r"subcontract|subcontracting|page limit|admissibility|vat|accounts|"
    r"percentage|allocated|duration|coordinator|invoice|overhead|declared)\b",
    re.I,
)
# G5 only. G1_nexus reads thematic but is overwhelmingly geography and
# consortium boilerplate ("Entities established in the UK are non-eligible...",
# "Consortia must include at least one independent legal entity..."), which
# padded Clean Aviation's profile with ~900 chars of noise and dilutes the
# embedding. Same call, same reason, as relevance.ts.
THEMATIC_FAMILIES = ("G5_use_of_funds",)


def connect_pg():
    url = os.environ.get("DATABASE_URL")
    if not url:
        _sys.exit("DATABASE_URL not set (add to .env.local)")
    return psycopg.connect(url)


def voyage_client() -> voyageai.Client:
    key = os.environ.get("VOYAGE_KEY")
    if not key:
        _sys.exit("VOYAGE_KEY not set (add to the repo-root .env.local)")
    return voyageai.Client(api_key=key)


def readable(slug: str) -> str:
    return slug.replace("_", " ").strip()


def norm_title(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip()


TITLE_KIND_CACHE = DB.parent / "instrument_title_kind.json"
CLASSIFY_MODEL = "claude-haiku-4-5"


def load_title_kinds() -> dict[str, str]:
    """instrument_id -> 'project' | 'scheme'. Absent = assume 'project'."""
    if not TITLE_KIND_CACHE.exists():
        return {}
    import json
    return json.loads(TITLE_KIND_CACHE.read_text())


def cmd_classify_titles(args) -> None:
    """Classify, per instrument, whether project_title holds projects or aid
    schemes. Language-agnostic (this corpus spans ~20 languages), cached, and
    only ever run when the corpus gains instruments."""
    import json
    import anthropic

    # Sample the titles shared by the MOST distinct companies, not an arbitrary
    # alphabetical slice. A scheme name recurs across many companies by
    # definition, so the top of this ordering is where scheme-ness is visible;
    # an alphabetical sample missed it on satr_de_rnd (27,423 events, the
    # largest instrument in the corpus) and misclassified it as 'project'.
    sq = sqlite3.connect(DB)
    rows: dict[str, list[str]] = {}
    for iid, title, _firms in sq.execute(
        """SELECT fis.instrument_id, e.project_title,
                  COUNT(DISTINCT e.company_id) firms
           FROM public_funding_events e
           JOIN funding_instrument_sources fis ON fis.source = e.source
           WHERE e.is_duplicate = 0 AND length(trim(coalesce(e.project_title,''))) > 8
           GROUP BY fis.instrument_id, lower(trim(e.project_title))
           ORDER BY fis.instrument_id, firms DESC"""
    ).fetchall():
        rows.setdefault(iid, []).append(norm_title(title)[:160])
    sq.close()

    # Sample from BOTH ends of the recurrence distribution. Sampling only the
    # most-shared titles is diagnostic for schemes but biases project-heavy
    # instruments toward "scheme" (ademe_aid and innovate_uk both flipped that
    # way — their few recurring titles read administratively even though the
    # instrument holds ~25,000 real project names). Sampling only rare titles
    # hides scheme-ness entirely (an alphabetical slice misread satr_de_rnd).
    # Showing the model both ends lets it judge which kind DOMINATES.
    samples: dict[str, list[str]] = {}
    for iid, lst in rows.items():
        samples[iid] = lst[:4] + lst[-4:] if len(lst) > 8 else lst

    # Title diversity = distinct titles / distinct funded companies. Schemes sit
    # very low (cdti_idi 0.025, satr_de_rnd 0.049, bdns_es 0.072) because many
    # firms share one scheme name; solo-project instruments sit above 1
    # (innovate_uk 1.30, ademe_aid 1.35). Consortium programmes fall in between
    # (europes_rail 0.068, clean_aviation 0.13, horizon_eu_cl4 0.162) since
    # partners share a real title, so the ratio ALONE cannot separate them.
    #
    # Used as a GUARD, not a classifier: an instrument is only marked 'scheme'
    # when the ratio is low AND the model agrees. Repeated runs showed the model
    # alone is unstable on this task — it flipped ademe_aid, innovate_uk and
    # horizon_eu_cl4 to 'scheme' on different runs, each time silently
    # discarding thousands of genuine project titles. The ratio gate makes those
    # false positives impossible, and requiring agreement protects the
    # low-diversity consortium programmes.
    diversity: dict[str, float] = {}
    sq = sqlite3.connect(DB)
    for iid, firms, n_titles in sq.execute(
        """SELECT fis.instrument_id,
                  COUNT(DISTINCT e.company_id),
                  COUNT(DISTINCT lower(trim(e.project_title)))
           FROM public_funding_events e
           JOIN funding_instrument_sources fis ON fis.source = e.source
           WHERE e.is_duplicate = 0 AND length(trim(coalesce(e.project_title,''))) > 8
           GROUP BY fis.instrument_id"""
    ).fetchall():
        diversity[iid] = n_titles / firms if firms else 1.0
    sq.close()

    cached = load_title_kinds()
    todo = {k: v for k, v in samples.items() if args.rebuild or k not in cached}
    print(f"classifying {len(todo)} instruments ({len(cached)} cached)")
    if not todo:
        return

    client = anthropic.Anthropic()
    ids = list(todo)
    out = dict(cached)
    CHUNK = 30
    for i in range(0, len(ids), CHUNK):
        chunk = ids[i : i + CHUNK]
        listing = "\n\n".join(
            f"id: {iid}\n" + "\n".join(f"  - {t}" for t in todo[iid]) for iid in chunk
        )
        schema = {
            "type": "object", "additionalProperties": False,
            "properties": {"results": {"type": "array", "items": {
                "type": "object", "additionalProperties": False,
                "properties": {"id": {"type": "string", "enum": chunk},
                               "kind": {"type": "string", "enum": ["project", "scheme"]}},
                "required": ["id", "kind"]}}},
            "required": ["results"],
        }
        res = client.messages.create(
            model=CLASSIFY_MODEL, max_tokens=6000, thinking={"type": "disabled"},
            output_config={"format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content":
                "For each funding instrument below, decide which kind of string DOMINATES its "
                "titles. You are shown a sample from both the most-repeated and the "
                "least-repeated titles, so weigh which kind is typical.\n\n"
                "'project' = titles of individual funded projects or products (e.g. "
                "'HYdrogen DEmonstrator for Aviation', 'Reliable AI and Data Optimisation'). "
                "These describe what a company is doing.\n"
                "'scheme' = names of aid schemes, laws, decrees, calls or budget lines "
                "(e.g. 'Richtlinie über die Gewährung von Zuwendungen...', 'Resolución de 11 "
                "de junio de 2024 de la Presidencia del CDTI', 'Zentrales Innovationsprogramm "
                "Mittelstand'). These describe the funding programme, not any company's work.\n\n"
                "Titles may be in any European language. Judge the KIND of string, not its "
                "language.\n\n" + listing + "\n\nReturn ONLY the JSON object."}],
        )
        text = "".join(b.text for b in res.content if b.type == "text")
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = json.loads(text[text.find("{") : text.rfind("}") + 1])
        for r in parsed["results"]:
            # Agreement gate: only the model AND a low diversity ratio together
            # justify discarding an instrument's funded-title text.
            iid = r["id"]
            out[iid] = ("scheme"
                        if r["kind"] == "scheme" and diversity.get(iid, 1.0) < MAX_SCHEME_DIVERSITY
                        else "project")
        # Persist per chunk: a truncated response mid-run must not discard every
        # classification already paid for.
        TITLE_KIND_CACHE.write_text(json.dumps(out, indent=1, sort_keys=True))
        print(f"  {min(i + CHUNK, len(ids))}/{len(ids)}")

    TITLE_KIND_CACHE.write_text(json.dumps(out, indent=1, sort_keys=True))
    n_scheme = sum(1 for v in out.values() if v == "scheme")
    print(f"wrote {TITLE_KIND_CACHE}: {len(out)} classified, {n_scheme} scheme, "
          f"{len(out) - n_scheme} project")


def build_profiles(sq: sqlite3.Connection) -> list[tuple[str, str, int]]:
    """Assemble (instrument_id, profile_text, n_titles) for every instrument."""
    instruments = sq.execute(
        """SELECT id, name, administering_body, country, capital_type,
                  source_family_bucket, sample_project_titles, sector_mix,
                  award_p50, award_n
           FROM funding_instruments ORDER BY id"""
    ).fetchall()

    # Stated scope, per instrument.
    scope: dict[str, list[str]] = {}
    for iid, req in sq.execute(
        f"""SELECT instrument_id, requirement FROM eligibility_gates
            WHERE gate_family IN ({','.join('?' * len(THEMATIC_FAMILIES))})
              AND requirement IS NOT NULL AND length(trim(requirement)) > 25"""
    , THEMATIC_FAMILIES).fetchall():
        if ADMIN_NOISE.search(req):
            continue
        scope.setdefault(iid, []).append(norm_title(req))

    # Demonstrated scope: real project titles — but ONLY for instruments whose
    # project_title column actually holds projects.
    #
    # In the State Aid Transparency Register (and some national registers like
    # CDTI) project_title is the AID SCHEME: satr_de_rnd's raw titles are German
    # statute names ("Richtlinie über die Gewährung von Zuwendungen...",
    # "Bund-Länder-Gemeinschaftsaufgabe..."), and cdti_idi's are "Resolución de
    # 11 de junio de 2024 de la Presidencia del CDTI". Embedding legislation as
    # "what this fund funds" actively misdirects matching.
    #
    # Three deterministic discriminators were tried and all fail:
    #   * per-title company cardinality — a 30-partner Horizon consortium shares
    #     one real title across 30 companies and gets wrongly stripped;
    #   * source_family_bucket — cdti_idi and ademe_aid are both
    #     national_dev_banks, yet one holds schemes and the other real projects;
    #   * title diversity (distinct titles / distinct firms) — cleanly separates
    #     the extremes (cdti_idi 0.025, innovate_uk 1.30) but puts consortium
    #     programmes in the scheme range (europes_rail 0.068, clean_aviation
    #     0.13) precisely because partners share a title.
    # So this is classified semantically, once per instrument, and cached in
    # data/instrument_title_kind.json by the `classify-titles` subcommand.
    # Unclassified instruments are treated as projects (the common case).
    kinds = load_title_kinds()
    titles: dict[str, list[str]] = {}
    for iid, title, _n in sq.execute(
        """SELECT fis.instrument_id, e.project_title, COUNT(*) n
           FROM public_funding_events e
           JOIN funding_instrument_sources fis ON fis.source = e.source
           WHERE e.is_duplicate = 0
             AND e.project_title IS NOT NULL AND length(trim(e.project_title)) > 8
           GROUP BY fis.instrument_id, lower(trim(e.project_title))
           ORDER BY fis.instrument_id, n DESC"""
    ).fetchall():
        if kinds.get(iid) == "scheme":
            continue
        lst = titles.setdefault(iid, [])
        if len(lst) < MAX_TITLES:
            lst.append(norm_title(title))

    # Sectors are deliberately NOT included. The subsector taxonomy is thin (19
    # values, populated on ~12% of companies) and demonstrably mislabels: it
    # reported Clean Aviation's top sectors as "heat pumps hvac, batteries
    # storage". Feeding that into the embedding actively misdirects matching,
    # and the real project titles already carry sector information implicitly
    # and correctly. Revisit if the taxonomy is ever properly populated
    # (see the 94-subsector plan in project-mgmt/nace_taxonomy.md).

    out: list[tuple[str, str, int]] = []
    for (iid, name, body, country, capital, bucket, samples,
         sector_mix, award_p50, award_n) in instruments:
        # The event join above keys on `source`, which cannot express the SATR
        # split: a child is one granting authority WITHIN a source, so all 453
        # of them matched nothing and were profiled on their regime's
        # boilerplate alone. Every scheme in a country then read alike to the
        # embedding, which is how a Paris EdTech was matched to a Normandy
        # scheme and the national cinema fund.
        #
        # The per-child titles already exist, computed against each child's own
        # award history in populate_funding_instruments.py, and were being
        # selected here and dropped. Preferred where the join found nothing.
        if not titles.get(iid) and samples and kinds.get(iid) != "scheme":
            try:
                parsed = [norm_title(t) for t in json.loads(samples) if t and len(t.strip()) > 8]
            except (ValueError, TypeError):
                parsed = []
            if parsed:
                titles[iid] = parsed[:MAX_TITLES]
        parts: list[str] = []
        ident = name or iid
        if body and body != name:
            ident += f", administered by {body}"
        parts.append(f"{ident} ({country or 'EU'}) — {readable(capital or 'unknown')} funding.")
        if bucket:
            parts.append(f"Programme family: {readable(bucket)}.")
        if scope.get(iid):
            parts.append("What it funds: " + " ".join(scope[iid][:6]))
        if titles.get(iid):
            parts.append("Projects it has actually funded: " + "; ".join(titles[iid]) + ".")
        # WHO IT HAS ACTUALLY FUNDED, in words.
        #
        # State-aid schemes and development-bank lines carry no per-project
        # titles at all -- measured, zero distinct titles per leaf against
        # Horizon's 534 -- so their profiles came out at a mean of 240 characters
        # against Horizon's 4,058, and semantic matching could not separate them.
        # A founder describing themselves by sector then had nothing to match
        # against, and national schemes were retrieved at 47% regime recall
        # versus 75% for EU programmes.
        #
        # The sector mix is measured from the instrument's own award history and
        # was already in the corpus, used for scoring but never for retrieval.
        # Written out as words so it is in the same space as the founder's
        # description, rather than a number the embedding never sees.
        if sector_mix:
            try:
                mix = json.loads(sector_mix)
            except (ValueError, TypeError):
                mix = {}
            total = sum(mix.values()) or 0
            if total:
                top = sorted(mix.items(), key=lambda kv: -kv[1])[:4]
                named = [f"{readable(k)} ({100 * v / total:.0f}%)"
                         for k, v in top if v / total >= 0.05]
                if named:
                    parts.append("Sectors it has actually funded: " + ", ".join(named) + ".")
        # Scale, so a EUR 40k voucher and a EUR 5M grant stop reading alike.
        if award_p50 and (award_n or 0) >= 5:
            parts.append(f"Typical award: around EUR {award_p50:,.0f} "
                         f"across {award_n} recorded awards.")
        text = "\n".join(parts)[:MAX_PROFILE_CHARS]
        out.append((iid, text, len(titles.get(iid, []))))
    return out


def cmd_status(_args) -> None:
    sq = sqlite3.connect(DB)
    profiles = build_profiles(sq)
    sq.close()
    with_titles = sum(1 for _, _, n in profiles if n)
    avg = sum(len(t) for _, t, _ in profiles) / max(len(profiles), 1)
    pg = connect_pg()
    embedded = pg.execute("SELECT COUNT(*) FROM instrument_profiles").fetchone()[0]
    stale = pg.execute(
        """SELECT COUNT(*) FROM instrument_profiles p
           WHERE NOT EXISTS (SELECT 1 FROM funding_instruments fi WHERE fi.id = p.instrument_id)"""
    ).fetchone()[0]
    pg.close()
    print(f"instruments:                {len(profiles):,}")
    print(f"  with funded-project text: {with_titles:,}")
    print(f"  mean profile length:      {avg:,.0f} chars")
    print(f"embedded:                   {embedded:,}")
    print(f"orphaned (no instrument):   {stale:,}")


def cmd_show(args) -> None:
    sq = sqlite3.connect(DB)
    for iid, text, n in build_profiles(sq):
        if iid == args.instrument_id:
            print(f"--- {iid} ({n} titles, {len(text)} chars) ---\n{text}")
            break
    else:
        print(f"no such instrument: {args.instrument_id}")
    sq.close()


def cmd_run(args) -> None:
    sq = sqlite3.connect(DB)
    profiles = build_profiles(sq)
    sq.close()
    pg = connect_pg()
    client = voyage_client()

    if args.rebuild:
        with pg.cursor() as cur:
            cur.execute("DELETE FROM instrument_profiles")
        pg.commit()
        print("cleared existing profiles (--rebuild)")
    else:
        # An incremental run must still converge on the corpus as it is now.
        # Instruments are re-derived on every load and some ids legitimately
        # disappear; their vectors otherwise stay behind and keep matching
        # companies to a fund that no longer exists in the corpus.
        with pg.cursor() as cur:
            cur.execute("""
                DELETE FROM instrument_profiles p
                 WHERE NOT EXISTS (SELECT 1 FROM funding_instruments fi
                                    WHERE fi.id = p.instrument_id)
            """)
            dropped = cur.rowcount or 0
        pg.commit()
        if dropped:
            print(f"pruned {dropped:,} profiles whose instrument is gone")

    done_ids = {
        r[0] for r in pg.execute("SELECT instrument_id FROM instrument_profiles").fetchall()
    }
    todo = [p for p in profiles if p[0] not in done_ids and p[1].strip()]
    if args.limit:
        todo = todo[: args.limit]
    print(f"embedding {len(todo):,} instrument profiles ({MODEL}, batches of {BATCH})")

    done = 0
    for i in range(0, len(todo), BATCH):
        batch = todo[i : i + BATCH]
        result = client.embed([t[1] for t in batch], model=MODEL, input_type="document")
        rows = [
            (iid, text, vec, MODEL, n_titles)
            for (iid, text, n_titles), vec in zip(batch, result.embeddings)
        ]
        with pg.cursor() as cur:
            cur.executemany(
                """INSERT INTO instrument_profiles
                     (instrument_id, profile_text, embedding, model, n_titles)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (instrument_id) DO UPDATE
                     SET profile_text = EXCLUDED.profile_text,
                         embedding = EXCLUDED.embedding,
                         model = EXCLUDED.model,
                         n_titles = EXCLUDED.n_titles,
                         built_at = now()""",
                rows,
            )
        pg.commit()  # per-batch commit — kill-safe
        done += len(batch)
        print(f"  {done:,}/{len(todo):,}")
    pg.close()
    print(f"done: {done:,} profiles embedded.")


def cmd_query(args) -> None:
    pg = connect_pg()
    client = voyage_client()
    vec = client.embed([args.text], model=MODEL, input_type="query").embeddings[0]
    rows = pg.execute(
        """SELECT p.instrument_id, fi.name, fi.country, p.n_titles,
                  1 - (p.embedding <=> %s::vector) AS similarity
           FROM instrument_profiles p
           JOIN funding_instruments fi ON fi.id = p.instrument_id
           ORDER BY p.embedding <=> %s::vector
           LIMIT %s""",
        (vec, vec, args.k),
    ).fetchall()
    if not rows:
        print("no results — is the index built? (run `status`)")
    for iid, name, country, n_titles, sim in rows:
        print(f"[{sim:.3f}] {iid:34} {name} ({country}) · {n_titles} titles")
    pg.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(func=cmd_status)
    ct = sub.add_parser("classify-titles",
        help="classify per instrument whether project_title holds projects or aid schemes")
    ct.add_argument("--rebuild", action="store_true")
    ct.set_defaults(func=cmd_classify_titles)
    r = sub.add_parser("run")
    r.add_argument("--limit", type=int, default=0)
    r.add_argument("--rebuild", action="store_true",
                   help="delete and rebuild every profile (use after corpus changes)")
    r.set_defaults(func=cmd_run)
    s = sub.add_parser("show")
    s.add_argument("instrument_id")
    s.set_defaults(func=cmd_show)
    q = sub.add_parser("query")
    q.add_argument("text")
    q.add_argument("-k", type=int, default=5)
    q.set_defaults(func=cmd_query)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
