"""
Load EIC Data Hub export into SQLite.

The export has multi-line project summaries with unescaped quotes that break
standard CSV parsing. Workaround: detect record boundaries by the pattern
that every record starts with `"<digits>";` (the PIC field). Concatenate
continuation lines into the previous record before parsing.
"""

import csv
import re
import sqlite3
import io
from pathlib import Path

_ROOT = Path(__file__).parent.parent
CSV_PATH = _ROOT / "data" / "raw" / "eic_datahub_export_20260520.csv"
DB_PATH = _ROOT / "db.sqlite"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"

RECORD_START = re.compile(r'^"\d+";')


def reconstruct_records(path):
    records = []
    current = ""
    with open(path, encoding="utf-8-sig") as f:
        header = f.readline()
        records.append(header.rstrip("\n"))
        for line in f:
            if RECORD_START.match(line):
                if current:
                    records.append(current.rstrip("\n"))
                current = line
            else:
                current += " " + line.lstrip()
        if current:
            records.append(current.rstrip("\n"))
    return records


_LENIENT_SPLIT_RE = re.compile(r'";\s*"')


def _parse_lenient(record_line, expected_n):
    """Fallback for records whose internal unescaped quotes break csv.reader.

    The EIC export uses '";"' as the inter-field separator, so split on that
    literal and strip the outer quotes. Unescaped internal quotes get absorbed
    into whichever text field they live in (typically project_summary). If the
    field count still doesn't match expected, give up — record is too damaged.
    """
    s = record_line.strip()
    if not (s.startswith('"') and s.endswith('"')):
        return None
    inner = s[1:-1]
    fields = _LENIENT_SPLIT_RE.split(inner)
    if len(fields) != expected_n:
        return None
    return fields


def parse_records(records):
    buf = io.StringIO("\n".join(records))
    reader = csv.reader(buf, delimiter=';', quotechar='"', quoting=csv.QUOTE_ALL)
    rows = list(reader)
    headers = rows[0]
    parsed = []
    recovered = 0
    skipped = 0
    for raw_record, r in zip(records[1:], rows[1:]):
        if len(r) == len(headers):
            parsed.append(dict(zip(headers, r)))
            continue
        # Fallback: try the lenient split before giving up
        fields = _parse_lenient(raw_record, len(headers))
        if fields is not None:
            parsed.append(dict(zip(headers, fields)))
            recovered += 1
        else:
            skipped += 1
    if recovered:
        print(f"  Recovered {recovered} rows via lenient parser (unescaped internal quotes)")
    return parsed, skipped


def init_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    conn = sqlite3.connect(DB_PATH)
    with open(SCHEMA_PATH) as f:
        conn.executescript(f.read())
    conn.commit()
    return conn


def normalize_amount(s):
    if not s or s.strip() == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def normalize_date(s):
    if not s or s.strip() == "":
        return None
    return s.strip()


def programme_to_source(programme):
    mapping = {
        "Accelerator": "eic_accelerator",
        "Pathfinder": "eic_pathfinder",
        "Transition": "eic_transition",
    }
    return mapping.get(programme, f"eic_{programme.lower()}" if programme else "eic_unknown")


def load(conn, rows):
    cur = conn.cursor()
    companies_inserted = 0
    events_inserted = 0
    pic_to_company_id = {}

    for r in rows:
        pic = r.get("PIC", "").strip()
        name = r.get("Name", "").strip()
        if not name:
            continue

        if pic and pic in pic_to_company_id:
            company_id = pic_to_company_id[pic]
        else:
            cur.execute("""
                INSERT INTO companies
                    (canonical_name, raw_name, country, city, postal_code,
                     website, pic, entity_type, match_confidence, match_method)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                name, name, r.get("Country", ""), r.get("City", ""),
                r.get("Postal Code", ""), r.get("Website", ""),
                pic if pic else None,
                "unknown", "unmatched", "none"
            ))
            company_id = cur.lastrowid
            if pic:
                pic_to_company_id[pic] = company_id
            companies_inserted += 1

        cur.execute("""
            INSERT INTO public_funding_events
                (company_id, source, role, project_number, project_acronym,
                 project_title, project_summary, call_id, call_deadline,
                 project_started, project_ended, grant_amount_eur,
                 total_project_cost_eur, sector_tags_raw, woman_leadership,
                 coordinator_only, grant_amount_basis)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'eic_eu_grant')
        """, (
            company_id,
            programme_to_source(r.get("Programme", "")),
            r.get("Role", "").lower(),
            r.get("Project Number", ""),
            r.get("Acronym", ""),
            r.get("Title", ""),
            r.get("Project summary", ""),
            r.get("Call", ""),
            normalize_date(r.get("Call Deadline", "")),
            normalize_date(r.get("Project Started", "")),
            normalize_date(r.get("Project Ended", "")),
            normalize_amount(r.get("Partner Grant", "")),
            normalize_amount(r.get("Total Costs", "")),
            r.get("Sectors", ""),
            1 if r.get("Woman Leadership", "").lower() == "yes" else 0,
        ))
        events_inserted += 1

    conn.commit()
    return companies_inserted, events_inserted


if __name__ == "__main__":
    print("Reconstructing records (stitching multi-line fields)...")
    records = reconstruct_records(CSV_PATH)
    print(f"  Reconstructed {len(records)} records (incl. header)")

    print("Parsing CSV...")
    rows, skipped = parse_records(records)
    print(f"  Parsed {len(rows)} rows, skipped {skipped}")

    print("Initializing database...")
    conn = init_db()

    print("Loading into SQLite...")
    n_companies, n_events = load(conn, rows)
    print(f"  Inserted {n_companies} unique companies, {n_events} funding events")

    conn.close()
    print(f"\nDB written to {DB_PATH}")
