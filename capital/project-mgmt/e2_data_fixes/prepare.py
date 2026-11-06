"""E2 (2026-11-06): founder-facing data defects the founder-tier checks flag,
prepared for the owner to review and apply. NOTHING HERE WRITES.

    python3 project-mgmt/e2_data_fixes/prepare.py

reads the live corpus through CAPITAL_RO_DATABASE_URL (the read-only role:
it cannot write even if this file were wrong), and writes, beside itself:

  dry_run_diff.txt   every row each fix touches: before -> after, and whether
                     the row is still in the state the fix was written for
  fixes.sql          the same changes as guarded UPDATEs in ONE transaction
                     that ends in ROLLBACK; the owner changes it to COMMIT

Every UPDATE is guarded on the value it replaces, so a row somebody has
changed since is left alone (0 rows) rather than overwritten. Every replaced
value is kept: in verify_note / name_basis on the row, and verbatim in
dry_run_diff.txt. The same changes are proposed for the durable reference
files (proposed_reference_entries.json) so a rebuild does not undo them;
merging that is part of applying.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import psycopg

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def ro_url() -> str:
    url = os.environ.get("CAPITAL_RO_DATABASE_URL", "").strip()
    if not url:
        for line in (ROOT / ".env.local").read_text().splitlines():
            if line.startswith("CAPITAL_RO_DATABASE_URL="):
                url = line.split("=", 1)[1].strip()
    if not url:
        raise SystemExit("CAPITAL_RO_DATABASE_URL is not set")
    return url


def q(s: str | None) -> str:
    return "NULL" if s is None else "'" + s.replace("'", "''") + "'"


# ── 1. A row named after the body that grants it (check_body_named_rows) ─────
# Names taken from the funder's own page (H1), read 2026-11-06.
NAMES = [
    ("innovasjon_norge_loan_lowrisk", "Innovasjon Norge", "Lavrisikolån",
     "https://www.innovasjonnorge.no/tjeneste/lavrisikolan (H1 'Lavrisikolån', read 2026-11-06)"),
    ("innovasjon_norge_loan_risk", "Innovasjon Norge", "Risikolån",
     "https://www.innovasjonnorge.no/seksjon/lan (product 'Risikolån', read 2026-11-06)"),
    ("bpifrance_inov", "Bpifrance", "Concours d'innovation i-Nov",
     "https://www.bpifrance.fr/nos-appels-a-projets-concours/appel-a-projets-concours-dinnovation-i-nov "
     "(the eligibility_source_url of this row; page title 'Appel à projets Concours d'innovation i-Nov'; "
     "the page answered 403 to an automated read on 2026-11-06, so CONFIRM BY EYE before committing)"),
    # bpifrance_innovup_leader_idf: NOT proposed. Its own source
    # (https://leaderpia.iledefrance.fr/) now titles itself 'France 2030
    # régionalisé Île-de-France' and names four other calls, none of them this
    # one; no register programme_name names it either. Owner decision.
]

# ── 2. A comparator asks a question the answer cannot determine
#       (check_field_matches_demand) ──────────────────────────────────────────
# Chips JU KDT national-funding rules: each turns on a partner from ONE named
# country, asked as "three or more partners?". Quarantined the way the
# override file does it: the requirement keeps showing, the verdict stops.
QUARANTINE = [
    ("chips_ju_kdt_unknown", g, "consortium",
     "national rule turns on a partner from one named country; the consortium "
     "question names no country, so a truthful yes/no cannot decide it")
    for g in ("G1-05", "G1-06", "G1-07", "G1-08")
]

# ── 3. A positive country rule no answer can satisfy (check_country_gates) ──
# eit_digital_vap g1_vip_location lists 'Turkey', which is not a country in the
# intake's canon, so that VALUE can never match. The rest of the list stands.
COUNTRY_DROP = [("eit_digital_vap", "g1_vip_location", "Turkey")]

# ── 4. 'Who may apply' text naming a population that cannot apply
#       (check_applicant_identity) ─────────────────────────────────────────
# `replace`, per reference/applicant_identity_repairs.json: the funder's own
# words, reordered so the submitter leads, with a structural label naming each
# population. No new claims: every clause is in the current text.
IDENTITY = [
    ("satr_it_equity__sa_57625__banca_del_mezzogiorno_mediocredito_centrale_s_p_",
     "https://www.mimit.gov.it/it/incentivi/fondo-di-garanzia-per-le-pmi",
     "Chi presenta la domanda: la domanda non si presenta direttamente al Fondo; "
     "va richiesta alla banca, all'intermediario finanziario o al confidi che concede "
     "il finanziamento, il quale inoltra la richiesta di garanzia al Fondo. "
     "Imprese che possono beneficiare della garanzia: micro, piccole e medie imprese "
     "iscritte al Registro delle imprese e professionisti titolari di partita IVA, su "
     "tutto il territorio nazionale e in tutti i settori economici con la sola "
     "esclusione delle attività finanziarie e assicurative."),
    ("satr_nl_rnd__sa_107606__ministerie_van_economische_zaken_en_klimaat",
     "https://www.nationaalgroeifonds.nl/overzicht-lopende-projecten/thema-sleuteltechnologieen-en-valorisatie/nxtgen-hightech",
     "Wie dient in: deelname loopt via consortia binnen een NXTGEN Hightech-project; "
     "de subsidie wordt via stichting NXTGEN Hightech en RVO verstrekt onder de "
     "Subsidieregeling Nationaal Groeifonds (referentie NGFNH2201). "
     "Deelnemers: bedrijven (van start-ups en mkb tot grote ondernemingen) en "
     "kennisinstellingen. Voorwaarden zijn onder meer dat elke deelnemer in het "
     "samenwerkingsverband minimaal 125.000 euro subsidie ontvangt, dat de activiteiten "
     "zonder subsidie niet of veel later zouden plaatsvinden, en dat ondertekende, "
     "onvoorwaardelijke cofinancieringsverklaringen worden meegeleverd. Voor het "
     "kennisdeel schrijft NWO aparte open calls uit waarop kennisinstellingen samen "
     "met bedrijfspartners kunnen indienen."),
]


def main() -> None:
    diff: list[str] = []
    sql: list[str] = ["-- Generated by project-mgmt/e2_data_fixes/prepare.py. Review dry_run_diff.txt first.",
                      "-- Every UPDATE is guarded on the value it replaces. Ends in ROLLBACK: change to COMMIT.",
                      "SET search_path = capital, public;", "BEGIN;", ""]
    with psycopg.connect(ro_url()) as conn, conn.cursor() as cur:
        cur.execute("SET search_path = capital, public")
        diff.append("== 1. body-named rows -> the funder's own product name")
        for iid, was, new, basis in NAMES:
            cur.execute("SELECT name, name_source, name_basis FROM funding_instruments WHERE id=%s", (iid,))
            r = cur.fetchone()
            state = "MATCHES" if r and r[0] == was else f"CHANGED SINCE (now {r!r})"
            diff.append(f"  {iid}: name {r[0] if r else None!r} -> {new!r}; name_source "
                        f"{r[1] if r else None!r} -> 'curated'  [{state}]\n      basis: {basis}")
            sql.append(f"UPDATE funding_instruments SET name = {q(new)}, name_source = 'curated',\n"
                       f"       name_basis = {q('was ' + repr(was) + ' (the granting body); ' + basis)}, updated_at = now()\n"
                       f" WHERE id = {q(iid)} AND name = {q(was)};")
        diff.append("  bpifrance_innovup_leader_idf: NOT CHANGED (owner decision; see prepare.py)")

        diff.append("\n== 2. comparators that cannot be decided by the answer -> quarantined")
        for iid, gk, field, why in QUARANTINE:
            cur.execute("SELECT intake_field_resolved, value_spec, encoding_method, left(requirement,140) "
                        "FROM eligibility_gates WHERE instrument_id=%s AND gate_key=%s", (iid, gk))
            r = cur.fetchone()
            spec = (r[1] if isinstance(r[1], str) else json.dumps(r[1], ensure_ascii=False)) if r and r[1] is not None else None
            state = "MATCHES" if r and r[0] == field else f"CHANGED SINCE ({r!r})"
            diff.append(f"  {iid}/{gk}: field {r[0] if r else None!r} -> 'none', value_spec {spec} -> NULL "
                        f"[{state}]\n      {r[3] if r else ''}")
            note = f" | encoding override (E2 2026-11-06): {why}; was {field} {spec}"
            sql.append(f"UPDATE eligibility_gates SET intake_field_resolved = 'none', value_spec = NULL,\n"
                       f"       encoding_method = 'curated_override', verify_note = COALESCE(verify_note,'') || {q(note)}\n"
                       f" WHERE instrument_id = {q(iid)} AND gate_key = {q(gk)} AND intake_field_resolved = {q(field)};")

        diff.append("\n== 3. a country value no founder can give -> dropped from the list")
        for iid, gk, val in COUNTRY_DROP:
            cur.execute("SELECT value_spec FROM eligibility_gates WHERE instrument_id=%s AND gate_key=%s", (iid, gk))
            r = cur.fetchone()
            raw = r[0] if r else None
            spec = json.loads(raw) if isinstance(raw, str) else raw
            new = dict(spec or {})
            new["allowed"] = [v for v in (spec or {}).get("allowed", []) if v != val]
            state = "MATCHES" if spec and val in spec.get("allowed", []) else "CHANGED SINCE"
            diff.append(f"  {iid}/{gk}: allowed {len((spec or {}).get('allowed', []))} -> {len(new['allowed'])} "
                        f"(drops {val!r}) [{state}]\n      before: {json.dumps(spec, ensure_ascii=False)}")
            note = f" | E2 2026-11-06: dropped {val!r} (not in the intake country canon, so it can match no answer); was {json.dumps(spec, ensure_ascii=False)}"
            sql.append(f"UPDATE eligibility_gates SET value_spec = {q(json.dumps(new, ensure_ascii=False))},\n"
                       f"       verify_note = COALESCE(verify_note,'') || {q(note)}\n"
                       f" WHERE instrument_id = {q(iid)} AND gate_key = {q(gk)} AND value_spec = {q(raw)};")

        diff.append("\n== 4. 'who may apply' text -> the submitter leads (same words, reordered)")
        for iid, url, text in IDENTITY:
            cur.execute("SELECT eligibility_text, eligibility_source_url FROM funding_instruments WHERE id=%s", (iid,))
            r = cur.fetchone()
            diff.append(f"  {iid} ({url})\n    BEFORE: {r[0] if r else None}\n    AFTER:  {text}")
            sql.append(f"UPDATE funding_instruments SET eligibility_text = {q(text)}, updated_at = now()\n"
                       f" WHERE id = {q(iid)} AND eligibility_text = {q(r[0] if r else '')};")
    sql += ["", "-- Expect: 3 + 4 + 1 + 2 = 10 rows. Then regenerate the site data (`make data`)",
            "-- and rebuild the snapshot-derived artifacts; see README.md.", "ROLLBACK;", ""]
    (HERE / "dry_run_diff.txt").write_text("\n".join(diff) + "\n")
    (HERE / "fixes.sql").write_text("\n".join(sql))
    print("\n".join(diff))


if __name__ == "__main__":
    main()
