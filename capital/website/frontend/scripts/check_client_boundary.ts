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

const ROOT = path.join(process.cwd(), "lib");
const APP = path.join(process.cwd(), "app");

/** Node builtins and drivers that cannot exist in a browser bundle. */
const SERVER_ONLY = /^(?:node:)?(fs|path|dns|net|tls|crypto|child_process|os|http|https|zlib|stream)$|^pg$|^voyageai$/;

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

const files = [...walk(ROOT), ...walk(APP)];
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

/** The first server-only specifier this module pulls in, following local edges. */
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
