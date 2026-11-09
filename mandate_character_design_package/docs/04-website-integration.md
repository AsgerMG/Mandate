# 04 — Website integration guidelines

## Objective

Embed Regina and Wincent into the existing Mandate website so they feel native to its design system. Character art should enrich the existing expert-bench concept without redesigning the site.

## Before making changes

The coding agent must inspect the repository and live site:
1. Identify the framework, routing, existing component structure and asset pipeline.
2. Locate the current global design tokens and typography.
3. Identify how expert cards, profile pages, hero sections and responsive layouts are built.
4. Check the current Regina and Wincent copy and preserve its meaning.
5. Identify image optimization, lazy-loading and content-security practices.

Do not assume a framework, file path, CSS methodology or component name.

## Recommended placement

Prioritise small, intentional placements:
- Expert cards on the homepage.
- Individual Regina and Wincent profile pages.
- A shared “expert bench” or duo section.
- Relevant editorial / explainer content where the character adds context.

Do not place large decorative renders on every page. Use the duo image where the relationship matters; use individual character assets on their own profiles and relevant topic areas.

## Layout principles

- Preserve existing page width, spacing, typography, buttons and navigation.
- Use existing card and section patterns.
- Keep character artwork secondary to the content hierarchy.
- Maintain equal prominence when Regina and Wincent appear together.
- Do not use the art as a background behind dense text.
- Avoid placing text directly over complex parts of the sculpture.
- On mobile, stack characters or use a deliberate crop; never shrink the pair until details become illegible.

## Image behavior

- Use responsive image sources and appropriate `srcset` / `sizes` if supported by the project.
- Use modern formats (AVIF/WebP) where the build pipeline supports them.
- Set intrinsic width and height or aspect ratio to avoid layout shift.
- Lazy-load below-the-fold imagery; do not lazy-load the primary above-the-fold image if it harms LCP.
- Provide descriptive alt text for meaningful images.
- If the image is purely decorative, use empty alt text and ensure no essential information exists only in the image.
- Never use an AI concept image as a functional button, navigation control or substitute for readable text.

## Accessibility and motion

- Respect `prefers-reduced-motion`.
- Motion must be optional, subtle, non-essential and non-looping where possible.
- No flashing, strobing, rapid pulsing or constant high-frequency movement.
- Provide a static fallback.
- Maintain WCAG-compliant text contrast using the site's existing accessible tokens.
- Do not encode Regina/Wincent meaning through colour alone; include names and text labels.

## Performance

- Prefer pre-rendered optimized images for initial implementation.
- Do not introduce a 3D runtime, WebGL scene or heavy animation library just to display the concept artwork.
- Consider interactive 3D only as a separate, approved enhancement after measuring performance and accessibility impact.
- Keep hero imagery appropriately sized and compressed.
- Avoid loading multiple large character renders on the same initial viewport.

## Content and claims

Preserve Mandate's product boundaries:
- They watch, notice and explain.
- They do not draft or file.
- Claims and findings should remain source-cited and dated.
- Do not imply guaranteed funding, eligibility, regulatory compliance, legal advice, institutional endorsement or political affiliation.

## Suggested component model

Adapt to the project's existing conventions. Conceptually, the site may need:
- `ExpertCard` — image, name, domain, concise description and existing CTA.
- `ExpertPortrait` — responsive image and accessible treatment.
- `ExpertPair` — balanced duo presentation.
- `CharacterVisual` — image wrapper with controlled aspect ratio and responsive crop.

Do not create duplicate components if equivalents already exist.

## Implementation sequence

1. Audit existing site tokens and components.
2. Add optimized image assets in the project's established asset location.
3. Implement one homepage expert-bench placement.
4. Implement individual profile placements.
5. Test desktop, tablet and mobile.
6. Check accessibility, reduced motion, performance and image loading.
7. Compare against the live site and remove any accidental brand drift.
