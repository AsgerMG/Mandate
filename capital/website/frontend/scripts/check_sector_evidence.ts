/**
 * A fund may not read as a TECHNOLOGY fund when its own recipients are, by
 * their own official registration, not in technology.
 *
 * FREE — no model calls, no network, no credentials. Committed artifacts only.
 *
 * ── The defect this exists to catch ───────────────────────────────────────
 * Aleph Alpha, an AI company, was published
 *
 *   "Bayerische Richtlinien fuer die Foerderung von Film-, Fernseh- und
 *    anderen audiovisuellen Projekten"
 *
 * at row 4 of its memo. wsCY established it was not the ranker: the embedding
 * scored that scheme 843rd of 1,088, correctly. It was the corpus. The scheme's
 * `sectorMix` read 69% `software_data_ai`, so the sector prior — a signal whose
 * entire job is to say what a fund has ACTUALLY funded — read a film and
 * television scheme as an AI fund.
 *
 * Its recipients are Constantin Film, Pantaleon Films, Megaherz and Suedkino
 * Filmproduktion. Every one of them is registered under "Motion picture, video
 * and television programme production activities". The corpus had the
 * contradiction on file the whole time and nothing was looking at it.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     No instrument may carry a TECHNOLOGY sector as the dominant class of its
 *     recipient mix while the MAJORITY of the awards it has made went to
 *     recipients whose own official activity descriptor names an activity with
 *     no technology, science or engineering dimension.
 *
 * It names no fund, no country and no sector. The subject is the official NACE
 * codebook, and the test runs on descriptors this corpus has never seen.
 *
 * ── Why it can be checked here at all ─────────────────────────────────────
 * The corpus is gitignored (`data/db.sqlite`) and no check may read it. So the
 * two inputs are committed artifacts, deliberately produced by DIFFERENT code
 * from the verdict:
 *
 *   public/data/instrument_terms.json          the published `sectorMix`
 *   data/reference/instrument_recipient_activity.json
 *                                              what the recipients say they do
 *   data/reference/activity_codebook.json      which activities are technology
 *
 * The middle file carries descriptors and award counts and NOTHING else — no
 * sector, no veto, no judgement. The verdict is computed here. A check that
 * reads a file its own logic produced is a check that it agrees with itself.
 *
 * ── The debt, and why it is pinned rather than zero ───────────────────────
 * Clearing it to zero is a write to Railway Postgres, which is the source of
 * truth and is not written unilaterally. `apply_sector_evidence.py sql` emits
 * that write for review; when it lands and the snapshot is republished, PINNED
 * goes to 0. Until then this is a ratchet: a NEW violation fails the build, and
 * so does a FALLING count that has not been recorded, because a floor that
 * quietly absorbs an improvement stops being a floor.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const FRONTEND = process.cwd();
const ROOT = path.resolve(FRONTEND, "..", "..");

interface Codebook {
  licenses_technology: string[];
  nontech: string[];
  unspecific: string[];
}
interface ActivityRecord {
  awards: number;
  described: number;
  activities: Record<string, number>;
}

const codebook: Codebook = JSON.parse(
  readFileSync(path.join(ROOT, "data", "reference", "activity_codebook.json"), "utf8"));
const evidence: { records: Record<string, ActivityRecord> } = JSON.parse(
  readFileSync(path.join(ROOT, "data", "reference", "instrument_recipient_activity.json"), "utf8"));
/** The shipped snapshot, unless a harness names another — the same
 *  `SNAPSHOT_FILE` convention `corpus.ts` uses, and it announces itself for the
 *  same reason: it must never be the quiet reason this check passed. It is what
 *  lets the correction be shown GREEN before Railway is written. */
function snapshotPath(): string {
  const override = process.env.SNAPSHOT_FILE;
  if (override) {
    console.error(`check_sector_evidence: reading ${override} (SNAPSHOT_FILE), `
      + `NOT the committed snapshot.`);
    return override;
  }
  return path.join(FRONTEND, "public", "data", "instrument_terms.json");
}

const corpus: { records: { id: string; name: string; sectorMix: Record<string, number> | null }[] } =
  JSON.parse(readFileSync(snapshotPath(), "utf8"));

/** The one non-technology class in the taxonomy. Everything else is a claim
 *  that the company builds something. */
const NON_TECHNOLOGY = "other";

/** Residual, holding and generic-support registrations name no activity at
 *  all — they are what a company registers under when it has not picked a
 *  class. They are evidence for nothing and against nothing. */
function namesNoActivity(descriptor: string): boolean {
  const d = descriptor.toLowerCase();
  return codebook.unspecific.some((f) => d.includes(f));
}

/** Does this official descriptor name a TECHNOLOGY activity? If it does,
 *  nothing else about it matters — the claim has evidence. */
function licensesTechnology(descriptor: string): boolean {
  const d = descriptor.toLowerCase();
  return codebook.licenses_technology.some((f) => d.includes(f));
}

/**
 * Does this official descriptor NAME a specific activity with no technology,
 * science or engineering dimension?
 *
 * The three steps run in the order the codebook fixes, and all three are
 * load-bearing. Checking `nontech` alone reads NACE section R — "HUMAN HEALTH
 * AND SOCIAL WORK ACTIVITIES", the section that contains hospitals — as an
 * activity with no science in it, and this check reported a Dutch health
 * programme as a violation until the licensing step was added. That is the
 * whole reason the codebook is one file both languages read: the divergence was
 * not in the fragments, it was in a step one side had and the other did not.
 *
 * Silence is not a veto: a descriptor the codebook does not recognise at all
 * returns false.
 */
function namesNonTechnologyActivity(descriptor: string): boolean {
  if (namesNoActivity(descriptor)) return false;
  if (licensesTechnology(descriptor)) return false;
  const d = descriptor.toLowerCase();
  return codebook.nontech.some((f) => d.includes(f));
}

/** The class the sector prior actually reads off a fund: the plurality of its
 *  recipient mix. Ties are resolved to the larger count then alphabetically so
 *  the verdict is stable across regenerations. */
function dominantClass(mix: Record<string, number> | null): string | null {
  if (!mix) return null;
  const entries = Object.entries(mix).filter(([, n]) => n > 0);
  if (!entries.length) return null;
  entries.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  return entries[0][0];
}

interface Violation {
  id: string;
  name: string;
  claims: string;
  claimShare: number;
  nonTechShare: number;
  described: number;
  topActivity: string;
}

const violations: Violation[] = [];
let examined = 0;

for (const rec of corpus.records) {
  const ev = evidence.records[rec.id];
  if (!ev || !ev.described) continue;
  const claims = dominantClass(rec.sectorMix);
  if (!claims || claims === NON_TECHNOLOGY) continue;
  examined++;
  let nonTech = 0;
  let topActivity = "";
  let topCount = 0;
  for (const [descriptor, n] of Object.entries(ev.activities)) {
    if (namesNonTechnologyActivity(descriptor)) {
      nonTech += n;
      if (n > topCount) { topCount = n; topActivity = descriptor; }
    }
  }
  const nonTechShare = nonTech / ev.described;
  if (nonTechShare <= 0.5) continue;
  const total = Object.values(rec.sectorMix ?? {}).reduce((a, b) => a + b, 0);
  violations.push({
    id: rec.id,
    name: rec.name,
    claims,
    claimShare: total ? (rec.sectorMix![claims] ?? 0) / total : 0,
    nonTechShare,
    described: ev.described,
    topActivity,
  });
}

violations.sort((a, b) => b.nonTechShare - a.nonTechShare || b.described - a.described);

/**
 * The recorded debt. Every one of these is cleared by the write in
 * `apply_sector_evidence.py sql`; measured against the corrected snapshot this
 * check reports 0. It is NOT lowered to accommodate a regression — it is
 * lowered only when a corpus publish actually removes violations.
 */
const PINNED = 7;

const header = `${violations.length} of ${examined} instruments claim a technology `
  + `sector their own recipients contradict (pinned ${PINNED})`;

for (const v of violations.slice(0, 25)) {
  console.log(`  ${(100 * v.nonTechShare).toFixed(0)}% of ${v.described} awards went to `
    + `"${v.topActivity.slice(0, 52)}"`);
  console.log(`      but the mix reads ${v.claims} ${(100 * v.claimShare).toFixed(0)}%  —  `
    + `${v.name.slice(0, 60)}`);
}
if (violations.length > 25) console.log(`  ... and ${violations.length - 25} more`);

if (violations.length > PINNED) {
  console.error(`\nFAIL: ${header}.\n`
    + `  A fund whose recipients are officially outside technology must not read as a\n`
    + `  technology fund — that is how an AI company was published a film and television\n`
    + `  scheme. Fix the classification, not this number.\n`
    + `  See ETL/events/transform/classify_taxonomy.py :: technology_veto.`);
  process.exit(1);
}
if (violations.length < PINNED) {
  console.error(`\nFAIL: ${header}.\n`
    + `  The debt FELL and was not recorded. Set PINNED to ${violations.length} in this\n`
    + `  file and say in the commit what publish removed them. A ratchet that silently\n`
    + `  absorbs an improvement cannot tell the next regression from the status quo.`);
  process.exit(1);
}
console.log(`\nok — ${header}`);
