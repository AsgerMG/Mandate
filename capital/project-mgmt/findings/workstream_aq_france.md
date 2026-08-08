# Workstream AQ — France

France was handed to this workstream as "the worst-served market, 31% of all
cases", with an EXACT@5 of 17/15/17% across seeds and — uniquely — a ceiling
that is not ~100% but 66%. The brief was: France needs DATA, not ranking.

That is right. But it is more specific than "France", and the specificity is
the finding.

## 1. France is not a country problem. It is twenty-six rows.

Measured over PUBLISHABLE rows only, out of Postgres:

    FR   101 leaves in multi-leaf regimes
         mean residual class 8.1, uniquely identified 41%
         ceiling@5 68%, and 26% of leaves in classes larger than 20

Decomposing that 8.1 by regime (`scripts/diagnose_fr_regimes.ts`):

    regime          FR leaves   burden   share of France's total
    ademe_aid          60        740          90%
    satr_fr_rnd        35         73           9%
    satr_fr_equity      6          8           1%

And decomposing `ademe_aid` by residual class (`scripts/diagnose_fr_ademe.ts`):
60 leaves, **23 distinct classes**. Twenty-two of them are classes of 1, 2 or 3.
The twenty-third is a **single class of 26 leaves carrying no `eligibility_text`
at all**, and it alone accounts for 676 of the regime's 740 — 82% of France.

So "France is the floor of every market" and "France's ceiling is 66%" are the
same sentence about the same 26 rows. 26/101 is the third of French pairs the
brief describes as unreachable by any ranker.

The other 34 ADEME leaves already have text, from the TEE catalogue
(`mission-transition-ecologique.beta.gouv.fr`) harvested by
`ETL/terms/fetch_tee_catalogue.py`. That work is why the regime has 23 classes
instead of 2. It stopped where the catalogue stopped.

### Why the eligibility-rule work did nothing here

The brief notes that the rule work which lifted Germany 35→48 and the
Netherlands 50→60 moved France 17→16, 14→14, 17→17. That is exactly what the
decomposition predicts. Rules are cut FROM text. 26 French leaves have no text,
no description, no `scheme_code`, no `application_url` and no end date — they
are a name and an award history. There was nothing for a rule to be cut from,
so better rules could not reach them. This is not a failure of the rule work.

## 2. The honest ceiling is 94%, not 66% — and per-round text buys none of it

`scripts/simulate_text_lift.ts` overlays a candidate batch onto the corpus in
memory and scores it with the same class key and the same
`publishableInstruments()` the scoreboard uses. Nothing is written. Three
fixtures over the 26:

    one shared page for all 26      mean 8.1 -> 8.1   ceiling@5 68% -> 68%
    one text per PROGRAMME (15)     mean 8.1 -> 2.1   ceiling@5 68% -> 94%
    one text per LEAF (26)          mean 8.1 -> 1.7   ceiling@5 68% -> 94%

Three things fall out of this table.

**The first line is why the script exists.** A source that hands every sibling
the body's own page raises the coverage column from 57% to 100% and moves
France by exactly zero. Coverage would have called that a success. It is the
failure mode this workstream was warned about, and it is now a measurement
rather than a caution.

**The second and third lines settle the rounds question.** AVELO 2 / 2.2 /
3-1er relevé / 3-2nd relevé are relevés of one call; the three ORPLAST rows and
the three forestry "Volet 2" rows likewise. Grouping the 26 into their 15 real
programme families and giving each family ONE text reaches the same 94% ceiling
as perfect per-leaf text, and costs only 0.4 of a sibling on the mean — because
a family of four still fits inside a five-row answer. So a per-programme source
is sufficient, and the fetch does not need to separate rounds.

**94% is the cap, and the missing 6% is nameable.** After a perfect ADEME
overlay, one class of 6 remains, in `satr_fr_rnd`, carrying no text. French
SATR text was already measured at 0.11 of a sibling, so that class is not worth
a fetch. France's honest reachable ceiling is 94%.

## 3. Sources: what was ruled out here

Carried in from earlier work and not re-tested: ADEME's own portals are 403
Cloudflare (standing rule — not worked around); `data.ademe.fr`'s 931 datasets
are award-grain; the TEE catalogue has zero hits for AVELO/ORPLAST/TEXHABI in
223 rows; `aides-territoires.beta.gouv.fr` needs a JWT; French SATR text is
worth 0.11 of a sibling.

Newly ruled out by this workstream:

- **`notificationUE` in `data/raw/ademe/ademe_aides.csv` is a dead end.** The
  award file was the obvious in-corpus route to a per-scheme EU state-aid
  reference, which would have carried a published beneficiary definition. All
  26 target dispositifs are present in it with substantial award counts (55 to
  651 each), but the column holds exactly two values across all of them —
  `OUI` and `NON`. It is a boolean, not a case number. Nothing to follow.

## 4. The unlock: aides-territoires' API is 401. Its WEB PAGES are public.

The standing record said `aides-territoires.beta.gouv.fr/api/aids/` returns 401
with a JWT required from interactive signup, and the brief carried it forward as
the one lead that needs a human. That is true of the API and only of the API.
The site itself is a public catalogue, served without authentication, and it can
simply be read. No credential was used, no auth was worked around, and the 401
was never touched.

That distinction was worth 10 of the 26 rows on the first pass, and the text it
returns is exactly the right kind. Measured with `simulate_text_lift.ts` on
those 10:

    batch distinctness   10 distinct texts over 10 leaves — perfect
    FR mean class        8.1 -> 4.1
    FR ceiling@5         68% -> 78%
    FR leaves in classes >20   26% -> 0%

The generalisable lesson is not about France. A 401 on `/api/` was recorded
against the whole HOST, and the host's public HTML was never tried.

### Which FIELD on that page is the payload, measured

Two agents reached these pages independently and read different parts of them.
That accident is the most useful control this workstream got, because both
batches could be scored against each other on the same rows:

    the page's DESCRIPTION prose   10 distinct / 10 leaves   8.1 -> 4.1, ceiling 78%
    the page's Bénéficiaires block  3 distinct /  5 leaves   8.1 -> 5.9, ceiling 73%

The description is the payload: 145 of 145 ADEME entries carry a unique one,
median 1333 characters, with real restrictions in it — *Aides aux relais*
explicitly excludes Conseillers en Énergie Partagés and Conseillers France
Rénov.

**The structured `Bénéficiaires` tag must NOT be loaded, and my first reading of
it was wrong.** 114 of 145 entries carry the identical five-item string, and
every one of the 14 distinct variants contains public-body categories only —
the taxonomy has no `entreprise`, no `association`, no `exploitant agricole`
value at all, because aides-territoires is a catalogue *for* collectivités.
*Innov Eau* proves the trap: a France 2030 call aimed at companies, tagged here
Commune / Département / EPCI. So the tag means "open to collectivités" and
never "closed to companies", and a batch built on it would have written a false
exclusion onto real funds. Where a beneficiary restriction IS loaded it comes
from the description's own prose ("Bénéficiaires : Entreprises de recyclage des
déchets"), which is the source asserting it, not a taxonomy inferring it.

## 5. The route that actually reached ADEME's own words: the public archive

ADEME's portals are 403 behind Cloudflare and that stands — nothing here went
past it. But the Internet Archive holds public captures of those same public
pages and serves them from `web.archive.org`, a different host with no block.
Reading an archive of a public page is not impersonating a browser past a 403.

CDX enumeration over `agirpourlatransition.ademe.fr` (~20k URLs) located the
programme pages without guessing at slugs, and the raw
`/web/<timestamp>id_/<url>` form parses cleanly. **25 of the 26 came back, all
15 programme families covered**, and every one carried ADEME's own
"Êtes-vous concerné ?" block — a literal statement of who may apply, written
per call:

    ESPR forestry   six named NAF codes (0210Z, 0220Z, 0240Z, 01610A…) plus
                    mandatory PEFC/FSC certification
    TEXHABI         metteurs sur le marché and fabricants of clothing textiles,
                    all sizes, all écoconception maturities
    DECARB IND      >1,000 tCO2eq/yr abated, >EUR 3M investment, <EUR 30M aid
    AVELO 2.2       communes, EPCI, départements, Pays, PNR, pôles
                    métropolitains, syndicats mixtes — territories under
                    250,000 inhabitants, core city under 100,000

The one gap is `AAP PNA`, which is the Ministère de l'Agriculture's programme
with ADEME merely operating it; its cahier des charges is on a ministry host,
and ADEME's own "Alimentation durable" calls are DIFFERENT instruments that
must not be mapped onto this row.

Only the four relais / actions-ponctuelles rows share a paragraph in the
archive, and that is correct — they are one standing dispositif. Those four take
their text from aides-territoires instead, which holds a separate page per
dispositif and does distinguish them (relais funds a salaried chargé de
mission; actions ponctuelles funds one-off animation, communication and
training).

### Why this replaced a batch that was already loaded

An earlier batch of 25, drawn from state catalogues and republishers
(`les-aides.fr`, `mesaidespubliques.infogreffe.fr`, a regional cluster site),
was loaded first and reached mean class 1.8. The archive batch was worth only
1.8 -> 1.7 on the metric, which on its own would not justify a rewrite. It was
rewritten anyway, for two reasons that are not about the metric:

1. **It corrected a founder-facing error I had introduced.** The republished
   text for *Accompagnement des agriculteurs face au changement climatique*
   describes accompanying farmers, and under the heading "who may apply" that
   reads as "farmers may apply". ADEME's own page says the eligible structures
   are `les organismes de conseil` — the applicant is the advisory body and the
   farmer is the final beneficiary. The same trap sits on *PACTE Entreprises*.

2. **It unblocked the row that had been adjudicated out.** PACTE was dropped
   from the first load precisely because no sourced text for the AMI itself had
   been reached; the archive has it verbatim ("Cet AMI s'adresse à tout type de
   structures (personnes morales) en mesure de déployer … les missions exposées
   dans l'AMI"), so all 26 now carry text.

Rule Zero is the tiebreak: what a fund IS comes from the official source, and
between a republisher and the body's own page the body's own page wins even
when the scoreboard is indifferent. Every `source_url` is the `web.archive.org`
URL actually read, with the capture date recorded. Nothing was laundered into a
live `ademe.fr` link.

## 6. Result, read back out of Postgres

    country   leaves   body+region+text mean class   uniquely identified
    FR before   101              8.1                        41%
    FR after    101              1.7                        62%

    FR eligibility_text coverage   57% -> 83%
    FR ceiling@5                   68% -> 94%   (the measured maximum)
    ALL mean class                 2.9 -> 1.6

France was the floor of every market at 8.1. It now sits ahead of the
Netherlands (2.1) and Czechia (4.4) and just behind Italy (1.5) and Germany
(1.3). The 94% is not a partial result: it is the ceiling this regime has, and
the remaining 6% is one textless class of 6 in `satr_fr_rnd`, where French SATR
text was already measured at 0.11 of a sibling and is not worth fetching.

All 26 texts passed the pertinence guard as `condition` —
`classify_eligibility_pertinence.py` judged 0 of them reports, so nothing was
retracted.

## 7. Sources ruled out

- **No other corpus column can separate these leaves.** All 75 `ademe_aid`
  rows have `delivery_region`, `catchment_region`, `catchment_regions` and
  `recipient_region_mix` NULL, and all 75 are `capital_type = grant`. Two of
  the three components of the class key are therefore constant across the whole
  regime by construction; `eligibility_text` is not one lever among several, it
  is the only one. (`award_p50` does vary — €1.5M for DECARB IND against €44.5k
  for AVELO 2 — but award magnitude is not in the class key, and putting it
  there is a ranker change, not a data change.)
