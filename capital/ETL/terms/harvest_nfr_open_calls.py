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

15 of the 27 open business calls are "Løpende", so a loader that required a
parseable date would drop more than half of them, and one that invented an end
date for them would fabricate a closure. Both dates and the rolling statement
are carried through; neither is guessed. A call whose window is neither — see
`window()` — is reported and carried as unknown, which is a third thing and not
a quiet default to either.

── What the detail page adds, and why it is worth the second request ──────
The listing gives id, title, url, a truncated deadline ("9. sep.", no year),
status, tags and the `metadata` triple (available funds / support limits /
duration). Everything else an instrument row needs is on the call's own page,
as a JSON object literal inside `window.__REACT_COMPONENTS__` — under one of
TWO component names, which is not cosmetic; see `COMPONENTS` below. From the
richer of the two:

  metadataLeft   Finansieringsordning, the `*frist*` labels (FULL date + time
                 + tz), Hvem retter utlysningen seg mot, Portefølje, Status
  metadataRight  Støttegrenser, Antatt tilgjengelige midler, Prosjektvarighet,
                 earliest/latest permitted project start
  tabs           contentSections — "Hvem kan søke?" / "Hvem kan delta i
                 prosjektet?" is the eligibility text, verbatim and in Norwegian
  applyButton    the real application URL (tibi.forskningsradet.no)
  byline         Publisert / Oppdatert dates

27 open business calls is 27 requests, which is why this harvest caches and
sleeps between them.

The page also emits schema.org `Grant` JSON-LD, but it holds only id, name, a
truncated description and the url — strictly less than the React payload, and
it states no deadline at all. It is not used.

── The one thing a loader MUST do first, or it ships a false claim ────────
`data/reference/source_window_policy.json` declares, for all of Norway:

    {"match": {"source_family_bucket": "national_dev_banks", "country": "NO"},
     "policy": "publishes_no_window"}

That declaration is TRUE of the rows it was written for and FALSE of these.
It says "the register's record for this kind of object has no closing date
field in it at all" — a class judgement made because the file we ingest for
Norway is an award file, and it is flagged as the weakest link in the whole
policy in project-mgmt/findings/wsBE_source_window_policy.md:

    200 singleton national-development-bank programmes ... are
    publishes_no_window because the file we ingest is an award file, not
    because anyone read 200 bank websites. ... If one of those banks starts
    publishing calls into the same feed, the declaration goes stale.

This harvest is that feed. So a loader must add a NARROWER declaration ahead
of it — `assign_source_window_policy.py` resolves narrowest-first and
`id_prefix` (MATCH_KEYS index 1) beats `country` (index 3), so an `id_prefix`
declaration wins without touching the existing rule or any other Norwegian row:

    {"match": {"id_prefix": "<the loader's prefix>"},
     "policy": "declares_open_ended"}   for the "Løpende" rows
    {"match": {"id": "<one id>"}, "policy": "publishes_window"}  for dated rows

Getting this wrong is not cosmetic. `contradictsDeclaredPolicy()` in
liveness.ts exists precisely to catch "declared publishes_no_window yet carries
a call deadline" — and it is exported and unit-tested with NO harness calling
it, so nothing would fail the build. The corpus would simply assert that
Forskningsradet states no deadlines while showing a founder a deadline.

── Why a loader must NOT just mint 27 parentless rows ─────────────────────
The Spanish loader's shape does not transfer whole, and the reason is measured,
not stylistic. `meetsDataFloor` in accessMode.ts admits an award-less row only
through `hasOpenWindow`, which reads:

    inst.schemeEndBasis === SCHEME_END_BASIS.callDeadline &&
    end.length === 10 && end >= today()

That requires a DATED window. It is satisfied by the 10 dated calls here and by
none of the 15 "Løpende" ones, which have no `scheme_end_date` at all and, as
fresh call rows, no `total_eur` and no `last_year` either. Minting them as new
parentless rows would put the majority of Norway's open calls below the data
floor — invisible, with nothing failing.

They do not need to be new rows. Most of these calls run under programmes the
corpus ALREADY holds, with the award history that clears the floor outright:

    "Innovasjon i næringslivet"  6 open calls  -> nfr_inno (INNO-NAERING, 226 awards)
    Nærings-ph.d.                1 open call   -> nfr_naeringsph (21 awards)

which is exactly what `write_revivals()` in load_bdns_open_calls.py was built
for: point the existing, fully-evidenced leaf at the call that is open under its
own scheme, so it keeps its awards and starts presenting the window a founder
can actually act on. That is the right default here.

The exception is worth naming because it is the single biggest Norwegian fund
for a founder and the corpus does not hold it at all: **SkatteFUNN** — a
rights-based tax deduction, rolling intake, open to any Norwegian company with
an organisasjonsnummer that is taxable in Norway — has no `nfr_*` row. It is
genuinely a new row, and it is a `tax_credit`, not a grant.

One thing a loader does inherit: Norway is absent from SATR entirely — measured
2026-08-12, `satr_staging` holds 122,814 rows and 0 match 'NO' on any of
`country`, `third_country`, `granting_country_iso2`, `beneficiary_country_iso2`
— so the mandatory SATR-overlap gate is satisfied trivially and there is no
scheme-code join to make.

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


def parse_date(text: str) -> str | None:
    """ISO date from a Norwegian date string, or None. Ignores any time suffix.

    Handles both the full form the detail page uses ("9. september 2026, kl.
    13.00 CEST") and the abbreviated form its timeline uses ("1. jan. 2027").
    """
    m = re.match(r"\s*(\d{1,2})\.\s*([A-Za-zæøåÆØÅ]+)\.?\s*(\d{4})", text or "")
    if not m:
        return None
    month = _MONTHS_NO.get(m.group(2).casefold().rstrip("."))
    if not month:
        return None
    try:
        return dt.date(int(m.group(3)), month, int(m.group(1))).isoformat()
    except ValueError:
        return None


def deadlines(props: dict) -> list[tuple[str, str, str | None]]:
    """Every application deadline the detail page states, as (label, text, iso).

    ── Why a label PROPERTY and not a list of labels ──────────────────────
    The register does not use a fixed deadline vocabulary. Across the 27 open
    business calls on 2026-08-12 it wrote, for the same kind of fact:

        "Søknadsfrist"
        "Søknadsfrist for skisser"
        "Søknadsfrist for full søknad etter invitasjon"
        "Frist for å sende inn skisse"
        "Frist for inviterte til å sende inn fullstendig søknad"

    These are sentences, composed per call. Enumerating them would silently
    drop the next phrasing someone types, and the failure would be invisible:
    the call would simply arrive with no deadline and be treated as rolling.
    The property is that a Norwegian deadline label contains the word `frist`,
    and the test for an unseen case is exactly that.

    Restricted to `metadataLeft`, which is where the register puts the
    application window. `metadataRight` holds project facts (permitted start
    dates, duration) and the timeline block holds things like SkatteFUNN's
    `Garantifrist` -- a processing guarantee, not a door closing.
    """
    out = []
    for it in ((props.get("metadataLeft") or {}).get("items") or []):
        label = (it.get("label") or "").strip()
        if "frist" not in label.casefold():
            continue
        text = (it.get("text") or "").strip()
        out.append((label, text, parse_date(text)))
    return out


def window(props: dict) -> tuple[str | None, str, str]:
    """(ISO entry deadline or None, window basis, the label it came from).

    ── Which deadline closes the door on a founder ────────────────────────
    A two-stage call states two: a sketch deadline, and a full-application
    deadline "etter invitasjon" / "for inviterte". Only the FIRST is a door a
    new applicant can walk through -- the second is reachable only by someone
    already invited through the first. So the entry deadline is the EARLIEST
    stated one, not the latest.

    Taking the latest would have told a founder that M-ERA.NET's 2026 call was
    open until 18 November when entry actually shut on 12 May. Taking the
    earliest is also the conservative direction for liveness: it can retire a
    row while a later stage is still running, which withholds a fund nobody
    new could join anyway.

    Basis values match SCHEME_END_BASIS / SOURCE_WINDOW_POLICY in
    website/frontend/lib/intelligence/liveness.ts.
    """
    ds = deadlines(props)
    if not ds:
        return None, "unstated", ""
    if all(t.casefold().startswith(ROLLING.casefold()) for _, t, _ in ds):
        return None, "declares_open_ended", ds[0][0]
    dated = [(iso, label) for label, _, iso in ds if iso]
    if not dated:
        return None, "unparsed", ds[0][0]
    iso, label = min(dated)
    return iso, "call_deadline", label


# The register renders a call through one of two React components, and they are
# NOT the same record. Discovered by harvesting all 27 open business calls:
# 16 of them returned nothing until the second name was added.
#
#   TibiProposalPage  Forskningsrådet's OWN calls. Carries `tabs` ->
#                     contentSections ("Hvem kan søke?", "Hvem kan delta i
#                     prosjektet?") -- the eligibility prose -- plus
#                     `applyButton` pointing at the tibi portal, and the
#                     Støttegrenser / Antatt tilgjengelige midler figures.
#   ProposalPage      INTERNATIONAL joint calls (ERA-NET, EuroHPC, CETP,
#                     M-ERA.NET, partnership co-funds). No tabs, no
#                     applyButton and no support limits -- because the money
#                     and the application both run through the international
#                     consortium, and Forskningsrådet is describing a call it
#                     does not itself operate. It states the deadline, the
#                     programme and the target groups, and nothing more.
#
# Both are admitted, but the difference is recorded per row as `page_shape`
# rather than smoothed away: an international row genuinely has less evidence
# behind it, and a loader that cannot see which kind it holds would assert an
# eligibility text for rows that have none.
COMPONENTS = ("TibiProposalPage", "ProposalPage")

# The two components label the same fact differently. Aliases are ordered and
# the first present wins; an unlabelled field stays empty rather than guessing.
TARGET_GROUP_LABELS = ("Hvem retter utlysningen seg mot", "Målgrupper")
THEME_LABELS = ("Portefølje", "Aktuelle temaområder")


def detail(url_path: str) -> tuple[dict, str] | None:
    """(props, component name) for one call, or None.

    The props are a JSON object literal inside a script tag, so it is read with
    a JSON decoder positioned at the opening brace rather than by regex -- the
    payload contains braces and escaped quotes in free text and no regex
    survives that.
    """
    html = fetch_text(SITE + url_path, timeout=60)
    if not html:
        return None
    for name in COMPONENTS:
        i = html.find(f'name: "{name}"')
        if i < 0:
            continue
        j = html.find("props: ", i)
        if j < 0:
            continue
        try:
            obj, _ = json.JSONDecoder().raw_decode(html[j + len("props: "):])
        except ValueError:
            continue
        return obj, name
    return None


def _labelled(props: dict, block: str, *labels: str) -> str:
    """First of `labels` present in `block`, verbatim. Empty if none are."""
    items = (props.get(block) or {}).get("items") or []
    for label in labels:
        for it in items:
            if (it.get("label") or "").strip().casefold() == label.casefold():
                return (it.get("text") or "").strip()
    return ""


def summarise(props: dict, component: str) -> dict:
    """The fields an instrument row needs, verbatim from the detail page."""
    iso, basis, label = window(props)
    sections = (((props.get("tabs") or {}).get("items") or [{}])[0]
                .get("content", {}).get("tibi", {}).get("contentSections") or [])
    return {
        "page_shape": component,
        "title": (props.get("title") or "").strip(),
        "scheme": _labelled(props, "metadataLeft", "Finansieringsordning"),
        "programme": _labelled(props, "metadataLeft", "Program"),
        # Every deadline the page states, kept whole. The entry deadline below
        # is derived from these and the derivation must stay auditable.
        "deadlines": [{"label": la, "text": t, "iso": i}
                      for la, t, i in deadlines(props)],
        "deadline_label": label,
        "deadline_iso": iso,
        "window_basis": basis,
        "target_groups": _labelled(props, "metadataLeft", *TARGET_GROUP_LABELS),
        "portfolio": _labelled(props, "metadataLeft", *THEME_LABELS),
        "status_text": _labelled(props, "metadataLeft", "Status"),
        "support_limits": _labelled(props, "metadataRight", "Støttegrenser"),
        "available_funds": _labelled(props, "metadataRight",
                                     "Antatt tilgjengelige midler"),
        "duration": _labelled(props, "metadataRight", "Prosjektvarighet"),
        # NULL on every international row, and left empty rather than
        # back-filled with the call page: "where you apply" is a claim, and the
        # call page is where you READ about applying.
        "apply_url": ((props.get("applyButton") or {}).get("url") or "").strip(),
        "is_international": bool(props.get("isInternational")),
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
    bases, shapes = Counter(), Counter()
    shut: list[tuple[str, str, str]] = []
    today = dt.date.today().isoformat()
    written = 0
    for p in live:
        got = detail(p["url"])
        if not got:
            print(f"    no detail payload: {p['url']}", file=sys.stderr)
            continue
        props, component = got
        rec = summarise(props, component)
        rec.update(call_id=str(p.get("id")), url=SITE + p["url"], country=country,
                   fetched_at=dt.datetime.now().isoformat(timespec="seconds"))
        (CACHE_DIR / f"{rec['call_id']}.json").write_text(
            json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
        bases[rec["window_basis"]] += 1
        shapes[component] += 1
        if rec["deadline_iso"] and rec["deadline_iso"] < today:
            shut.append((rec["deadline_iso"], rec["deadline_label"], rec["title"]))
        written += 1
        time.sleep(0.3)

    print(f"\n  cached {written} of {len(live)} open calls -> {CACHE_DIR}")
    print(f"  window basis: {dict(bases)}")
    print(f"  page shape  : {dict(shapes)}")
    if written < len(live):
        print(f"  {len(live) - written} open calls yielded no detail payload — "
              f"the register renders them through a component this harvest does "
              f"not know; they must not be loaded from listing data alone",
              file=sys.stderr)
    # `unstated` means the page carried no `*frist*` label at all; `unparsed`
    # means it carried one whose value is neither a date nor "Løpende". Both are
    # states in which the window is unknown, and a row with an unknown window
    # must not be loaded as dated OR as open-ended -- those are the two claims
    # the corpus makes about a window, and neither is available here.
    for state in ("unstated", "unparsed"):
        if bases.get(state):
            print(f"  {bases[state]} calls with an {state} application window — "
                  f"these must not be loaded as either dated or open-ended",
                  file=sys.stderr)

    # The case the two-stage rule exists for, counted rather than hidden. The
    # register says "Søk nå" because a later stage is still running, while the
    # stage that admits a NEW applicant has already shut. Both statements are
    # true and they disagree about the only question a founder is asking, so
    # the disagreement is reported: a loader must retire these, and if the count
    # is ever large the rule deserves re-reading, not silent trust.
    if shut:
        print(f"\n  {len(shut)} of {written} are open per the register but their "
              f"ENTRY deadline has passed — a new applicant cannot join:")
        for iso, label, title in sorted(shut):
            print(f"    {iso}  {label[:44]:44}  {title[:46]}")


if __name__ == "__main__":
    main()
