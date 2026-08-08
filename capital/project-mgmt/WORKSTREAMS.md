# Workstream board

One line per workstream, with what "done" means and where it actually is. Update
this when a workstream moves — it is the thing to read when the picture has gone
opaque.

**Status now: seven workstreams stalled mid-task on the Anthropic monthly spend
limit.** Each pushed its work first, so nothing is lost; each is resumable from
its branch. Raise the limit at `claude.ai/settings/usage` and they can continue.

---

## CLOSED

| # | Workstream | Done means | Evidence |
|---|---|---|---|
| ETL | Weekly pipeline runs unattended | trigger → run → census → verified restore | census #4; cron `0 3 * * 0` SUCCESS |
| — | One blocked source can't kill the week | `renew.py` 3=partial / 1=abort | ADEME 403 no longer stops the chain |
| ES | Spain offerable and legible | names are funds, weekly re-run, decay guard | 182 ES rows; refresh exits 0, both stores reconciled |
| DEG | Degradation policy shipped | no dead call shown, no recall cost | FR EXACT@5 17% vs blunt 8%; suppression 80→5 |
| COV | Coverage push | sibling class down, ceiling up | 17.9 → 3.6; @5 ceiling 39% → 85% |
| CAP | Leaf cap no longer silently binding | cap raised, baseline captured first | 90 → 250, headroom 147 |
| KEY | Answer key and artifacts trustworthy | leak index + semantic cache rebuilt | 0 leaks over 1,084 profiles |
| AI | Nothing a founder is judged by is a report about someone else | both columns judged at one property, build fails on an unjudged or stale one | 2,573 texts / 8,488 deciding gates at v3, 13/13 calibration; gates 4,251 → 4,244; prose 563 → 552; recall flat on 3 seeds |

## IN FLIGHT — all stalled on the spend limit

| # | Workstream | Approx | What it has | What remains |
|---|---|---|---|---|
| **AK** | Website numbers live from the DB | 80% | headline figures read the ETL corpus at render time | wire the coverage gate so a bad corpus can't reach founders; look at it in a browser, including DB-unreachable |
| **AF** | Guards without CI credentials | 60% | verdict-publishing pattern generalised | the scheduled workflow, dropping the DB secret entirely |
| **AE** | 22 German leaves cut pre-cap | 60% | identified the dedupe label that collapses them | re-measure both arms interleaved on the 1,086 corpus |
| **AH** | 36 scripts can measure nothing and exit 0 | 50% | build now fails on a re-pasted env preamble | actually run every converted script — a silent pass converted to a silent pass is worth nothing |
| **AG** | Explain +€55.6B and −558 companies | 30% | **found a second schema drift: four columns exist only from hand `ALTER`s** | measure which; then decompose the capital jump |
| **AJ** | Record whether a source publishes windows | 5% | — | the ADEME window fetch and the assignment pass |

## FOLLOW-UPS left open on purpose (AI)

- **Two of the eleven retracted rows deserve REPLACEMENT, not just retraction.**
  `satr_de_equity__sa_115337__landwirtschaftliche_rentenbank` named its
  applicant classes in a parenthetical — "(Landwirtinnen und Landwirte,
  Lohnunternehmerinnen und Lohnunternehmer, Maschinenring, Naturschutzverband)"
  — inside a sentence whose main clause is procedural, and
  `innovasjon_norge_grant_regional` buried "må bedriften ivareta prinsipper for
  ansvarlig næringsliv" in a page of state-aid administration. The classifier
  called both reports and it is defensible on the sentence AS A WHOLE, which is
  the property. But `narrow_but_satisfiable` in the calibration set says a
  restriction to a named TRADE is a condition, so these two sit close to that
  line. Retraction is the safe half of the fix; the source pages are cited on
  both rows and the honest end state is prose taken from them. Do not settle it
  by hand-editing a verdict.
- **The two Altum rows had the granting body's name in the eligibility column
  and `administering_body` NULL.** The retraction cleared the wrong-column
  value; it did not populate the right one, because what a fund IS comes from
  the official source and not from our own mis-filed column.

## HOLDING, deliberately

- **Do not deploy €408.4B to the site.** The site ships €352.9B / 297,933 events.
  The database holds €408.4B / 299,384. The +€55.6B is €38M per new event —
  plausible for state aid, implausible for most sources — and **undecomposed**,
  because the census block that would have shown the breakdown failed on the
  schema drift AG is now chasing. Companies also fell 558 with no verified
  cause. Publishing a headline we cannot explain is what the coverage gate
  exists to prevent.

## NEEDS YOU

1. **Raise the spend limit** — seven workstreams are stopped on it.
2. **iCloud → Optimize Mac Storage**, or 1.4G of staged backups never evicts.
3. A JWT for `aides-territoires.beta.gouv.fr` if France's last 26 leaves matter.
4. **The GitHub DB secret is probably unnecessary** — AF is removing the need.

## The pattern worth remembering

Nearly every defect this week was the same shape: **work that reported success
having done something else.** A loader writing to a store nothing reads. A guard
reading a stale artifact. A check exiting 0 because it could not find
credentials. A trigger script that did it three separate ways. The recall number
is not the durable output of this work — the guards that make that class of
failure loud are, and several of those were themselves silent until this week.
