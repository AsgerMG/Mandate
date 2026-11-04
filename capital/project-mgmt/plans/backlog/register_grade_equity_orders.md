# BACKLOG — Register-grade equity unlocks: DK CVR + NO aksjonærregister orders

> **Status: BACKLOG** (deferred 2026-06-11 by user decision during Sprint 19). Both routes are
> VERIFIED VIABLE; the only missing step in each is a request that carries the user's identity
> or credentials. No engineering remains until the data arrives.
>
> **When to revisit**: when the user submits either request, or when the Step 7 gate
> "≥3 E-A countries" (currently 2: EE, GB) becomes the binding constraint on the
> disclosure-scorecard publication.

## 1. Denmark — CVR legal owners (system-til-system)

- **What**: free application at virk.dk for CVR system-til-system access; then query
  legal-owner records for deltager ∈ {EIFO, Vækstfonden, Dansk Vækstkapital, …} → every direct
  stake with ownership ranges (5-10%, 10-15%, …) and dates.
- **Why it matters**: upgrades DK from E-B (EIFO's own Note 12 fund stakes, pct_exact at fund
  layer only) to E-A (company-level, independent of EIFO's goodwill).
- **Blocker**: application requires business credentials (MitID Erhverv) — USER ACTION.
- **On arrival**: extractor pattern is `extract_ee_register_stakes.py` (Sprint 19); ownership
  ranges map to `stake_pct_min`/`stake_pct_max`, `disclosure_level='pct_range'`.

## 2. Norway — aksjonærregisteret innsyn extract

- **What**: skatteetaten releases the full shareholder register as CSV on request
  (skatteetaten.no/deling/aksjonarregisteret — "uttrekk for innsyn"). FY2025 holdings
  (per 31.12.2025) open since 18 May 2026. Full dataset ≈1.7M rows; download link is emailed
  and valid one week.
- **Why it matters**: NO E-A — exact holdings for Investinor, Nysnø, Innovasjon Norge as
  shareholders, replacing the self-published portfolio pages (name_only, survivorship-biased).
- **Blocker**: the request form carries the requester's identity and the link goes to their
  email — user submits (or explicitly delegates with their details). USER ACTION.
- **On arrival**: filter rows where aksjonær ∈ {Investinor AS, Nysnø Klimainvesteringer AS,
  Innovasjon Norge}; same loader pattern; `disclosure_level='pct_exact'` (share counts given).
  Download within the one-week link validity.

## Related

- LV Uzņēmumu reģistrs open data (dati.ur.gov.lv) is the third register-grade route and needs
  NO user action — it stays in the active Sprint 19 queue, not here.
