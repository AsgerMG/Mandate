# Workstream L-IT-SE — per-leaf eligibility coverage for Italy and Sweden

Running log. Written as the findings land, not at the end.

---

## FINDING 1 (2026-08-06) — Italy's low sibling class is NOT about eligibility_text.
### It is `administering_body`, and that redirects the other agents.

The brief asked which of three things explains Italy reaching a mean sibling class
of ~2.2 on only 34% eligibility coverage, when Germany needs 72% to reach 3.8:
structurally smaller regimes, unusually discriminating text, or coverage landing
exactly where it matters.

**None of the three. The separator is `administering_body`, which Italy already
has at high granularity.** Mean sibling class per country, each facet applied on
its own to the 53 multi-leaf regimes (`none` = the group size, i.e. guessing):

```
country          none    admin_body  delivery_region   elig_text   body+region     ALL3
DE               91.8           4.2             21.7        10.4           4.0      1.5
IT               57.3           4.4             17.9        27.0           3.3      2.0
CZ               32.5           7.2             25.6        25.5           6.1      5.6
NL               26.3          13.8             16.5         5.7          13.8      4.9
AT               19.5           5.3             12.3         3.0           5.1      3.0
FR               60.2          46.3             50.9        49.8          46.2     45.4
SE               42.6          39.4             42.0        40.8          39.2     39.1
ES               88.0          48.3             88.0        88.0          48.3     48.3
```

Italy goes 57.3 -> 4.4 on the delivery body **before a single character of
eligibility text is read**. Text then closes 3.3 -> 2.0. Germany is the same
shape (91.8 -> 4.2 on body alone). The two "good" countries are good because
their bodies are recorded and fine-grained, not because their text is.

**Why Italy has that.** Its two multi-leaf regimes are both SATR-derived, and
Italian delivery is genuinely fragmented across ministries, national agencies and
regions, so each leaf carries a different body:

- `SATR It Equity`, n=19 — 6 distinct administering bodies, 5 delivery regions
- `SATR It Rnd`, n=68 — **31 distinct administering bodies**, 15 delivery regions
  (MIMIT, MUR, MiTE, Invitalia, GSE, Mediocredito Centrale, Puglia Sviluppo,
  Regione Lombardia, ASA, ...)

So this is a *fourth* hypothesis the brief did not list, and it is the one that
holds: **the regime is body-fragmented, and body-fragmented regimes come
pre-separated.**

### The Italian text is nevertheless real signal, not boilerplate.

Marginal effect of the text *given* body+region are already known, within each
Italian regime:

```
SATR It Rnd     leaves WITH text  n=21  class 3.9 -> 1.4   (text cuts 64%)
                leaves WITHOUT    n=47  class 3.2 -> 2.4
SATR It Equity  leaves WITH text  n= 9  class 3.1 -> 1.4
                leaves WITHOUT    n=10  class 2.5 -> 1.6
```

18 of 21 Italian texts in the R&D regime are distinct. It is per-scheme text cut
from each scheme's own page, exactly as `ETL/terms/` intends. So Italian
collection is working; there is simply less of it left to win, because the body
column got there first.

### WHAT THIS MEANS FOR THE OTHER AGENTS — read this before bulk fetching.

Sort every regime into one of two kinds before deciding what to collect:

**Body-fragmented** (IT, DE, AT, BE): many bodies deliver one regime. `admin_body`
already collapses the class an order of magnitude. Marginal text is worth
collecting but it is the *second* lever, and its ceiling is low because the class
is already ~4.

**Programme-fragmented** (SE, ES, FR): ONE body runs many programmes, so
`administering_body` is near-constant and cuts almost nothing — SE 42.6 -> 39.4,
ES 88.0 -> 48.3, FR 60.2 -> 46.3. The extreme case is Sweden's `Vinnova` regime:
**50 leaves, 49 of which carry the literal string "vinnova" and one blank, one
single delivery_region, zero application_urls.** For these, per-programme
eligibility text is the *only* lever that exists, and it must be text cut from
each programme's own page. Any text lifted from the regime or the agency's
generic terms will be identical across all 50 leaves and will move the class by
exactly zero.

So: not "collect more of everything", and not "collect the right thing" in the
sense of a different field — **the field to collect is a function of the regime's
shape, and the countries with the worst numbers (FR, ES, SE) are precisely the
ones where only per-programme text can help.** That is also why they are hard:
there is no register row per leaf to read it off.

### Corollary — ES and FR cannot be fixed by an `administering_body` backfill.

Tempting shortcut, will not work. In ES, `delivery_region` and `elig_text` both
sit at 88.0 = the group size, i.e. *fully absent*, and body only halves it.
Those regimes are one-body-many-programmes.

---

## Baseline at start of workstream (2026-08-06)

```
eligibility_text over 40 chars: 240 of 1014 instruments
IT 30/88 34%     SE 10/63 16%
mean class over all 797 leaves, ALL THREE: 18.0   uniquely identified 36%
IT mean class 2.0   SE mean class 39.1
```

IT sits in 2 multi-leaf regimes (87 of 88 instruments).
SE sits in 2 multi-leaf regimes (62 of 63): `SATR Se Rnd` n=12 (83% covered,
class 1.8 — effectively done) and `Vinnova` n=50 (0% covered, class 48.0).

**Sweden's entire remaining job is the 50-leaf Vinnova regime.** Nothing else in
SE moves the number.
