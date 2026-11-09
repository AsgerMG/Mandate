# Mandate Character Design System
## Regina & Wincent — Visual grounding and website implementation package

**Package status:** Directional design specification  
**Primary use:** Give this folder to Codex, Cursor, or a designer/developer working on `wincent-ai.eu`.

This package defines the approved creative direction for Regina and Wincent and provides implementation guardrails. It is a **guideline and grounding reference**, not a request to rebuild the website or replace its existing brand system.

## Start here

1. Read `docs/01-design-principles.md`.
2. Read the relevant character specification:
   - `docs/02-regina.md`
   - `docs/03-wincent.md`
3. Read `docs/04-website-integration.md` before changing the website.
4. Use `developer/AGENTS.md` as the instruction file for a coding agent.
5. Use `developer/design-tokens.css` and `developer/design-tokens.json` as semantic tokens. The CSS intentionally references existing site tokens where possible; it does not invent a replacement brand palette.
6. Review the images in `assets/`.

## Asset guide

- `assets/selected-visual-reference.png` — crop of the exact architectural duo image the project owner selected as the desired vibe. Treat this as the strongest visual reference.
- `assets/refined-regina-wincent-duo.png` — a refined follow-up render exploring the same direction.
- `assets/initial-architectural-duo-study.png` — earlier architectural exploration, useful for material and silhouette inspiration.

These are **concept renders**, not final production 3D models, transparent character cut-outs, or animation-ready assets. Do not pretend they are production-ready models. Use them to guide art direction and layout.

## Important brand rule

The live website is the source of truth for Mandate's existing typography, colours, spacing, layout, tone and UI conventions. This package does not authorize changing those foundations.

The homepage currently positions Mandate as “Public affairs for European startups, from a bench of experts.” It describes Wincent as the public-capital specialist and Regina as the EU-rules specialist. It says they “watch and tell”: they notice and explain, do not draft or file, and nothing ships without a source and a date.

When a site token or visual value cannot be verified from the repository or rendered site, **inspect and reuse the existing implementation; do not guess**.

## Suggested workflow

- First audit the existing site and identify its actual design tokens and component patterns.
- Add the character system as a contained layer.
- Integrate one small character introduction or expert card at a time.
- Check mobile, accessibility, performance and consistency.
- Do not alter product copy, claims, data, navigation or existing page structure unless explicitly asked.
