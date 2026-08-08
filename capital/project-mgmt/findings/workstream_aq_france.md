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

It discriminates because it states the beneficiary TYPE, and the types really
differ: "Aides aux relais" and "Aides aux actions ponctuelles" come back
collectivité / EPCI / établissement public / association, while "Investissements
de recyclage des déchets (dont ORPLAST régénération)" and ORPLAST Édition 3 come
back entreprises only. Those are the rows a founder most needs told apart,
because half of this regime is not open to a company at all.

The generalisable lesson is not about France. A 401 on `/api/` was recorded
against the whole HOST, and the host's public HTML was never tried.

- **No other corpus column can separate these leaves.** All 75 `ademe_aid`
  rows have `delivery_region`, `catchment_region`, `catchment_regions` and
  `recipient_region_mix` NULL, and all 75 are `capital_type = grant`. Two of
  the three components of the class key are therefore constant across the whole
  regime by construction; `eligibility_text` is not one lever among several, it
  is the only one. (`award_p50` does vary — €1.5M for DECARB IND against €44.5k
  for AVELO 2 — but award magnitude is not in the class key, and putting it
  there is a ranker change, not a data change.)
