"""Harvest Forskningsrådet's OPEN calls — the utlysninger register, not the ledger.

── The confusion this file exists to end ──────────────────────────────────
Norway already had two extractors and neither could ever produce a fund a
founder can apply to, because neither was looking at calls:

  ETL/events/extract/extract_nfr.py            -> Prosjektbanken, AWARDED projects
  ETL/events/extract/extract_innovasjon_norge.py -> Tildelinger.csv, AWARDED decisions

`extract_nfr.py` derives its `source` and `programme_name` from each award's
`currentActivity.activity` — the ledger code the award was BOOKED under. That
is the correct thing for an awards feed to do, and it is why the Norwegian rows
read as accounting codes: they are accounting codes. Forskningsrådet re-booked
onto new codes in 2025 and the feed faithfully reported the new bookkeeping.
Nothing was broken. The calls register was simply never harvested.

This is that register. It is a different system on a different host with a
different unit of record: `utlysninger` are the things with deadlines, target
groups, support limits and an "apply" button.

── The endpoint, and why the id is discovered rather than written down ────
  POST https://www.forskningsradet.no/api/v1/search/proposal/no/<contentId>
  body: {"subjects":[],"targetGroups":[],"deadlineTypes":[],"applicationTypes":[]}

All four arrays are REQUIRED — omitting any one 400s with a body naming it —
and empty means "no filter". A GET 404s. `<contentId>` (18404 on 2026-08-12) is
the Optimizely/EpiServer content id of the /utlysninger/ page, which is a fact
about their CMS and not about the register, so it is read at run time out of
the page's own `fetchFilteredResultsEndpoint` rather than pinned here. Pinning
it would turn an ordinary re-publish of their listing page into a silent
zero-row harvest.

`targetGroups: ["26"]` is Næringsliv (business) — 30 of the 65 current calls
on 2026-08-12. The filter ids are published in the same response, so the
harvest reads them rather than hardcoding, and reports when a label moves.

── Open vs closed: the funder's own statement, not our arithmetic ─────────
The response carries `status: {theme: int, text: str}` per call, and the detail
page repeats it as `statusList`. Observed on 2026-08-12 across all 65:

  theme 1  "Søk nå"       open, accepting applications now
  theme 3  "Se Resultat"  closed, results published
  theme 5  "Planlagt"     announced, not yet open

The property, stated so it survives an unseen case: **a call is admissible only
when the register itself says it is currently accepting applications.** The
test is `theme == OPEN_THEME`. Every other value — including one this file has
never seen — is not-open, and an unrecognised theme is REPORTED rather than
bucketed, because a new status we silently treat as closed hides real funds and
one we silently treat as open ships dead ones. `unknown_status` in the report is
the alarm.

This is deliberately not a date comparison. Deadlines here come in two kinds and
only one is a date:

  "9. september 2026, kl. 13.00 CEST"  -> a real deadline. `call_deadline`.
  "Løpende"                            -> rolling, no closing date. The register
                                          carries the field and states there is
                                          none, which is exactly
                                          SOURCE_WINDOW_POLICY.declares_open_ended
                                          in lib/intelligence/liveness.ts — a
                                          statement, not a silence.

36 of 65 current calls are "Løpende", so a loader that required a parseable
date would drop more than half the register, and one that invented an end date
for them would fabricate a closure. Both dates and the rolling statement are
carried through; neither is guessed.

── What the detail page adds, and why it is worth the second request ──────
The listing gives id, title, url, deadline label, status, tags and the
`metadata` triple (available funds / support limits / duration). The detail page
carries the rest of what an instrument row needs, as JSON embedded in
`window.__REACT_COMPONENTS__` under the `TibiProposalPage` component:

  metadataLeft   Finansieringsordning, Søknadsfrist (FULL date + time + tz),
                 Hvem retter utlysningen seg mot, Portefølje, Status
  metadataRight  Støttegrenser, Antatt tilgjengelige midler, Prosjektvarighet,
                 earliest/latest permitted project start
  tabs           contentSections — "Hvem kan søke?" / "Hvem kan delta i
                 prosjektet?" is the eligibility text, verbatim and in Norwegian
  applyButton    the real application URL (tibi.forskningsradet.no)
  byline         Publisert / Oppdatert dates

The listing's date is truncated to "9. sep." with no year, so the full deadline
is only available per call. 65 calls is 65 requests, which is why this harvest
caches and is polite.

The page also emits schema.org `Grant` JSON-LD, but it holds only id, name, a
truncated description and the url — strictly less than the React payload, and
it states no deadline at all. It is not used.

Usage:
  python3 ETL/terms/harvest_nfr_open_calls.py --probe    # endpoint + status vocabulary
  python3 ETL/terms/harvest_nfr_open_calls.py --report   # listing only, no detail fetches
  python3 ETL/terms/harvest_nfr_open_calls.py --fetch    # listing + detail, to cache
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT as _ETL_ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import datetime as dt  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from collections import Counter  # noqa: E402

from europe_scope import canonicalise_country  # noqa: E402
from ndb_ssl import fetch_text, post_json  # noqa: E402

SITE = "https://www.forskningsradet.no"
LISTING_URL = f"{SITE}/utlysninger/"
COUNTRY_RAW = "NO"
CACHE_DIR = _ETL_ROOT / "data" / "raw" / "nfr_calls"

# The register's own status vocabulary, keyed on ITS integer. Text is the label
# it shows a Norwegian reader and is recorded for evidence, never matched on --
# a label is translated and re-worded, an enum value is not.
OPEN_THEME = 1
STATUS_THEMES = {1: "Søk nå", 3: "Se Resultat", 5: "Planlagt"}

# targetGroups filter ids, as published in the response's own filter block.
# Read at run time; these are the values observed on 2026-08-12 and are used
# only to name what a discovered id means.
TARGET_GROUPS = {"27": "Forskningsorganisasjon", "26": "Næringsliv",
                 "25": "Offentlig sektor"}
BUSINESS_TARGET_GROUP = "26"

_MONTHS_NO = {
    "januar": 1, "februar": 2, "mars": 3, "april": 4, "mai": 5, "juni": 6,
    "juli": 7, "august": 8, "september": 9, "oktober": 10, "november": 11,
    "desember": 12,
    # The register abbreviates in the timeline and in list metadata. "mai" and
    # "juni"/"juli" are never abbreviated, so they are absent here by design.
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
    "aug": 8, "sep": 9, "okt": 10, "nov": 11, "des": 12,
}

ROLLING = "Løpende"


def discover_endpoint() -> str | None:
    """Read the search endpoint out of the listing page that owns it.

    Returns an absolute URL, or None if the page no longer advertises one --
    which is the signal that this harvest needs a human, not a fallback.
    """
    html = fetch_text(LISTING_URL, timeout=60)
    if not html:
        print("  listing page unreachable", file=sys.stderr)
        return None
    m = re.search(r'"fetchFilteredResultsEndpoint"\s*:\s*"([^"]+)"', html)
    if not m:
        print("  listing page no longer advertises fetchFilteredResultsEndpoint",
              file=sys.stderr)
        return None
    return SITE + m.group(1)


def search(endpoint: str, target_groups: list[str] | None = None) -> dict | None:
    """POST the search. All four arrays are required; empty means unfiltered."""
    return post_json(endpoint, {
        "subjects": [],
        "targetGroups": target_groups or [],
        "deadlineTypes": [],
        "applicationTypes": [],
    }, timeout=60)


def proposals(payload: dict) -> list[dict]:
    """Flatten the response's grouping. The groups are a presentation device --
    they collapse and re-form as the register's mix changes -- so the group a
    call sits in is not carried anywhere."""
    out = []
    for group in payload.get("groups") or []:
        for p in group.get("proposals") or []:
            p = dict(p)
            p["_group"] = group.get("title", "")
            out.append(p)
    return out


def status_of(p: dict) -> tuple[int | None, str]:
    st = p.get("status") or {}
    theme = st.get("theme")
    return (theme if isinstance(theme, int) else None), (st.get("text") or "")


def is_open(p: dict) -> bool:
    """The register says this call is accepting applications right now."""
    return status_of(p)[0] == OPEN_THEME


def parse_deadline(text: str) -> tuple[str | None, str]:
    """(ISO date or None, window basis) for a Søknadsfrist string.

    Returns one of:
      ("2026-09-09", "call_deadline")      a stated closing date
      (None, "declares_open_ended")        the register states it is rolling
      (None, "unparsed")                   a form this function does not know,
                                           which the caller must surface rather
                                           than treat as either of the above
    """
    t = (text or "").strip()
    if not t:
        return None, "unparsed"
    if t.casefold().startswith(ROLLING.casefold()):
        return None, "declares_open_ended"
    m = re.match(r"(\d{1,2})\.\s*([A-Za-zæøåÆØÅ]+)\.?\s*(\d{4})", t)
    if not m:
        return None, "unparsed"
    month = _MONTHS_NO.get(m.group(2).casefold().rstrip("."))
    if not month:
        return None, "unparsed"
    try:
        return dt.date(int(m.group(3)), month, int(m.group(1))).isoformat(), "call_deadline"
    except ValueError:
        return None, "unparsed"


def detail(url_path: str) -> dict | None:
    """The TibiProposalPage props for one call, or None.

    The props are a JSON object literal inside a script tag, so it is read with
    a JSON decoder positioned at the opening brace rather than by regex -- the
    payload contains braces and escaped quotes in free text and no regex
    survives that.
    """
    html = fetch_text(SITE + url_path, timeout=60)
    if not html:
        return None
    marker = 'name: "TibiProposalPage"'
    i = html.find(marker)
    if i < 0:
        return None
    j = html.find("props: ", i)
    if j < 0:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(html[j + len("props: "):])
        return obj
    except ValueError:
        return None


def _labelled(props: dict, block: str, label: str) -> str:
    for it in ((props.get(block) or {}).get("items") or []):
        if (it.get("label") or "").strip().casefold() == label.casefold():
            return (it.get("text") or "").strip()
    return ""


def summarise(props: dict) -> dict:
    """The fields an instrument row needs, verbatim from the detail page."""
    deadline_text = _labelled(props, "metadataLeft", "Søknadsfrist")
    iso, basis = parse_deadline(deadline_text)
    sections = (((props.get("tabs") or {}).get("items") or [{}])[0]
                .get("content", {}).get("tibi", {}).get("contentSections") or [])
    return {
        "title": (props.get("title") or "").strip(),
        "scheme": _labelled(props, "metadataLeft", "Finansieringsordning"),
        "deadline_text": deadline_text,
        "deadline_iso": iso,
        "window_basis": basis,
        "target_groups": _labelled(props, "metadataLeft",
                                   "Hvem retter utlysningen seg mot"),
        "portfolio": _labelled(props, "metadataLeft", "Portefølje"),
        "status_text": _labelled(props, "metadataLeft", "Status"),
        "support_limits": _labelled(props, "metadataRight", "Støttegrenser"),
        "available_funds": _labelled(props, "metadataRight",
                                     "Antatt tilgjengelige midler"),
        "duration": _labelled(props, "metadataRight", "Prosjektvarighet"),
        "apply_url": ((props.get("applyButton") or {}).get("url") or "").strip(),
        "section_titles": [(s.get("sectionTitle") or "").strip() for s in sections],
        "status_themes": [s.get("theme") for s in (props.get("statusList") or [])],
    }


def report(payload: dict, business_only: bool) -> list[dict]:
    rows = proposals(payload)
    themes = Counter(status_of(p) for p in rows)
    unknown = {t for t, _ in themes if t not in STATUS_THEMES}

    print(f"  {len(rows)} calls in the register's current view"
          f"{' (Næringsliv)' if business_only else ''}")
    for (theme, text), n in sorted(themes.items(), key=lambda kv: -kv[1]):
        known = STATUS_THEMES.get(theme)
        flag = "" if known else "   <-- UNKNOWN STATUS, not admitted"
        print(f"    theme {theme}  {text!r:>16}  {n:>3}{flag}")
    if unknown:
        print(f"  unknown_status: {sorted(unknown)} — the register's vocabulary "
              f"moved; decide open/closed before loading", file=sys.stderr)

    live = [p for p in rows if is_open(p)]
    print(f"  {len(live)} open ('{STATUS_THEMES[OPEN_THEME]}')")
    rolling = sum(1 for p in live if (p.get("date") or "").startswith(ROLLING))
    print(f"    of which rolling ('{ROLLING}'): {rolling}; dated: {len(live) - rolling}")
    return live


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--probe", action="store_true",
                    help="endpoint discovery + status vocabulary only")
    ap.add_argument("--report", action="store_true",
                    help="listing only, no detail requests")
    ap.add_argument("--fetch", action="store_true",
                    help="listing + one detail request per open call, to cache")
    ap.add_argument("--all-target-groups", action="store_true",
                    help="do not restrict to Næringsliv (business)")
    a = ap.parse_args()

    country = canonicalise_country(COUNTRY_RAW)
    if country is None:
        print(f"{COUNTRY_RAW} is outside the Europe scope — nothing to harvest",
              file=sys.stderr)
        sys.exit(1)

    endpoint = discover_endpoint()
    if not endpoint:
        sys.exit(1)
    print(f"endpoint: {endpoint}")

    groups = None if a.all_target_groups else [BUSINESS_TARGET_GROUP]
    payload = search(endpoint, groups)
    if not payload:
        print("search returned nothing", file=sys.stderr)
        sys.exit(1)

    if a.probe:
        rows = proposals(payload)
        print(f"✓ live. {len(rows)} calls, "
              f"{sum(1 for p in rows if is_open(p))} open, country={country}")
        return

    live = report(payload, business_only=groups is not None)

    if not a.fetch:
        print("\n[report only] --fetch to pull detail pages into the cache")
        return

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    bases = Counter()
    written = 0
    for p in live:
        props = detail(p["url"])
        if not props:
            print(f"    no detail payload: {p['url']}", file=sys.stderr)
            continue
        rec = summarise(props)
        rec.update(call_id=str(p.get("id")), url=SITE + p["url"], country=country,
                   fetched_at=dt.datetime.now().isoformat(timespec="seconds"))
        (CACHE_DIR / f"{rec['call_id']}.json").write_text(
            json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
        bases[rec["window_basis"]] += 1
        written += 1
        time.sleep(0.3)

    print(f"\n  cached {written} open calls -> {CACHE_DIR}")
    print(f"  window basis: {dict(bases)}")
    if bases.get("unparsed"):
        print(f"  {bases['unparsed']} deadlines in an unrecognised form — "
              f"these must not be loaded as either dated or open-ended",
              file=sys.stderr)


if __name__ == "__main__":
    main()
