// No "use client" module may reach a server-only module.
//
// THE BUG THIS EXISTS FOR: types.ts imported toIso2 from corpus.ts, which reads
// the filesystem and imports `pg`. panelReport.tsx is a "use client" component
// that imports a VALUE from types.ts, so the bundler followed the chain and
// pulled fs, pg and dns into the browser build. `npm run build` failed with
// "Module not found: Can't resolve 'dns'" — and had been failing before anyone
// noticed, because nothing we run routinely would catch it:
//
//   tsc --noEmit   erases type-only edges and does not bundle at all
//   vitest         resolves in Node, where fs and pg are real
//   every check_*  is a tsx script, also Node
//   npm run build  the only thing that bundles, and it is slow enough that it
//                  is not part of `npm run check`
//
// So the one guard that could see it was the one nobody ran. This walks the
// import graph statically instead, in under a second.
//
// It is a property, not a list: "server-only" means the module imports a Node
// builtin or a driver, determined by reading the file, so a new server module
// is covered the day it is written without anyone registering it here.
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// ── THE ROOTS, AND WHY components/ HAD TO BE ONE (wsEW) ────────────────────
// This walked `lib/` and `app/` only, and `components/` holds EIGHT "use
// client" files — the nav bar, the charts, the map, the graphs. So the guard
// missed them twice over: it never graded them as sources, and because `src`
// is also what `resolve()` looks a specifier up in, an `@/components/...` edge
// out of a file it DID grade resolved to null and the walk stopped there. A
// client module reaching `pg` through a shared component was invisible on both
// routes. Both were proven by planting the case and watching the guard pass.
//
// It is the roots that are enumerated here, not the modules — a new component
// is covered the day it is written, which is the same property the SERVER_ONLY
// regex has and for the same reason.
const ROOTS = ["lib", "app", "components"].map((d) => path.join(process.cwd(), d));

/**
 * Node builtins and drivers that cannot exist in a browser bundle.
 *
 * ── THE SUBPATH, WHICH THE `$` USED TO EAT (wsEW) ─────────────────────────
 * This was anchored on the bare module name, so `fs` was caught and
 * `fs/promises` was not — nor `node:fs/promises`, `stream/web`, `dns/promises`
 * or `pg/lib/...`. Those are the SAME Node builtins under the names the modern
 * API is actually imported by, and a bundle dies on them identically. Nothing
 * in the tree imported one on the day this was widened; that is precisely why
 * it was worth widening, because the guard would have gone green on the first
 * one somebody wrote.
 *
 * The subpath is optional and must begin with `/`, so a package whose name
 * merely STARTS with a builtin's — `path-browserify`, `crypto-js`, `pgvector`
 * — still does not match. That distinction is the whole reason it is not a
 * prefix test.
 */
const SERVER_ONLY =
  /^(?:node:)?(?:fs|path|dns|net|tls|crypto|child_process|os|http|https|zlib|stream)(?:\/|$)|^(?:pg|voyageai)(?:\/|$)/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap(walk);
const src = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

/** Static imports only, and NOT `import type` — a type edge is erased by the
 *  compiler and cannot drag a module into a bundle. `await import()` is a
 *  runtime edge inside a function and is how corpus.ts legitimately reaches pg
 *  on the server, so it is not followed either. */
function importsOf(code: string): string[] {
  const out: string[] = [];
  const re = /^\s*import\s+(?!type\s)([^;]*?)\s*from\s*["']([^"']+)["']/gm;
  for (const m of code.matchAll(re)) {
    if (/^\s*\{\s*type\s/.test(m[1]) && !/,/.test(m[1])) continue;
    out.push(m[2]);
  }
  return out;
}

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;
  const base = spec.startsWith("@/")
    ? path.join(process.cwd(), spec.slice(2))
    : path.resolve(path.dirname(from), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`,
                      path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (src.has(cand)) return cand;
  }
  return null;
}

/**
 * The first server-only specifier this module pulls in, following local edges.
 *
 * ── THE SHARED `seen` SET IS SOUND, AND THIS SAYS SO ON PURPOSE (wsEW) ─────
 * It was reported as a third hole: one `seen` spans the whole walk from one
 * client module, so a module visited on a clean branch is skipped on every
 * later branch, and that looks like it could under-report on a diamond.
 * It cannot, and the code is deliberately left alone.
 *
 * `seen` is fresh per TOP-LEVEL client module (the default argument, and the
 * caller below never passes one), so nothing leaks between the files being
 * graded. Within one walk this is textbook DFS reachability: a node is skipped
 * only when it is already on the stack or already fully explored, and
 * "does anything reachable from here import a server module" is a property of
 * the node, not of the branch that arrived at it. When a node returns null
 * because its only onward path was truncated at an ancestor, that ancestor is
 * still mid-loop and explores the rest itself, so the top-level verdict holds.
 *
 * Not left on an argument. Three shapes were planted and all three were caught
 * — an acyclic diamond, a clean cycle followed by a dirty branch, and the exact
 * alleged failure (a node returning null purely because of ancestor truncation,
 * with the ancestor then reaching `pg`). Then this control flow was replayed
 * against ground-truth BFS reachability on 200,000 random graphs dense enough
 * to be full of cycles and diamonds: 806,318 cases, ZERO mismatches.
 *
 * What the set genuinely does affect is the CHAIN printed, not the verdict:
 * a truncated branch can make the reported path longer than the shortest one.
 * That is a legibility cost on an already-failing build, and de-duplicating it
 * would cost a full re-walk per node for no extra defect caught.
 */
function serverReach(file: string, seen = new Set<string>()): string[] | null {
  if (seen.has(file)) return null;
  seen.add(file);
  const code = src.get(file);
  if (!code) return null;
  for (const spec of importsOf(code)) {
    if (SERVER_ONLY.test(spec)) return [file, spec];
    const next = resolve(file, spec);
    if (!next) continue;
    const deeper = serverReach(next, seen);
    if (deeper) return [file, ...deeper];
  }
  return null;
}

const problems: string[] = [];
for (const [file, code] of src) {
  if (!/^\s*["']use client["']/m.test(code)) continue;
  const chain = serverReach(file);
  if (!chain) continue;
  const rel = (p: string) => (p.startsWith(process.cwd()) ? path.relative(process.cwd(), p) : p);
  problems.push(`  ${rel(file)}\n      ${chain.map(rel).join("\n   -> ")}`);
}

if (problems.length) {
  console.error(
    `check_client_boundary: ${problems.length} "use client" module(s) reach a ` +
    `server-only module.\n` +
    `A browser bundle cannot contain fs, pg or dns, and the build fails on it.\n` +
    `Fix by moving the shared value into a LEAF module that imports nothing ` +
    `(see lib/intelligence/countryCodes.ts), or by making the edge \`import type\`.\n\n` +
    problems.join("\n\n"));
  process.exit(1);
}
console.log(`check_client_boundary: ok — no client module reaches fs, pg or another server-only import`);
