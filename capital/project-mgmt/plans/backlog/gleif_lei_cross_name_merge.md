# Backlog: GLEIF LEI cross-name parent merge (merge Layer 3)

**Status:** backlogged 2026-06-18 (user call). The corpus ships with merge Layers 1
(deterministic exact-name dedup) and 2 (LLM brand/subsidiary). Layer 3 is the
*only* one that can catch **cross-name** parents — where the child's name shares no
token with the parent (e.g. Google↔Alphabet, a renamed acquisition). Layers 1–2
cannot see those; GLEIF relationship data is the external signal that could.

## Why it's deferred, not dropped
- **Coverage ceiling on this corpus.** LEIs are mandatory only for entities active
  in financial markets (securities, derivatives). The corpus is overwhelmingly
  SMEs, startups, research orgs, and small grant recipients — most have **no LEI**.
  Live spot-checks: Aerones Engineering (LV) → no LEI; even Siemens Gamesa → multiple
  country LEIs but mostly "reporting exception" (no parent reported).
- So the realistic yield is concentrated in large multinationals, which Layers 1–2
  already merge via shared name tokens. The unique cross-name catches are a small set.

## What to build when picked up
1. **Fix the probe matcher first** (`ETL/transform/gleif_probe.py`). As of 2026-06-18 it
   returns 0 hits even for Airbus/SAP/Bosch — `get()` is returning `None` (the GLEIF
   API call/parse is failing; debug the request headers / response shape before
   trusting any hit-rate number). The 0/200 random result was a matcher bug, NOT a
   real coverage finding.
2. Run the coverage probe (random + top-by-funding) to get a real hit-rate and a
   new-vs-already-caught-by-L1/L2 number. Decide go/no-go on that.
3. If go: download GLEIF golden-copy (LEI-CDF + RR-CDF), fuzzy name→LEI match across
   the corpus, pull `ultimate-parent` relationships, write proposals CSV, trap-scan,
   apply into `parent_group` alongside Layers 1–2.

GLEIF API is public/free and fast (~0.24s/call); no key needed. See
[[project_data_hygiene_merge]] for the merge-layer context.
