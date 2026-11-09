# Instructions for Codex / Cursor

You are implementing the Mandate Regina & Wincent character design system.

## First read
- `../README.md`
- `../docs/01-design-principles.md`
- `../docs/02-regina.md`
- `../docs/03-wincent.md`
- `../docs/04-website-integration.md`

## Primary instruction
Integrate the character visuals into the existing Mandate website without redesigning the existing brand system.

## Required workflow
1. Inspect the repository before editing.
2. Identify and reuse existing design tokens, components, routes, typography and asset conventions.
3. Report the relevant files and implementation plan before broad changes.
4. Make the smallest coherent implementation.
5. Use the supplied reference images as art-direction references, not as proof of exact production assets.
6. Do not invent brand colours. Read them from the existing codebase or verified site styles.
7. Do not replace existing copy, navigation, page hierarchy or product behavior unless explicitly requested.
8. Keep the characters faceless, architectural, non-human and politically neutral.
9. Keep Regina and Wincent visually equal when shown together.
10. Preserve performance and accessibility.

## Do not
- Rebuild the website from scratch.
- introduce a new global palette or typography system.
- add flags, political symbols, national or religious cues.
- turn the characters into humans, robots, cartoon mascots or generic holograms.
- introduce WebGL / 3D runtime dependencies without explicit approval.
- create unsupported claims about funding, compliance, eligibility or legal advice.
- make decorative images clickable unless the surrounding component already has a clear action.

## Acceptance criteria
- Character visuals feel native to the current Mandate site.
- Existing design tokens and components are reused.
- Regina's layered ceramic / glass form and Wincent's interwoven metal / glass form remain distinct.
- Both remain faceless and non-human.
- Pair composition communicates equal partnership.
- No political or national symbolism is introduced.
- Mobile layout is deliberate and legible.
- Images are optimized and have correct alt treatment.
- Reduced-motion users receive a static experience.
- No existing product copy or functionality is unintentionally changed.
