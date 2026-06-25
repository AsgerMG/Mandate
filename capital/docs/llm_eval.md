# Classifier accuracy vs internet-verified ground truth (2026-06-16)

## Why this exists

The sector classifier was being judged against *our own* NACE-derived labels — a
circular test that rewards mimicking our rules (artifacts and all) rather than
being correct. This eval measures **real** accuracy: a hand-checked ground-truth
set built by web-searching what each company actually does, against which we score
both the deterministic rules and candidate LLMs.

## Method

- Sample: 19 companies spanning sectors, with findable names, drawn from the corpus.
- Ground truth: each company's true sector, verified via web search (company site,
  Crunchbase/PitchBook, registries). Recorded in `ETL/transform/classify_llm.py::TRUTH`
  with a one-line justification per company.
- Evidence given to each classifier: name, country, NACE descriptors, project
  titles, funding programmes — the realistic production input. Our DB sector label
  is **not** shown to the models.
- Score = exact-match agreement with the verified truth. Run via
  `python3 ETL/transform/classify_llm.py eval`.

## Results

| Classifier | Accuracy vs internet truth | Est. full-corpus cost (Batch API) |
|---|---:|---:|
| Rules (`classify.py`) | **47.4%** (9/19) | — |
| OpenAI `gpt-4o-mini` | 68.4% (13/19) | ~$3.50 |
| OpenAI `gpt-4o` | 78.9% (15/19) | ~$50 |
| **OpenAI `gpt-4.1-mini`** | **84.2%** (16/19) | **~$12** |
| OpenAI `gpt-4.1` | 84.2% (16/19) | ~$40 |

(Anthropic not tested — user opted to stay on OpenAI.)

**Pick: `gpt-4.1-mini`** — ties full `gpt-4.1` and beats `gpt-4o` at a fraction of
the cost; ~84% vs the rules' ~47%, for ~$12 one-time over the whole corpus.

The cheap LLM beats the deterministic rules by ~21–37 points. Examples the LLM fixed:
Ossiform (3D-printed bone implants: rules said deeptech, truth life_sciences),
Dråpen Fjordbad (sauna/wellness: rules unclassified, truth other), Liogier (hand
tools: rules cleantech, truth other), APJ (printing: rules unclassified, truth
other). Cases still hard for both: Geologian Tutkimuskeskus (Geological Survey of
Finland — earth-observation projects make "space" tempting; logged as other/research).

## Caveats

- n = 19 is a small sample; the ~21-point gap is a strong signal but not a precise
  number. Expand `TRUTH` (more web-verified companies) to tighten it before betting
  the full run on it.
- The verified set skews to companies with *findable* names; the ~17k truly opaque
  companies (e.g. "34,SIA") are unfindable for humans and models alike, so neither
  classifier can be scored on them — and neither will classify them well.

## Bake-off cost (full corpus, ~157k companies, Batch API ~50% off)

| Model | Est. one-time cost |
|---|---:|
| gpt-4o-mini | ~$3.50 |
| gpt-4.1-nano / gpt-5-nano | ~$1–2 |
| claude-haiku-4-5 | ~$20–40 |

Decision rule: **accuracy-per-dollar**, not sticker price. Finish the Haiku data
point, then pick.
