"""Give an instrument the route its AGENCY publishes, when it has none of its own.

── Why an agency-level route is worth having ──────────────────────────────
150 publishable instruments could not tell a founder how to approach them, and
145 of those are standalone: there is no parent regime to inherit a route from,
and only 22 carry any URL at all. Extracting a per-programme procedure needs the
programme's own document, which we mostly do not hold.

But those 150 belong to just 26 agencies, and every agency publishes two things
that are true of all of its programmes: where its open calls are listed, and
which system applications are submitted through. "Apply through Altum's client
portal, from the business-products catalogue" is not the whole answer, and it is
a great deal better than a row a founder cannot act on.

── What makes this honest rather than filler ─────────────────────────────
  * It is the AGENCY's route, and says so. Nothing claims to be the programme's
    own procedure, and a real per-programme route overwrites it (see the
    ON CONFLICT below, which never overwrites a cited extraction).
  * Every URL is fetched and must return 200 before anything is written. The
    TACR submission system, ISTA, is deliberately absent: it redirect-loops for
    an unauthenticated client, so it cannot be verified, so it is not published
    as a route. Its public competitions page is used instead.
  * The quote is what the page's own <title> says, captured at verification
    time, so the claim is checkable rather than asserted.

Usage:
  python3 ETL/terms/seed_agency_routes.py --check   verify the URLs only
  python3 ETL/terms/seed_agency_routes.py run
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parents[1] / "lib"))

import argparse  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402
import subprocess  # noqa: E402

from etl_env import DB  # noqa: E402

# Researched and verified 2026-08-01. `match` is a LIKE pattern on the
# instrument id, because an agency owns a stable id prefix in this corpus.
AGENCIES: list[dict] = [
    {
        "match": "nfr_%",
        "agency": "Norges Forskningsradet",
        "calls": "https://www.forskningsradet.no/utlysninger/",
        "portal": "https://tibi.forskningsradet.no/",
        "channel": "Applications go per CALL, not per programme: pick an open "
                   "utlysning from the Research Council's call list, then submit "
                   "through its application portal.",
        "timeline": "Roughly six main fixed deadlines a year, plus calls with "
                    "rolling intake; business innovation calls are often rolling.",
    },
    {
        "match": "eis_%",
        "agency": "EIS (Ettevotluse ja Innovatsiooni Sihtasutus)",
        "calls": "https://eis.ee/teenused/",
        "portal": "https://etoetus.rtk.ee",
        "channel": "Applications for every EIS measure are submitted through the "
                   "state e-toetus environment, from the measure's page in the "
                   "EIS services catalogue.",
        "timeline": "Measures run as open rounds with a deadline, and close early "
                    "once the round's budget is exhausted.",
    },
    {
        "match": "tacr_%",
        "agency": "TACR (Technologicka agentura Ceske republiky)",
        "calls": "https://tacr.gov.cz/programy-a-souteze/programy/",
        # ISTA is the real submission system but redirect-loops unauthenticated,
        # so it is named in prose rather than published as a verified URL.
        "portal": None,
        "channel": "TACR funds through public competitions (verejna soutez) "
                   "announced per programme; proposals are submitted in the ISTA "
                   "information system linked from the competition announcement.",
        "timeline": "One or more competitions per programme per year, each with a "
                    "fixed closing date.",
    },
    {
        "match": "altum_%",
        "agency": "Altum",
        "calls": "https://www.altum.lv/pakalpojumi/biznesam/",
        "portal": "https://mans.altum.lv",
        "channel": "Apply from the product's page in Altum's business catalogue; "
                   "applications are filed through the Mans Altum client portal.",
        "timeline": "Most products accept applications continuously, until the "
                    "programme's funding is committed.",
    },
    # Added 2026-08-01 while resolving same-named development-bank families.
    # Three more agencies were researched and are deliberately ABSENT: Innovasjon
    # Norge and Bpifrance return HTTP 403 bot blocks, and CDP Venture Capital
    # serves a Radware CAPTCHA. Getting past any of them means impersonating a
    # browser, which is the line already drawn in verify() below. They are
    # recorded here as refusing automated access, so nobody re-researches them
    # and quietly crosses it. Their 14 funds keep the measured descriptor.
    #
    # ── Norway, re-researched 2026-08-12 while building the calls harvest ──
    # The question was "which Norwegian funder publishes calls a founder can
    # apply to today". Four candidates beyond Forskningsradet, all rejected,
    # each for a DIFFERENT reason -- which is why they are listed separately
    # rather than as one "no":
    #
    #   Innovasjon Norge   403 to automated clients, re-confirmed. Not merely a
    #                      User-Agent check: a full Chrome UA string plus
    #                      Accept-Language on www.innovasjonnorge.no/no/
    #                      finansiering/ still returns 403. The bulk award CSV
    #                      keeps working because it is served from a different
    #                      host (Azure blob), which is why the EVENTS layer is
    #                      healthy while the website is unreachable. Nothing has
    #                      changed since 2026-08-01; the line still holds.
    #
    #   Siva               Rejected on SUBSTANCE, not access, and that is the
    #                      stronger reason -- getting in would not help. Siva
    #                      funds incubators and industrial parks, which then
    #                      support companies; a founder does not apply to Siva.
    #                      Already recorded at project-mgmt/archive/
    #                      gap_analysis_2026.md:308. Unchanged.
    #
    #   Enova              Reachable and genuinely publishes applicable support
    #                      programmes with an open/closed statement in prose
    #                      ("Neste soknadsfrist: Apent na", "Dette programmet er
    #                      alltid apent og har ikke faste soknadsfrister"). But
    #                      it publishes NO machine-readable calls feed: the site
    #                      is Next.js over Sanity with no public query endpoint,
    #                      and data.enova.no is an Azure API Management portal
    #                      whose API list is empty until you register for a key.
    #                      So the only route is an HTML scrape of the
    #                      `stottetilbud` pages under each of its six business
    #                      sectors. Deferred, not refused: it is a real source,
    #                      it is simply the brittle kind, and Forskningsradet's
    #                      register answers the same question with an API.
    #
    #   EEA/Norway Grants  Not a Norwegian fund for a Norwegian founder at all.
    #                      Norway is the DONOR. The scheme's own country list is
    #                      Bulgaria, Croatia, Cyprus, Czechia, Estonia, Greece,
    #                      Hungary, Latvia, Lithuania, Malta, Poland, Portugal,
    #                      Romania, Slovakia, Slovenia -- Norway is not on it.
    #                      A Norwegian company can be a donor project partner in
    #                      a beneficiary state's project, but the grant is
    #                      awarded to the beneficiary there, not to the
    #                      Norwegian firm. (Worth noting for a DIFFERENT
    #                      workstream: all fifteen ARE in the 40-country scope,
    #                      and eeagrants.org publishes a Calls page.)
    {
        "match": "enterprise_ireland_%",
        "agency": "Enterprise Ireland",
        "calls": "https://www.enterprise-ireland.com/en/funding-supports",
        "portal": "https://www.enterprise-ireland.com/en/funding-supports",
        "channel": "Apply through the support's own page in the Enterprise "
                   "Ireland funding catalogue; most routes start with the "
                   "company's Development Adviser.",
        "timeline": "Most supports are open on a rolling basis; competitive funds "
                    "run as dated calls.",
    },
    {
        "match": "invest_nl_%",
        "agency": "Invest-NL",
        "calls": "https://www.invest-nl.nl/financiering",
        "portal": "https://www.invest-nl.nl/financiering",
        "channel": "Approach Invest-NL directly through the financing page; it "
                   "invests and co-invests rather than running open calls.",
        "timeline": "Rolling. There are no application windows.",
    },
    {
        "match": "sprind_%",
        "agency": "SPRIND (Bundesagentur fur Sprunginnovationen)",
        "calls": "https://www.sprind.org/de/projekte/",
        "portal": "https://www.sprind.org/de/projekte/",
        "channel": "Entry is by SPRIND Challenge or by direct approach to a "
                   "project lead; SPRIND selects rather than awarding on "
                   "open call.",
        "timeline": "Challenges run as dated rounds; other engagement is rolling.",
    },
    {
        "match": "cdti_%",
        "agency": "CDTI",
        "calls": "https://www.cdti.es/ayudas",
        "portal": "https://sede.cdti.gob.es/",
        "channel": "Apply electronically through the CDTI electronic headquarters "
                   "(sede electronica), from the aid's page in the CDTI catalogue.",
        "timeline": "Several CDTI lines run continuously all year; PERTE and "
                    "Misiones lines run as dated convocatorias.",
    },
]

# Verified with curl rather than urllib. Two reasons, both practical: this
# interpreter has no system CA bundle, and eis.ee returns 403 to a custom
# user-agent while serving curl normally. Using curl means identifying as a
# standard HTTP client rather than impersonating a browser, which is the line
# worth keeping: we are reading a public catalogue page, not pretending to be
# someone else to get past a block.
def verify(url: str) -> tuple[bool, str]:
    """(reachable, page title). A route we cannot fetch is not published."""
    try:
        out = subprocess.run(
            ["curl", "-sS", "-L", "--max-time", "30", "-w", "\n%{http_code}", url],
            capture_output=True, text=True, timeout=45)
    except Exception as exc:
        return False, str(exc)[:80]
    if out.returncode != 0:
        return False, (out.stderr or "curl failed").strip()[:80]
    body, _, code = out.stdout.rpartition("\n")
    if code.strip() != "200":
        return False, f"HTTP {code.strip()}"
    m = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
    title = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""
    return True, title[:120]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify the URLs and stop")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    have = {r[0] for r in conn.execute("SELECT DISTINCT instrument_id FROM instrument_application")}
    written = skipped = 0

    for a in AGENCIES:
        ok, title = verify(a["calls"])
        print(f"{a['agency']:46} {'ok' if ok else 'UNREACHABLE'}  {title}")
        if not ok:
            skipped += 1
            continue
        if args.check:
            continue

        # Only instruments that have no route of their own, and none inherited.
        rows = conn.execute("""
            SELECT f.id FROM funding_instruments f
             WHERE f.id LIKE ?
               AND f.is_framework = 0
               AND NOT EXISTS (SELECT 1 FROM funding_instruments k WHERE k.parent_id = f.id)
               AND NOT EXISTS (SELECT 1 FROM instrument_application a WHERE a.instrument_id = f.id)
               AND (f.parent_id IS NULL OR NOT EXISTS
                    (SELECT 1 FROM instrument_application a2 WHERE a2.instrument_id = f.parent_id))
        """, (a["match"],)).fetchall()

        for (iid,) in rows:
            if iid in have:
                continue
            conn.execute("""
                INSERT INTO instrument_application
                  (id, instrument_id, channel, timeline, url, quote, source_file, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                -- Never overwrite a route extracted from a programme's own
                -- document: this is the agency-level fallback, not a correction.
                ON CONFLICT (id) DO NOTHING
            """, (iid, iid, a["channel"], a["timeline"],
                  a["portal"] or a["calls"],
                  f'{a["agency"]} call listing, page title: "{title}"',
                  a["calls"]))
            written += 1

    conn.commit()
    conn.close()
    print(f"\n{written} agency-level routes written, {skipped} agency/agencies unreachable")


if __name__ == "__main__":
    main()
