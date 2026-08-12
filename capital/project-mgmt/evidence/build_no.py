#!/usr/bin/env python3
"""Build the Norway half of the evidence file.

Settled against Forskningsradet's OWN site: its published data description, and
its calls register (the utlysninger API, which states per call whether it is
accepting applications).

── What was checked, and what was NOT allowed to decide ──────────────────
An earlier pass took `/om-forskningsradet/programmer/<slug>/` returning 301 to
the generic portfolio index as per-programme evidence of retirement. It is not.
A slug INVENTED for the test -- `zzz-not-a-real-programme-xyz` -- returns the
same 301. The redirect is a catch-all for the whole retired subtree, so it says
one true thing about the tree and nothing about any individual programme. It is
recorded below as context and never as a row's basis.
"""
import json

CHECKED_AT = "2026-08-12"
DATA = ("https://www.forskningsradet.no/tall-analyse/statistikk/"
        "offentlige-data/databeskrivelse/")
CALLS_API = "https://www.forskningsradet.no/api/v1/search/proposal/no/18404"

# Verbatim from DATA, fetched 2026-08-12 (HTTP 200).
BREAK_QUOTE = (
    "Frem til 2019/2020 var Forskningsradets utlysninger av midler til forskning "
    "og innovasjon forst og fremst organisert rundt ulike finansieringsaktiviteter "
    "(ulike tematiske programmer, fri prosjektstotte, senterordninger, stotte til "
    "infrastruktur etc). De siste arene har fokus for utlysningene vaert ulike "
    "soknadstyper (forskerprosjekt, innovasjonsprosjekt etc) innenfor ulike "
    "tematiske eller ikke-tematiske omrader. [...] Det er et brudd i tidsserien "
    "for soknadstyper i 2019/2020."
)

SAYS_NFR = (
    "The council's own data description states that its calls stopped being "
    "organised around finansieringsaktiviteter in 2019/2020 and are now "
    "organised around soknadstyper published as utlysninger. Our row IS a "
    "finansieringsaktivitet -- the ledger code an award was booked under, which "
    "is what `extract_nfr.py` reads out of `currentActivity.activity`. The "
    "council's calls register lists 51 calls accepting applications today and "
    "none of them is this row: the two are different units of record. So this "
    "row is not a thing a founder can apply to, whatever money moved through it."
)


def rec(r, verdict, says, quote, url, status, action, basis, note=None,
        mismatch=None, title=None, confidence="high", window="none stated"):
    return {
        "instrument_id": r["id"],
        "country": r["country"],
        "we_claim": {
            "name": r["name"],
            "scheme_code": r["scheme_code"],
            "scheme_end_date": r["scheme_end_date"],
            "scheme_end_date_basis": r["scheme_end_date_basis"],
            "last_year": r["last_year"],
            "event_count": r["event_count"],
            "total_eur": r["total_eur"],
            "administering_body": r["administering_body"],
            "why_offered": (
                "no scheme_end_date is recorded, so the row is open by default; "
                "its source_window_policy is "
                + str(r["source_window_policy"]) + ", i.e. we recorded that the "
                "register states no window for objects of this kind"),
        },
        "checked": {"url": url, "http_status": status,
                    "checked_at": CHECKED_AT, "page_title": title},
        "funder_says": says,
        "quote": quote,
        "window": window,
        "verdict": verdict,
        "basis": basis,
        "confidence": confidence,
        "corroboration": {
            "source": "Forskningsradet calls register (utlysninger API)",
            "endpoint": CALLS_API,
            "calls_total": 65,
            "calls_accepting_applications": 51,
            "note": "status.theme == 1 is the register's own 'Sok na'. "
                    "51 open calls exist; the corpus holds none of them as a row.",
        },
        "mismatch": mismatch,
        "action": action,
        "note": note,
    }


def main():
    raw = json.load(open("raw.json"))
    no = [r for r in raw if r["country"] == "NO"]
    out = []
    for r in sorted(no, key=lambda x: x["id"]):
        iid = r["id"]
        if iid.startswith("innovasjon_norge_"):
            out.append(rec(
                r, "unsettled",
                "innovasjonnorge.no returns a Radware 'Security Check' "
                "interstitial to automated fetches, so the funder's own page "
                "could not be read. Nothing here settles this row either way.",
                "Security Check - Innovation Norway",
                r["eligibility_source_url"], 403, "none",
                "page blocked (HTTP 403, Radware). Innovasjon Norge is already "
                "recorded in seed_agency_routes.py as refusing automated access.",
                note="Visible WITHOUT any fetch, and worth acting on separately: "
                     "all eight rows carry the single name 'Innovasjon Norge', "
                     "which is the agency, not a scheme. Six grant rows are "
                     "distinguished only by an internal suffix "
                     "(cluster/innovation/regional/sector/startup/international).",
                mismatch="yes - the row is named after the agency, not a scheme",
                title="Security Check - Innovation Norway"))
        elif iid == "innovation_fund_hbank_2024_maritime":
            out.append(rec(
                r, "unsettled",
                "We hold no funder page for this row, so nothing was checked.",
                None, None, None, "none",
                "no source URL on the row",
                note="The name is a loader-constructed label, not a scheme "
                     "title. Two award events, EUR 35m. Worth a look on its own.",
                mismatch="yes - 'Innovation Fund Hbank 2024 Maritime' is a "
                         "constructed label, not a name any funder publishes"))
        else:
            out.append(rec(
                r, "not_a_fund", SAYS_NFR, BREAK_QUOTE, DATA, 200, "rekey",
                "the council's own published data description (fetched "
                + CHECKED_AT + ", HTTP 200) plus its own calls register",
                note="DO NOT SUPPRESS ON THIS ALONE. The verdict is about the "
                     "UNIT, not about liveness: several of these codes carry "
                     "live 2026 money (nfr_inno has open calls right now). The "
                     "fix is to re-key Norway onto the utlysninger that "
                     "ETL/terms/harvest_nfr_open_calls.py now harvests, and to "
                     "retire these rows only once that replacement is in place.",
                mismatch="yes - the row is a finansieringsaktivitet (ledger "
                         "code), not an utlysning (the applicable unit)",
                title="Databeskrivelse - Forskningsradet"))
    return out


if __name__ == "__main__":
    for r in main():
        print(json.dumps(r, ensure_ascii=False))
