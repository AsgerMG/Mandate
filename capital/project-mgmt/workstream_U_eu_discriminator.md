# Workstream U — the EU discriminator, one level below the boilerplate

Branch `workstream-u-eu`. Scope: the EU tier of `funding_instruments`, judged on
`npx tsx website/frontend/scripts/measure_sibling_coverage.ts`.

Steering probe added here: `project-mgmt/probe_eu_regimes.py` — the same residual-class
computation as the scoreboard's headline row, restricted to regimes holding an EU leaf and
reported per regime. The global metric is leaf-weighted over 797 leaves and EU is ~8% of
them, so it cannot tell you which EU regime is still unresolved. Reads Postgres.

---

## FINDING 0 — the handover's numbers were two rounds stale, and the remaining work is a third of what it looked like

The brief handed over "11 of 67 EU covered, `horizon_eu_partnership` 3 abstentions
outstanding". Measured against Postgres at the start of this workstream:

```
regime                     leaves  EU  covered  meanclass
horizon_eu_pillar_ii           10   9        0      10.00   <- unresolved
eit                             9   1        1       7.22   <- see FINDING 3
edf                             3   2        0       3.00   <- unresolved
ipcei                          12  11       11       1.00
innovation_fund                 9   7        8       1.00
horizon_eu_partnership         10   9        9       1.00   <- resolved since the handover
eit_manufacturing / eit_digital / eit_climate_kic       all 1.00
eic                             5   4        4       1.00
chips_ju                        3   2        2       1.00

EU-containing regimes: 11 regimes, 68 leaves, local mean class 3.24
EU rows: 67, with eligibility_text > 40 chars: 47, with administering_body: 17
global: mean class 3.9, uniquely identified 53%
```

So the payable EU work is **`horizon_eu_pillar_ii` (9 live leaves) and `edf` (2 live
leaves)** — 11 rows, not 56. Everything else is either already at class 1.00 or is not a
row a founder can be shown (FINDING 3).

`horizon_eu_partnership` reaching 1.00 does **not** mean its three abstentions were
answered. It means eligibility *text* was written for `euspa`, `ihi` and `sesar_ju`; all
three still carry `administering_body = NULL`, and the diagnosis behind each abstention is
still live. See FINDING 2.

## FINDING 1 — the per-cluster discriminator exists, is verbatim, and is exactly where the brief said it would be

Horizon Europe work programmes are structured so that every call carries a
`Conditions for the Call` table whose `Eligibility conditions` row says, for the ordinary
case, only *"The conditions are described in General Annex B."* That sentence is the
boilerplate: identical across all nine Pillar II clusters by construction, which is why all
nine cite one file (`horizon_eu_general_annexes_2026_2027.pdf`) and why
`harvest_quoted_eligibility.py` correctly refuses every one of them as regime-inherited.

The discriminator is the block that follows *"The following exceptions apply"* /
*"The following additional eligibility conditions apply"*. Cluster 3 (Civil Security),
verbatim from its own work programme:

> This topic requires the active involvement, as beneficiaries, of at least 3 Police
> Authorities from at least 3 different EU Member States or Associated Countries.

> In line with the "restriction on control in innovation actions in critical technology
> areas" delineated in General Annex B, entities established in an eligible country but
> which are directly or indirectly controlled by China or by a legal entity established in
> China are not eligible to participate in the action.

No other cluster says either of those things. That is a condition a sibling would fail,
and it is one `pdftotext -layout` away.

**Each Pillar II cluster has its own work programme part, and none of them were on disk.**
That is the whole reason the regime sat at class 10: the corpus held the shared annex and
nothing else. Staged into `data/raw/instrument_docs/` (gitignored, so the fetch record is
here):

| file | pp | source URL |
|---|---|---|
| `horizon_eu_cl1_wp4_health_2026_2027.pdf` | 211 | `…/wp-call/2026-2027/wp-4-health_horizon-2026-2027_en.pdf` |
| `horizon_eu_cl3_wp6_civil_security_2026_2027.pdf` | 174 | `…/wp-6-civil-security-for-society_horizon-2026-2027_en.pdf` |
| `horizon_eu_cl4_wp7_digital_industry_space_2026_2027.pdf` | 314 | `…/wp-7-digital-industry-and-space_horizon-2026-2027_en.pdf` |
| `horizon_eu_cl5_wp8_climate_energy_mobility_2026_2027.pdf` | 339 | `…/wp-8-climate-energy-and-mobility_horizon-2026-2027_en.pdf` |
| `horizon_eu_cl6_wp9_food_bioeconomy_2026_2027.pdf` | 356 | `…/wp-9-food-bioeconomy-natural-resources-agriculture-and-environment_horizon-2026-2027_en.pdf` |
| `horizon_eu_eie_wp10_innovation_ecosystems_2026_2027.pdf` | 35 | `…/wp-10-european-innovation-ecosystems_horizon-2026-2027_en.pdf` |
| `horizon_eu_miss_wp12_missions_2026_2027.pdf` | 269 | `…/wp-12-missions_horizon-2026-2027_en.pdf` |

Base: `https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/horizon/wp-call/2026-2027/`

### Fetch note worth reusing — `curl` gets a soft-404 where `WebFetch` gets the PDF

The Commission's document host answers repeated `curl` requests from one address with a
**200-status HTML "Page not found" page**, not a 404 and not a 429. Two parts downloaded
cleanly, then five in a row came back as 115KB of HTML while `HEAD` on the same URLs still
reported 200 (the HEAD follows the redirect to the error page). Backing off to 35s between
requests did not help; the same five URLs then returned real PDFs through `WebFetch`, whose
binary passthrough writes the file to the tool-results directory.

So: `HEAD` is not a liveness test on this host, byte-size is, and `WebFetch` → copy the
saved binary → `pdftotext -layout` is the working path. No browser impersonation was used
and none is needed.

## FINDING 2 — the three partnership abstentions are three different defects, and only one of them is a missing fetch

Re-diagnosed against `derive_administering_body_from_docs.py`, which page-reach scores the
legal-form names in each instrument's own document:

- **`sesar_ju` — `top: []`.** Its only linked document, `sesar_ju_qa_document_v1.pdf`,
  contains the string "Joint Undertaking" **zero times**. It writes "SESAR 3 JU"
  throughout. The tool is right to abstain and the fix is not a regex: adding `JU` as a
  legal form would match "the JU" everywhere and manufacture names out of prose. The fix is
  the document. `sesar_ju_bawp_2026_2027.pdf` (67pp, GB(D)08-2025) has been sitting on disk
  since 22 July and opens with the words "SESAR 3 Joint Undertaking" — it is simply not
  linked to the instrument by any row in `eligibility_gates`, `eligibility_clauses` or
  `instrument_application`, because the grounding pass chose the Q&A document for gates
  (correctly — the BAWP has almost no eligibility text) and never recorded the BAWP at all.

- **`ihi` — the knee rule picks a prose run-in and then fails its own floor.** Best page
  reach in `ihi_guide_for_applicants.pdf` is 2, held by "Innovative Health Initiative Joint
  Undertaking". `TOLERANCE = 1` lets a name at reach 1 be selected if it is longer, so the
  winner becomes *"Introduction The Innovative Health Initiative Joint Undertaking"* at
  reach 1, which then fails `MIN_PAGES = 2` and abstains. The correct name lost to a
  sentence that happened to wrap it. This is a general defect, not an IHI one: it fires
  whenever a body's best reach is at or just above `MIN_PAGES`.

- **`euspa` — the document genuinely is not EUSPA's, and no fix to the tool changes that.**
  Its gates were cut from `euspa_horizon_wp7_digital_industry_space_2026_2027.pdf`, which
  `pdfinfo` reports as *"7. Digital, Industry and Space"* — the Horizon Europe Cluster 4
  work programme, 314 pages, EC Decision C(2025) 8493. It is byte-identical (2,263,869
  bytes) to the file this workstream downloaded as `horizon_eu_cl4_…`. The string
  "European Union Agency for the Space Programme" appears in it **once**, so page reach is
  1 and abstention is correct. EUSPA is an EU agency, not a Council-Reg-2021/2085 Joint
  Undertaking, and does not publish a JU-style work programme — the previous grounding pass
  recorded that reasoning in the doc manifest and it is right. The consequence is that
  `euspa` needs a EUSPA-authored source, and that Cluster 4's own work programme has been
  in the corpus all along filed under another instrument's name.

  Not a conflict for the scoreboard: `euspa` sits in `horizon_eu_partnership` and
  `horizon_eu_cl4` in `horizon_eu_pillar_ii`, so they are never siblings and never compete.
  It is still worth saying out loud that they are close to the same offer.

## FINDING 3 — the `eit` regime's class of 7.22 is made entirely of rows a founder cannot be shown

`eit` holds 9 leaves. Eight of them — `eit`, `eit_climate_kic`, `eit_digital`,
`eit_food`, `eit_health`, `eit_innoenergy`, `eit_manufacturing`, `eit_rawmaterials`,
`eit_urban_mobility` — are **containers**: each is the parent of its own sub-regime, and
`live_ids()` excludes parents because they are not offers. The real EIT offers are the
sub-regime leaves (`eit_food_rfs`, `eit_health_catapult`, `eit_digital_vap`, …), and every
one of those already carries eligibility text.

Writing eligibility prose onto those eight rows would take the regime from 7.22 to about
1.0 and move the global mean, while changing nothing any founder ever reads. **That is
coverage bought against the metric rather than against the product**, and this workstream
declines it. Recorded here so the next agent does not read `eit 7.22` as available work.

---

## What was delivered

Eleven leaves written and published, all through `load_scheme_text.py --country EU --write`,
which publishes by default and reconciles both stores at the end of the run. Every number
below was read back out of Postgres.

```
                                 before      after
EU-containing regimes (11 regimes / 68 leaves)
  local mean class                 3.24       1.82
  horizon_eu_pillar_ii            10.00       1.00   resolved
  edf                              3.00       1.00   resolved
  horizon_eu_partnership           1.00       1.00   (bodies completed, 6/9 -> 9/9)
EU eligibility_text > 40 chars    47/67      58/67   (87%)
EU administering_body             17/67      25/67
```

**Every regime holding an EU leaf is now at mean class 1.00 except `eit`**, whose 7.22 is
made entirely of container rows (FINDING 3) and is declined on purpose. The EU tier is
finished to the limit of what is honest.

The global scoreboard read 3.52 mean class / 56% uniquely identified at the end of this
workstream, against 3.9 / 53% at the start — but the corpus grew from 1,014 to 1,076 rows
and 797 to 780 multi-leaf leaves while this ran, because other workstreams were writing
concurrently. **The global delta is not this workstream's to claim.** The EU-local probe
is the clean attribution, and it is 3.24 -> 1.82.

| leaf | the condition a sibling would fail |
|---|---|
| `horizon_eu_cl1` | widens the country set instead of narrowing it: US legal entities are eligible for Union funding under the NIH reciprocity clause, on 37 pages |
| `horizon_eu_cl3` | a mandatory practitioner-beneficiary quota (2-3 Police / Border and Coast Guard / Customs Authorities from different states), with a definition that excludes police academies and forensic institutes from counting |
| `horizon_eu_cl4` | six mutually inconsistent Article 22(5) country lists in one document, from "Member States" alone up to one adding OECD, African Union, MERCOSUR, CARIFORUM and the Andean Community |
| `horizon_eu_cl5` | the 4-year exploitation lock on 61 pages, and TRL 6+ on 52 of 69 banded topics |
| `horizon_eu_cl6` | the multi-actor approach as an *eligibility* condition on 40 of 69 topics, with thirteen named actor classes; a research-only consortium is ineligible |
| `horizon_eu_miss` | closed-register membership — at least one of three cities must be among the 112 selected Mission cities, or a signatory of the Adaptation Mission Charter. Eligibility turns on a political commitment made before the call opened |
| `horizon_eu_eie` | every one of its five topics derogates from the standard consortium rule; ten hubs from ten countries with a per-country cap keyed to a 35m population threshold |
| `erc_poc` | the applicant must already hold or recently have held an ERC frontier-research grant, and the idea must derive from it. No route in without one |
| `horizon_eu_cbe` | in-kind contribution by private members is scored under Impact, and a BIC membership certificate is a required annex — a consortium with no private-member industry cannot score |
| `edf_ra` | 100% of eligible costs across every activity open to it; generating knowledge is research-exclusive |
| `edf_da` | prototyping at a 20% baseline (55% after bonuses), and the entire bonus table is headed "for development actions" |

## FINDING 4 — the Copernicus/Galileo mandate is regime boilerplate, and this brief said it was a discriminator

The handover into this workstream offered the Copernicus/Galileo/EGNOS obligation as a
*verified* Cluster 3 discriminator. It is not one. Measured by page reach across the
cluster work programmes: **36 pages in Cluster 3, 36 in Cluster 1 Health, 17 in Cluster 4,
96 in Cluster 5** — where it appears in 86 of 93 eligibility blocks. It fails the sibling
test outright and was cut from every record.

Two independent extraction passes caught this without being told, from opposite ends of the
corpus. It is worth stating plainly because the same example may have been handed to other
workstreams: **a condition that reads as specific because it is unusual is not thereby
discriminating.** The only test is whether a sibling would fail it, and that is a
measurement across siblings, never a judgement about one document.

The related correction: the blanket exclusion of entities *established* in China is General
Annex behaviour (6 pages CL1, 6 CL3, 5 CL4) and is worthless. The topic-level *control*
test is the discriminating one and is a Cluster 3 signature — 16 pages against 4 in CL4 and
2 in CL1. Encoding the first as a discriminator would have been the same non-discovery.

## FINDING 5 — the body-deriver's property fails on Commission-run instruments, and reach cannot rescue it

`derive_administering_body_from_docs.py` rests on the property that an EU awarding body
carries its legal form in its name. Dry-run against the newly staged cluster work
programmes it returns two confidently **wrong** answers:

```
horizon_eu_cl5 -> Clean Hydrogen Joint Undertaking     (4 pages, rival 2)
horizon_eu_cl6 -> Europe Joint Undertaking             (4 pages, rival 0)
```

Neither JU runs those clusters. The cause is not a scoring bug. **Cluster 5's work
programme names no executive agency at all** — zero hits for CINEA, HaDEA, REA, EISMEA or
any spelled-out form — because its author is the Commission, and the Commission's own name
carries no legal form. The only legal-form names in the document therefore belong to
partner JUs. Page reach and the rival margin rank the candidate space; they cannot help
when **the true answer is absent from it**.

This is the same defect as `ipcei_hy2tech` and `ipcei_hy2use`, which both derive "Clean
Hydrogen Joint Undertaking" from Commission state-aid decisions that merely mention the JU.
Verified pre-existing by re-running the tool at the parent commit. All four rows are NULL
and were left NULL, and no `--write` was run on either regime.

The obvious guard — require the winner in the document's front matter — was **measured and
rejected**: it separates the two IPCEI false positives, and it also refuses `europes_rail`,
`ihi` and `chips_ju_kdt_unknown`, which are correct.

Cluster 4 shows what the real fix is. Its document states its granting authority explicitly
and fifteen times, *"the granting authority (i.e. DG-CNECT and HaDEA)"*, and on the space
destination *"(i.e. DG-DEFIS and HaDEA)"*. That is a **role attestation**, and it is
strictly better evidence than page reach: it says who runs the programme rather than who is
mentioned in it. A pass over role phrases, abstaining when the actor named in that role
carries no legal form, is the principled repair. It is larger than one night can verify, so
the bodies written here are the ones a reader attested, and the wrong ones are not written.

## FINDING 6 — checking the quotes array is not checking the published text

`probe_verify_extracted.py` (added here) runs four checks before anything reaches a
database: every quote verbatim in the named document, a hard refusal of any
`scheme_end_date`, pairwise own-share within the regime at a floor of 0.50, and a report of
any sentence lifted from the shared General Annexes.

The first version checked only the `quotes` array — which verifies what an extractor claims
to have **read**, and says nothing about the text that reaches the column a founder sees.
Adding the check that every span the `eligibility_text` puts inside quote marks must itself
be verbatim caught **six defects in already-published rows, including in my own editing
pass**:

- `horizon_eu_cbe` quoted an award criterion the document never states — an extractor's
  paraphrase of the IKOP rule, wrapped in quote marks.
- three more in that record ended a quotation on a full stop the document does not have, or
  swapped its inner double quotes for single ones.
- `erc_poc` quoted a figure `pdftotext` renders as `EUR 150 00077`, the footnote fused to
  the numeral. No normalisation strips that without risking real numerals, so the figure is
  now stated outside the quotation.
- `horizon_eu_cl4` scare-quoted "Member State or Associated Country", a term of art that
  does not occur in that document at all.

None changed a conclusion. All six made the column assert that a source said something it
did not. Two of the checker's own false alarms were also real bugs and are fixed: spans are
taken by splitting on the quote glyph rather than by a regex pair, which had been matching
the *gap* between two quotations; and comparison drops footnote digits fused to a word,
since otherwise no honest quote from a footnoted PDF can ever verify.

**Recommendation: this belongs in `npm run check`.** It reads only committed JSON and files
under `data/raw/`, so it cannot be a CI step as written (no CI step may read gitignored
data), but the same property should guard the column however it is enforced.

## FINDING 7 — IPCEI: the previous agent was right, and the text that has since been written should be retracted

Asked to agree or disagree, and to say which: **agree, and the disagreement has already
been overruled by events.** All eleven `ipcei` leaves now carry eligibility text and the
regime reads 1.00. Read what it says:

> "The Member States only grant support to the beneficiaries listed section 2.2.6 and the
> funding is not available to all undertakings in a comparable situation."

> "The aid will be granted by the Direction General for Enterprise in France, by the Federal
> Ministry for Economic Affairs and Energy in Germany..."

That is harvested from Commission state-aid decisions, written in the third person about a
**closed approval with a named beneficiary list**. The first sentence is, in as many words,
a statement that the reader cannot apply — presented in the column a founder reads as the
fund's own eligibility guidance. It is worse than the ordinary coverage-without-separation
failure: it cut the sibling class *and* it cannot help anyone apply.

Measured cost of retracting all eleven: **global mean class 3.52 -> 3.69, +0.17.** That is
the price of the honesty, and it is small. The honest fix remains a closure marking rather
than eligibility prose.

Not retracted here. It is outside this workstream's scope, the rows belong to whoever wrote
them, and a metric other workstreams are steering by should not move under them without
their knowing. Handed over with the number attached so the decision is cheap to make.

## FINDING 8 — `euspa` and `horizon_eu_cl4` are close to the same offer

EUSPA's Horizon calls live inside the Cluster 4 work programme; EUSPA does not publish its
own. They are not siblings — `euspa` sits in `horizon_eu_partnership` and `horizon_eu_cl4`
in `horizon_eu_pillar_ii` — so they never compete on this scoreboard and nothing here is
wrong. Worth recording anyway: a founder shown both is being shown one route twice.

## What refused, and what was not worked around

- The Commission document host answers repeated `curl` requests with a 200-status HTML
  "Page not found". `WebFetch` retrieves the same URLs. No User-Agent was set and no block
  was worked around. `HEAD` is useless as a liveness test here; byte-size is the check.
- `ihi.europa.eu` TLS was **not retried and not worked around**, per the standing rule and
  the previous agent's note. It did not need to be: IHI resolved from documents already on
  disk.
- ERC direct `erc.europa.eu/system/files/...` guesses 404'd then 429'd; the extraction pass
  stopped guessing and took the link from ERC's own "Key documents" page. Correct call.
- The **prior Member State commitment to procure** — the textbook EDF development-action
  discriminator — is **not in either the 2026 or the 2025 Part 2 work programme**. Both
  delegate to "Articles 9 and 10(4) of the EDF Regulation", and use that identical phrase
  for the research-action calls too. It was written into neither leaf. Attesting it needs
  Regulation (EU) 2021/697 as a source, and nobody should seed it from the work programme.
- Cancer Mission topics carry no additional eligibility condition beyond the General Annex
  cross-reference. That is a finding, not a search gap.

## For whoever picks this up

1. **The EU tier is done.** The only remaining EU number is `eit` at 7.22, and FINDING 3
   says why taking it would be coverage bought against the metric rather than the product.
2. **Take the IPCEI decision** (FINDING 7). It costs 0.17 of global mean class and it is
   the difference between a column that helps and a column that misleads.
3. **The role-attestation pass** (FINDING 5) is the highest-value remaining change to the
   body-deriver, and `administering_body` is the strongest single separator in the corpus.
4. Text is not gates. `stage_fetched_text_as_docs.py` records that fetched
   `eligibility_text` did not move exact-scheme recall, because the adaptive round reads
   `eligibility_gates`. These eleven rows separate siblings on this scoreboard; turning
   them into gates is a separate, deliberate step with `gate_role` decisions in it.
