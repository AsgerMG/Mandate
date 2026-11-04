# What the funders' own pages said

wsFX, 2026-08-12. Evidence: `funder_evidence_2026-08-12.jsonl`, 193 rows.

## The headline

**The 119 rows held open by our own award history are mostly alive.** That was
the premise under test and it does not survive. Of the 56 funder pages read, 25
say the scheme is open and 5 say it is retired. The prior estimate — 30-35 of
them genuinely dead — is wrong by roughly a factor of five, and the clause in
`isClosed()` that reopens an expired `notified_duration` when `last_year >
endYear` is doing the right thing far more often than not.

That clause is described in the brief as something `liveness.ts` forbids
elsewhere. It is not the same thing. The prohibition is on the copy SUPPLYING a
declaration the register never made. This clause does the opposite: it lets an
observed award FALSIFY a declared expiry, which is the direction the file
explicitly allows and gives a legal reason for. The pages agree with it.

**The real defect in this population is granularity, not liveness.** 81 of 193
rows are not things a founder can apply to — but almost none of them are dead.
They are register artefacts and ledger codes carrying real award histories.

## The three findings that changed what should be done

**1. Eighteen rows are one German scheme, split by tax office.** `SA.56245`
appears eighteen times, named `Finanzamt Aachen-Stadt`, `Finanzamt Heidelberg`,
`FA für Körperschaften II`, `Zentralfinanzamt Nürnberg` and so on. The
Commission's own title for SA.56245 is *"Evaluation plan for the block exempted
R&D tax incentive"*. The scheme underneath is the **Forschungszulage**, and
bundesfinanzministerium.de presents it as live with a two-stage application
route. So: one real, open, national scheme, wearing eighteen tax offices' names,
keyed on an evaluation plan. Collapse to one row named `Forschungszulage
(FZulG)`. Do not suppress.

**2. Eleven rows are French and Slovak *régimes cadres* and Irish block-exemption
umbrellas.** `Régime cadre exempté de notification relatif aux aides à la RDI`
is not a fund; it is the frame under which regional aid is granted. Same for the
`Research Development and Innovation Group Block Exemption Scheme` and Puglia's
2014 `Regolamento regionale ... per gli aiuti in esenzione`, whose own text
points at *"la scadenza prevista nel bando"* — the bando being the applicable
unit. These are the same error `offerRoute.ts` already documents for GB's
`grantCategory` rows and Spain's legal-citation rows.

**3. Norway is a unit error, and the live half is the half that looks dead.**

## Norway

The brief's premise — that the research council re-booked onto new codes in 2025
and we ingested accounting codes as programmes — is right about the mechanism
and wrong about the date and the remedy.

The council's own data description (fetched 2026-08-12, HTTP 200) says the break
is **2019/2020**, not 2025:

> Frem til 2019/2020 var Forskningsrådets utlysninger [...] organisert rundt
> ulike finansieringsaktiviteter [...] De siste årene har fokus for
> utlysningene vært ulike søknadstyper [...] Det er et brudd i tidsserien for
> søknadstyper i 2019/2020.

All 65 `nfr_` rows are `finansieringsaktivitet` codes — the ledger line an award
was booked under, which is exactly what `extract_nfr.py` reads out of
`currentActivity.activity`. Both the title-case old names and the ALL-CAPS new
ones are entries in that same column. Neither is an applicable unit. The
council's calls register lists **51 calls accepting applications today** and not
one of them is one of our rows.

**So the ALL-CAPS codes are the LIVE half.** `nfr_inno` (`INNO-NAERING`) has
open calls right now. Suppressing the codes that "look like accounting codes"
would delete the live money and keep only rows whose last award was 2021-2024.
The action for all 65 is `rekey`, onto the utlysninger that
`ETL/terms/harvest_nfr_open_calls.py` now harvests — **not** suppress, and not
until that replacement is in place.

### A test that looked like evidence and was not

`forskningsradet.no/om-forskningsradet/programmer/energix/` returns 301 to the
generic portfolio index. So do `bia`, `iktpluss`, `petromaks2` and every other
retired programme — and so does **`zzz-not-a-real-programme-xyz`**, a slug
invented to test it. The redirect is a catch-all for a deleted subtree. It says
one true thing about the tree and nothing whatever about any individual
programme, and it is not used as any row's basis in the evidence file. An
earlier pass of this work had used it to mark 33 rows `retired`; that reading is
withdrawn.

## What could not be settled, and why

43 rows carry no verdict. That is a finding, not a gap in effort.

| why | rows |
| --- | --- |
| we hold **no funder URL at all** for the row | 20 |
| the page exists but refuses automated access (Radware, Cloudflare, Access Denied, HTTP 406) | 14 |
| Innovasjon Norge, behind a Radware wall, already recorded as refusing bots | 9 |

The 14 blocked pages include **ZIM** — Germany's flagship SME innovation
programme, almost certainly live. It must not be touched on this evidence. Three
of the blocked Italian pages are GSE and failed identically (a JavaScript shell
returning only navigation JSON), so a browser-rendering fetch would probably
settle all three in one pass.

Five rows initially read as unsettled were recovered for free by running
`pdftotext` over bytes we had already fetched. That is worth building in: the
fetcher stored PDFs as `.html` and the reader saw binary.

## Source-quality defects found on the way

These matter independently of liveness and each is on its row in the evidence
file under `mismatch` (49 rows carry one):

- `satr_de_equity__sa_101543__lfa_forderbank_bayern` cites a **FilmFernsehFonds
  Bayern film-funding directive** — script development, cinema production,
  distribution. Our row is named LfA Förderbank Bayern. Wrong page for the row.
- `satr_hu_equity__sa_57198__avhga` cites a **tax-news article on adozona.hu**,
  not AVHGA's own page.
- `satr_lu_rnd__sa_48476` and `satr_lu_rnd__sa_111797` resolve to the **same**
  live Luxembourg RDI regime under successive laws (2017 and 6 June 2025).
- Seven rows are one or two directive generations behind their funder's current
  version (aws erp-Kredit is now SA.121833; Invest BW is on Innovation III).
- All eight Innovasjon Norge rows carry the single name **"Innovasjon Norge"** —
  the agency, not a scheme — separated only by an internal suffix.

## The state-aid register as a second source

The Commission's case register (`webgate.ec.europa.eu/es/search-api`, POST, as
recorded in the state-aid case register note) was pulled for all 86 SA numbers
and their 45 linked cases. It carries two things worth keeping on the row:

- **12 cases have a later-ending linked case** — an actual prolongation, from
  the Commission's own record. Four are directly useful: FR SA.59108 →
  SA.111726 (ends 2026-12-30), IE SA.117696 → SA.122360 (2027-12-30), LV
  SA.103894 → SA.124036 (2027-06-29), GR SA.102166 → SA.111393 (2026-06-29,
  already past).
- **60 of 86 have Commission-recorded expenditure in a year after their own
  measure end date.** Suggestive of prolongation and consistent with the award
  evidence, but it is annual reported expenditure and can include the
  disbursement tail of aid already granted. It is recorded as corroboration and
  never used as a verdict.

## Proposed suppression

24 rows. `_wsfx_cost.ts` prices it against the shipped pool: **3.1% of the pool
(771 → 747)**, not the −12% the prior estimate assumed. Italy is **−13.4%**, not
−49%.

| country | removed | pool before | pool after | % of country |
| --- | --- | --- | --- | --- |
| IE | 3 | 9 | 6 | 33.3 |
| SK | 1 | 3 | 2 | 33.3 |
| IT | 9 | 67 | 58 | 13.4 |
| FR | 10 | 89 | 79 | 11.2 |
| DE | 1 | 103 | 102 | 1.0 |

Ireland at a third of its pool is the one to look at twice: three rows, all
block-exemption umbrellas, in a country that only has nine.

### How to run it, and the one thing that does not fit

`ETL/terms/mark_offer_route.py --status none` is the right mechanism for the 16
`not_a_fund` rows: it is durable across instrument rebuilds (`route_status` is
deliberately outside `BUILT_COLUMNS`) and it refuses to run without a source.

It selects by `--parent`, and these rows do not share a parent that isolates
them — they sit under `satr_fr_rnd`, `satr_it_rnd`, `satr_ie_rnd` alongside live
schemes. Selecting by parent here would take real funds with them.

The honest fix is a **property, not a list**: the Commission's own `caseTitle`
for the row's SA number is an evaluation plan or a framework regime. That is
checkable, it is stated by an official source, and it generalises to SA numbers
nobody has looked at yet. It wants a `--scheme-code` selector on
`mark_offer_route.py`, or the property encoded where the SA titles are already
loaded.

The 8 `retired` rows are a different fix and should not ride along: their
schemes really did end, so they belong on the liveness axis, not the route axis.

**Nothing here has been applied.** No production write was made by this
workstream.

## What would close the rest

- **A browser-rendering fetch** for the 14 blocked pages. Three GSE pages, ZIM,
  BMWK, MUR, MASE and adozona all failed as JS shells or bot walls. This is the
  single highest-yield next step: 14 rows, one capability.
- **Source URLs for the 20 rows that have none** — 11 FR, 5 BE, 5 IE, 5 PT. For
  most of these the SA case title already tells us what the row is; what is
  missing is where the funder publishes it.
- **PDF text extraction in the fetch path.** Five rows were recovered for free
  this way; the fetcher currently stores PDFs under `.html` and the reader sees
  binary.
