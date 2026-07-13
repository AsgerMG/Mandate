# website/ — working notes for Claude

Next.js App Router front-end, pure client of `etl/api.py` over HTTP
(`NEXT_PUBLIC_API_URL`, defaults to `http://127.0.0.1:8000`).

## Before touching any UI

Read [`../project-management/design-ux-guidelines.md`](../project-management/design-ux-guidelines.md)
first. It's a checklist of real bugs a full responsiveness audit found in this
codebase (mobile overflow, a footer that floated mid-page on large monitors,
iOS input zoom, a reused CSS class silently not applying outside its original
context, etc.) — the rules there exist specifically so those don't recur.

The two rules worth internalizing even if you don't read the rest:

1. **No hardcoded numbers *or descriptions* of the corpus** (source counts,
   doc counts, what's covered/live). Fetch from `getStats()` / `getSources()`
   (`lib/api.ts`) with a non-numeric fallback, the way `layout.tsx` and
   About's Coverage section do. About's old hand-maintained coverage list
   was factually wrong and covered ~6 sources when 78 existed — a hardcoded
   description goes stale exactly like a hardcoded count.
2. **Any new flex row needs `flex-wrap`** unless its children's combined width
   is provably bounded — this is the #1 cause of mobile horizontal-scroll bugs
   found in the audit (document list rows, badge rows, button rows).

## Verifying UI changes

Don't eyeball one breakpoint in devtools. Start both servers and check a
spread of real widths with Playwright (already in the repo's `.venv`):

```bash
uv run ept serve                            # API at :8000 (repo root)
cd website && npm run dev                   # site at :3000
```

Then load `/`, `/about`, `/documents`, `/brief` at 320/375/768/1280/1920/2560px
and assert `document.documentElement.scrollWidth === clientWidth` at each —
any mismatch means something overflowed. See the guidelines doc for the full
method and the list of pitfalls each check catches.
