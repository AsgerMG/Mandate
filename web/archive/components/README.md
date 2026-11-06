# Archived UI primitives

Moved by E2 on 2026-11-06: the shadcn primitives `components/ui/{alert,badge,
card,separator,tabs}.tsx` and their helper `lib/utils.ts` (`cn()`, now at
`archive/lib/utils.ts`). No page, component or module imports any of them
(checked by import path across all of `web/`); the only importer of
`lib/utils.ts` was these five files. `components.json` (the shadcn CLI config)
still names `@/lib/utils` as its utils alias: a future `npx shadcn add` will
recreate it.

The packages they used (`class-variance-authority`, `clsx`, `tailwind-merge`,
`@base-ui/react`) are now imported by nothing outside `archive/` but are still in
package.json: removing them changes the lockfile, which is its own reviewed
change (`npm uninstall` in a clean checkout, then build).
