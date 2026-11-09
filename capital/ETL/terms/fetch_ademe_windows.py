"""ADEME's application windows, read off the pages ADEME publishes them on.

── The gap this closes ────────────────────────────────────────────────────
France is the corpus's worst market and 31% of its cases, and the worst thing
a memo can contain is a fund whose window has already shut: the founder spends
real effort on it before finding out. On 2026-08-07 workstream BE measured the
size of that exposure and left it open as "a loader job, not a policy one":

    of the 107 ADEME dispositif pages our rows cite, 102 resolve and 86 state a
    closing date -- while the open-data extract we ingest leaves `date_cloture`
    empty for 97 of 107.

`extract_ademe.py` reads `les-aides-financieres-de-l'ademe`, which is an AWARD
file: it publishes grants already made and has no application window in it at
all. So every ADEME window the corpus holds arrived through a second read of a
CATALOGUE page, and 29 of the 75 leaves had never had one taken.

── The two catalogues, and why both are needed ────────────────────────────
`agirpourlatransition.ademe.fr` -- ADEME's own portal -- returns HTTP 403
behind a Cloudflare interstitial on every path including robots.txt, re-checked
by this workstream. Per the standing rule that is where a fetcher stops; it is
NOT impersonated past. The pages are read instead through `web.archive.org`, a
public archive of a public page: no credential is presented, no access control
is circumvented, and nothing is passed off as a browser. Had ADEME put those
pages behind a login the archive would not make them ours to take, and this
reader would not exist.

  tee      `mission-transition-ecologique.beta.gouv.fr/api/programs/<slug>`
           ADEME's own advisory service. One JSON object per dispositif with
           `début de validité` / `fin de validité`, served 200, and -- the
           property that matters for liveness -- the per-slug endpoint still
           answers for dispositifs the index has dropped, so an aid that ENDED
           is readable rather than merely absent. 57 of the 209 programmes name
           ADEME as `opérateur de contact`.

  archive  `agirpourlatransition.ademe.fr/.../catalogue/aap/<slug>` through the
           Wayback CDX. ADEME's appel-à-projets pages state the round's window
           in machine-readable form:
               <div class="insertDate"> Du <time datetime="2024-01-09T14:00:00Z">
               au <time datetime="2024-03-07T14:00:00Z"> </div>
           These are the rows the TEE catalogue does not carry, because a
           catalogue of currently-open aid does not list a call from 2024. They
           are also, precisely, the rows a founder must not be handed.

The capture is re-resolved to the newest one the archive holds on every run,
never to the pinned timestamp a previous workstream stored. A pinned capture is
a fact that stops being true: three of these pages have been re-captured since
the timestamps in `eligibility_source_url` were written.

── The unit is the OBJECT WE HOLD ─────────────────────────────────────────
The same separation `liveness.ts` draws for Vinnova, and the one that decides
every write here. Our leaves include four AVELO rows (AVELO 2, AVELO 2.2,
AVELO 3 1ᵉʳ relevé, AVELO 3 2ⁿᵈ relevé) and three ORMAT rows (2023, 2024,
2025). Those are ROUNDS. A programme page states the programme's window, and
handing it to each round dates all of them alike -- which for ORMAT means
taking three rows the corpus correctly holds closed (2025-06-09) and asserting
they run to 31/12/2026. Reviving a dead call is the exact defect this
workstream exists to remove, arriving through the fix.

So a window is written from a page only where the page speaks for the row:

  exclusive page (one of our rows cites it)
      written, and it overrules what we hold. Rule Zero: the source decides.
  shared page (several of our rows cite it)
      the page is the parent of at least some of them, so it may only FILL a
      silence: never overwrite a date the row already carries, and therefore
      never move a row from closed to open. If the rows already disagree with
      each other the page is programme-level for certain, and the whole group
      is skipped and reported.

That is a property with a test, not a list of programme names, and it decides
the cases nobody has seen: the discriminator is how many of OUR rows the page
has to speak for, which is computable for any page from any source.

── What is claimed ────────────────────────────────────────────────────────
`scheme_end_date_basis` is always `call_deadline` here -- an appel à projets
deadline and a `fin de validité` are both this instrument's own application
window, and past means closed permanently. It is never `notified_duration`;
that basis belongs to a State-aid notification expiry, which is routinely
prolonged and is not a thing ADEME publishes.

`eligibility_source_url`, `_confidence` and `_fetched_at` describe the read that
produced `eligibility_text`, and this job read a DATE, not a text. So it leaves
all three exactly as the matcher set them: repointing the citation at whichever
capture this run used would assert the stored text came off that capture,
bumping `_fetched_at` would assert the text was re-confirmed, and the confidence
grades the MATCH between our leaf and that page -- which reading a date off it
tells you nothing about. The window's own provenance (page, field, capture date)
is written to data/raw/ademe_windows/readings.json and re-derived every run.

── Why it is a cron step and not a migration ──────────────────────────────
`scheme_end_date` is rebuilt from the extractors on every load, so a hand
UPDATE survives until the next rebuild and no longer. Worse, the inventory
decays on a CALENDAR: nothing upstream changes when a call shuts, so a
content-hash refresh like `renew.py` never fires and the corpus quietly goes on
offering it. That is the same failure Spain needed `refresh_open_calls.py` for.
This script is idempotent, re-reads both catalogues from scratch, and runs as a
step in `railway_cron.py` beside it.

It writes the one store (schema `capital`). Until 2026-11-05 it also copied
the windows into a SQLite cache the site snapshot was built from; that cache is
gone, and the snapshot builders read the store.

Exit codes match `renew.py`, which the cron runner already reads:
  0  every target resolved, or the only failures were rows still holding the
     window an earlier run read (see outcome())
  3  a target that holds no window failed to fetch, or more fetches failed
     than succeeded; the rest were written
  1  nothing could be read, or the corpus could not be written

Usage:
  python3 ETL/terms/fetch_ademe_windows.py --dry-run   # read + plan, no write
  python3 ETL/terms/fetch_ademe_windows.py --write     # the cron run
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import datetime as dt  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import time  # noqa: E402
import urllib.parse  # noqa: E402

from liveness import (  # noqa: E402
    CALL_DEADLINE, PUBLISHES_WINDOW, closed_sql, is_closed)
from ndb_ssl import fetch_text  # noqa: E402
from store import connect  # noqa: E402

#: The root whose leaves this reader speaks for. An input to a fetch job, not a
#: branch in any rule: the catalogues below are ADEME's, so the job is ADEME's.
ROOT_ID = "ademe_aid"

TEE_HOST = "mission-transition-ecologique.beta.gouv.fr"
TEE_API = f"https://{TEE_HOST}/api/programs/"
ADEME_HOST = "agirpourlatransition.ademe.fr"
CDX = "https://web.archive.org/cdx/search/cdx"
WAYBACK_RAW = "https://web.archive.org/web/{ts}id_/{url}"

#: Where the run writes what it read. Not the corpus -- Postgres is -- but the
#: record that lets the next run, and a human, see which page said what and how
#: old the capture behind it was.
READINGS = ROOT / "data" / "raw" / "ademe_windows" / "readings.json"

#: The archive is one host answering for every capture; a burst reads as abuse
#: and gets throttled to 503s, which is what a partial run looks like from the
#: outside. One request per second is unhurried and finishes 21 pages in under
#: a minute.
ARCHIVE_PAUSE_S = 1.0

#: The archive answers a cold URL by rebuilding it from tape, and a first
#: request that times out is very often followed by a fast second one. Two
#: further tries with a widening pause turns most of those into reads instead of
#: into a `failed` row that waits a week for the next cron.
ARCHIVE_TRIES = 3

#: A whole-run wall clock. The archive rebuilds a cold URL from tape and can sit
#: on a single request for minutes; measured here, one pass over 75 leaves ran
#: 20 minutes and one page alone took twelve. A cron step with no ceiling is a
#: cron step that can stop the census behind it, and the work is resumable by
#: construction -- what was read is written, what was not is reported and read
#: next week. So the deadline is a normal outcome (exit 3), not an error.
DEADLINE_MIN = 25

_WAYBACK_PREFIX = re.compile(r"^https?://web\.archive\.org/web/\d+(?:id_)?/")


def fetch_patiently(url: str, timeout: int) -> str | None:
    for attempt in range(ARCHIVE_TRIES):
        body = fetch_text(url, timeout=timeout)
        if body:
            return body
        time.sleep(ARCHIVE_PAUSE_S * (attempt + 1) * 3)
    return None


# ── Readers ────────────────────────────────────────────────────────────────
# Each returns a reading dict or None. `page` is the CANONICAL page, stripped
# of any capture timestamp, because that is what decides whether two of our
# rows are citing one page -- two captures of the same URL are one page.

def _iso(fr: str | None) -> str | None:
    """dd/mm/yyyy as the French catalogues write it -> ISO, or None."""
    if not fr:
        return None
    try:
        return dt.datetime.strptime(fr.strip(), "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None


def read_tee(url: str) -> dict | None:
    """ADEME's advisory catalogue. The slug is the last path segment."""
    slug = re.sub(r"[?#].*$", "", url).rstrip("/").rsplit("/", 1)[-1]
    if not slug:
        return None
    body = fetch_text(f"{TEE_API}{urllib.parse.quote(slug)}?is_questionnaire=false",
                      timeout=45)
    if not body:
        return None
    try:
        prog = json.loads(body)
    except json.JSONDecodeError:
        return None
    return {
        "reader": "tee",
        "page": f"https://{TEE_HOST}/aides-entreprise/{slug}",
        "end": _iso(prog.get("fin de validité")),
        "start": _iso(prog.get("début de validité")),
        "field": "fin de validité",
        "operator": prog.get("opérateur de contact"),
        "captured": None,
    }


def latest_capture(target: str) -> str | None:
    """Newest 200 capture the Wayback CDX holds for `target`, as a timestamp."""
    q = urllib.parse.urlencode({
        "url": target, "output": "json", "filter": "statuscode:200",
        "limit": "-1", "fl": "timestamp",
    })
    body = fetch_patiently(f"{CDX}?{q}", timeout=60)
    if not body:
        return None
    try:
        rows = json.loads(body)
    except json.JSONDecodeError:
        return None
    rows = [r for r in rows if r and r[0] != "timestamp"]
    return rows[-1][0] if rows else None


def read_ademe_archive(url: str) -> dict | None:
    """ADEME's own appel-à-projets page, through the archive.

    The window is the `insertDate` insert: `Du <time> au <time>`. Two stamps is
    a closed interval and the second is the deadline; one stamp is an opening
    date with no stated close, and is NOT read as a deadline -- an opening date
    written into `scheme_end_date` would close a fund that just opened.
    """
    target = _WAYBACK_PREFIX.sub("", url)
    ts = latest_capture(target)
    if not ts:
        return None
    time.sleep(ARCHIVE_PAUSE_S)
    html = fetch_patiently(WAYBACK_RAW.format(ts=ts, url=target), timeout=90)
    if not html:
        return None
    block = re.search(r'class="[^"]*insertDate[^"]*"[^>]*>(.*?)</div>', html, re.S)
    stamps = re.findall(r'<time datetime="([^"]+)"', block.group(1)) if block else []
    captured = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
    return {
        "reader": "archive",
        "page": target,
        "end": stamps[1][:10] if len(stamps) > 1 else None,
        "start": stamps[0][:10] if stamps else None,
        "field": "insertDate",
        "operator": "ADEME",
        "captured": captured,
        "capture_url": WAYBACK_RAW.format(ts=ts, url=target),
    }


def reader_for(url: str) -> str | None:
    host = urllib.parse.urlparse(_WAYBACK_PREFIX.sub("", url or "")).netloc
    if host == TEE_HOST:
        return "tee"
    if host == ADEME_HOST:
        return "archive"
    return None


# ── The write rule ─────────────────────────────────────────────────────────

def plan(rows: list[dict], readings: dict[str, dict]) -> tuple[list[dict], list[dict]]:
    """Decide, per row, whether the page it cites speaks for it.

    Returns (writes, skipped). See the module docstring: an exclusive page
    overrules what we hold; a shared page may only fill a silence, and a shared
    page whose rows already disagree is programme-level and is dropped whole.
    """
    citers: dict[str, list[dict]] = {}
    for r in rows:
        rd = readings.get(r["id"])
        if rd:
            citers.setdefault(rd["page"], []).append(r)

    writes, skipped = [], []
    for r in rows:
        rd = readings.get(r["id"])
        if rd is None:
            skipped.append({**r, "why": "no reading"})
            continue
        if not rd.get("end"):
            skipped.append({**r, "why": f"{rd['reader']}: page states no closing date"})
            continue
        group = citers[rd["page"]]
        held = (str(r["scheme_end_date"])[:10] if r["scheme_end_date"] else None)
        if len(group) > 1:
            dated = {str(g["scheme_end_date"])[:10] for g in group if g["scheme_end_date"]}
            if len(dated) > 1:
                skipped.append({**r, "why": f"shared page, rows already disagree "
                                            f"({sorted(dated)}) -> programme-level"})
                continue
            if held:
                skipped.append({**r, "why": f"shared page, row already dated {held}"})
                continue
        if held == rd["end"]:
            skipped.append({**r, "why": f"already {held}"})
            continue
        writes.append({**r, "end": rd["end"], "reading": rd, "held": held,
                       "shared": len(group) > 1})
    return writes, skipped


# ── Stores ─────────────────────────────────────────────────────────────────

def targets(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT id, name, scheme_end_date, scheme_end_date_basis,
                      eligibility_source_url, source_window_policy
                 FROM funding_instruments
                WHERE root_id = %s AND id <> root_id
                ORDER BY name""", (ROOT_ID,))
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="read only N targets")
    ap.add_argument("--deadline-min", type=int, default=DEADLINE_MIN,
                    help="stop reading after this many minutes and write what "
                         "was read (0 = no ceiling)")
    args = ap.parse_args()
    if args.write == args.dry_run:
        raise SystemExit("choose exactly one of --write / --dry-run")

    # Short connections only: the read phase below can run for an hour against
    # a public archive, and a Postgres session held idle across it is one the
    # proxy drops.
    with connect(readonly=True) as conn:
        rows = targets(conn)
    if args.limit:
        rows = rows[:args.limit]
    print(f"{len(rows)} {ROOT_ID} leaves in Postgres\n")

    off_policy = [r for r in rows if r["source_window_policy"] != PUBLISHES_WINDOW]
    if off_policy:
        # Not fatal and not this script's column to write. It is printed because
        # a row whose SOURCE is declared to publish no window, and for which we
        # are about to read a window off that source, is a contradiction one of
        # the two statements has to lose -- and silently preferring this one
        # would make `source_window_policy` unfalsifiable.
        print(f"  ! {len(off_policy)} rows are not declared {PUBLISHES_WINDOW}: "
              f"{[r['id'] for r in off_policy][:5]}\n")

    readings: dict[str, dict] = {}
    failed: list[dict] = []
    unreadable: list[dict] = []
    deadline = (time.monotonic() + args.deadline_min * 60
                if args.deadline_min else float("inf"))
    # Cheap source first. TEE answers 49 rows in about a minute and the archive
    # can spend twelve on one, so reading in name order lets a slow archive page
    # eat the deadline that a dozen instant reads were waiting behind. Ordering
    # by cost makes the truncated tail the expensive rows, which are also the
    # ones a re-run is cheapest at retrying.
    work = sorted(
        ((reader_for(r["eligibility_source_url"] or ""), r) for r in rows),
        key=lambda wr: (wr[0] != "tee", wr[1]["name"]))
    for n, (which, r) in enumerate(work, 1):
        if which is None:
            unreadable.append(r)
            continue
        if time.monotonic() > deadline:
            # Out of time, not out of luck: these are indistinguishable from a
            # fetch that failed, and are handled the same way -- reported, and
            # read by the next run.
            failed.append(r)
            continue
        rd = (read_tee if which == "tee" else read_ademe_archive)(
            r["eligibility_source_url"])
        # Printed per row, and flushed. The archive answers in its own time and
        # a silent ten minutes is indistinguishable from a hung run in a cron
        # log, which is where this output is actually read.
        print(f"  [{n:>2}/{len(rows)}] {which:<8} "
              f"{(rd or {}).get('end') or '   --   '}  {r['name'][:52]}",
              flush=True)
        if rd is None:
            failed.append(r)
            continue
        readings[r["id"]] = rd

    print(f"read {len(readings)}, fetch failed {len(failed)}, "
          f"no reader for the cited host {len(unreadable)}")
    for r in unreadable:
        host = urllib.parse.urlparse(r["eligibility_source_url"] or "").netloc
        print(f"    no reader  {host:<45} {r['name'][:44]}")
    for r in failed:
        print(f"    fetch fail {r['id']}")

    writes, skipped = plan(rows, readings)

    print(f"\n{len(writes)} window(s) to write:")
    for w in writes:
        # `is_closed` and not `end < today`. There is ONE definition of closed
        # and this script is not entitled to a second one, however obvious the
        # comparison looks -- that obviousness is what produced five of them.
        flag = "closed" if is_closed(
            {"scheme_end_date": w["end"], "scheme_end_date_basis": CALL_DEADLINE,
             "last_year": None}) else "open  "
        note = f"(was {w['held']})" if w["held"] else "(was none)"
        cap = f" cap {w['reading']['captured']}" if w["reading"]["captured"] else ""
        print(f"    {w['end']}  {flag} {note:<14}{cap:<15} {w['name'][:48]}")
    by_why: dict[str, int] = {}
    for s in skipped:
        key = re.sub(r"\d{4}-\d{2}-\d{2}|\[.*\]", "…", s["why"])
        by_why[key] = by_why.get(key, 0) + 1
    print(f"\n{len(skipped)} not written:")
    for why, n in sorted(by_why.items(), key=lambda kv: -kv[1]):
        print(f"    {n:>3}  {why}")
    for s in skipped:
        if "programme-level" in s["why"] or "disagree" in s["why"]:
            print(f"      held back: {s['name'][:52]} -- {s['why']}")

    if args.limit:
        # A partial pass must not become the record. `--limit` is for trying a
        # reader out, and letting three rows overwrite the file that documents
        # seventy would make the debugging aid destroy the evidence.
        print(f"\n--limit {args.limit}: {READINGS.name} left as it was")
    else:
        READINGS.parent.mkdir(parents=True, exist_ok=True)
        READINGS.write_text(json.dumps(
            {"read_at": dt.datetime.now(dt.timezone.utc).isoformat(),
             "readings": readings}, ensure_ascii=False, indent=1))

    if args.dry_run:
        print("\ndry run: nothing written")
        return 0

    # ── The store: one transaction, every confirmation and every window. ────
    with connect() as conn, conn.cursor() as cur:
        # Every row this run CONFIRMED against its source, not only the ones
        # whose date moved. `check_offerable_decay.py` limb 1 reads
        # MAX(updated_at) per clock-decaying source as the freshness of the JOB
        # that refills it, and a run that re-read all 75 pages and found nothing
        # to change has done its job -- if only changes bumped the clock, a
        # correctly-quiet quarter would be indistinguishable from a job that
        # stopped running, which is the exact confusion that guard exists for.
        cur.execute("UPDATE funding_instruments SET updated_at = now() "
                    "WHERE id = ANY(%s)", (list(readings),))
        print(f"\nconfirmed against source: {cur.rowcount} row(s) touched")
        for w in writes:
            cur.execute(
                "UPDATE funding_instruments SET scheme_end_date = %s, "
                "scheme_end_date_basis = %s WHERE id = %s",
                (w["end"], CALL_DEADLINE, w["id"]))
        print(f"{len(writes)} window(s) written")
        # The three `eligibility_*` columns are deliberately NOT touched here.
        # They describe the read that produced `eligibility_text`, and this job
        # read a date, not a text. Repointing the citation at the newer capture
        # this run happened to use would assert that the stored text came off
        # that capture, which is not true; bumping `_fetched_at` would assert
        # the text was re-confirmed, which it was not; and `_confidence` grades
        # the MATCH between our leaf and that page, which reading a date off it
        # tells you nothing about. The window's own provenance -- page, field,
        # capture date -- is in data/raw/ademe_windows/readings.json and is
        # re-derived by every run.

    # ── Read back OUT of Postgres, so the run reports the product's view ────
    # Closed is `closed_sql()`, generated from the one definition in
    # lib/intelligence/liveness.ts. A count this script computed its own way
    # would be a report about this script rather than about the corpus.
    with connect(readonly=True) as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT count(*),
                       count(*) FILTER (WHERE scheme_end_date IS NOT NULL),
                       count(*) FILTER (WHERE {closed_sql("postgres")})
                  FROM funding_instruments
                 WHERE root_id = %s AND id <> root_id""", (ROOT_ID,))
        total, dated, closed = cur.fetchone()
    print(f"\npostgres, read back: {total} leaves, {dated} dated, "
          f"{closed} closed, {total - closed} offerable, "
          f"{total - dated} with no window")

    if not readings:
        print("nothing could be read from either catalogue")
        return 1
    return outcome(failed, len(readings))


def outcome(failed: list[dict], n_read: int) -> int:
    """0 or 3, from the fetches that failed. Pure, so it is testable.

    ── A failed fetch is only a shortfall if it cost the corpus something ──
    Until 2026-11-09 any failed fetch was exit 3, and exit 3 is a PARTIAL that
    keeps the census from reading `ok` (railway_cron.py). Run 114 lost one
    web.archive.org page to a refused connection and the week was recorded as
    partial, though the row that page speaks for still held the window an
    earlier run read off it: populate_funding_instruments.py keeps
    `scheme_end_date` FILL_ONLY, so a load no longer erases it (this file's
    header predates that and says otherwise).

    So a failure is COVERED when the row already holds a window of basis
    CALL_DEADLINE -- this job's own earlier reading, still the best evidence
    there is -- and UNCOVERED when it holds none, which is a fund the corpus
    cannot date this week. Only uncovered failures are a partial.

    What stops that hiding a real outage: when failures outnumber reads, the
    catalogue is down, not flaky, and that is a partial however well covered,
    because next week's run would be leaning on the same old readings again.
    """
    covered = [r for r in failed if r.get("scheme_end_date")
               and r.get("scheme_end_date_basis") == CALL_DEADLINE]
    uncovered = [r for r in failed if r not in covered]
    if covered:
        print(f"{len(covered)} target(s) failed to fetch and keep the window an "
              f"earlier run read: {', '.join(r['id'] for r in covered[:5])}"
              f"{' ...' if len(covered) > 5 else ''}")
    if uncovered:
        print(f"PARTIAL: {len(uncovered)} target(s) failed to fetch and hold no "
              f"window; the next run picks them up")
        return 3
    if len(failed) > n_read:
        print(f"PARTIAL: {len(failed)} fetches failed against {n_read} read -- the "
              f"catalogue is down, not flaky")
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
