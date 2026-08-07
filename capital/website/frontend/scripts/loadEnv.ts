// ONE env loader for the scripts, because forty copies of it had already drifted.
//
// ── Why this is not a three-line inline block in every script ───────────────
// Every harness here opens `.env.local` itself: production reads env vars, and
// a `next` runtime loader would not be running when you invoke `npx tsx`. That
// part is fine. What was not fine is that the block was pasted 40 times and
// seven of the copies had since learned something the other thirty-three had
// not: DATABASE_URL is documented to live at the REPO ROOT, so a checkout that
// carries only the root file made the other thirty-three believe they had no
// credentials.
//
// For a measurement script that means a number quietly taken off the lexical
// fallback. For a CHECK it is worse, and it was live: `check_recall_floor`
// prints "SKIPPED — no DATABASE_URL/VOYAGE_KEY" and exits 0, so on any fresh
// worktree — where `.env.local` is gitignored and therefore absent, while the
// repo-root one is right there — `npm run check` reported a green build with
// the recall floors never evaluated. A gate that cannot find its credentials
// must not be the same colour as a gate that passed.
//
// So: one function, both paths, root first so the nearer file still wins.
// CI has neither file and must keep working without one, which is why a
// missing file is never an error here — only silence about it would be.
import { readFileSync } from "fs";

/** Files consulted, in order. The LAST one to set a key wins, so the
 *  frontend-local file overrides the repo-root one when both exist. */
export const ENV_FILES = ["../../.env.local", ".env.local"] as const;

/**
 * Load `.env.local` from the repo root and from the frontend, into process.env.
 *
 * Existing process environment always wins — CI and Vercel set real variables
 * and a checked-out file must never override them. Returns the files that were
 * actually read, so a caller that wants to say where its credentials came from
 * can.
 */
export function loadEnvLocal(): string[] {
  const seen = new Set<string>();
  const read: string[] = [];
  for (const file of ENV_FILES) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // No file is normal: CI has neither.
    }
    read.push(file);
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (!m) continue;
      // `seen` lets a later FILE override an earlier file, while the ambient
      // process environment still beats both.
      if (process.env[m[1]] !== undefined && !seen.has(m[1])) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      seen.add(m[1]);
    }
  }
  return read;
}
