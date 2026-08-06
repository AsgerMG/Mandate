// Where each fund's money has actually landed, as a routing attribute.
//
// A leaf module, and deliberately so: it touches `fs`, and both the ranker
// (shortlist.ts) and the axis builder that grounds gate 2's questions
// (shortlistAxes.ts) need it. Loading it in either would have made the other
// import a module that reaches the filesystem, which is the boundary
// check_client_boundary.ts exists to hold.
//
// Built by ETL/terms/emit_region_prior.py from the transparency register's own
// per-award beneficiary region. Read that file's header for why this is a
// posterior over award history rather than more `region_within` gates, and for
// the evidence that the register's region is a fact about the COMPANY (94.4%
// self-agreement at NUTS-1 across companies holding awards under more than one
// scheme) rather than about the scheme.
import { readFileSync } from "fs";
import path from "path";
import { regionsOverlap } from "./regions.generated";

export interface RegionFootprint {
  /** Every award, including the ones the register files at country level. A
   *  reader computing a share needs the honest denominator: a body with 40
   *  regional awards out of 4,000 is national. */
  n: number;
  /** Resolved NUTS id -> recipients. */
  mix: Record<string, number>;
}

let cache: Record<string, RegionFootprint> | undefined;

/** The whole artifact. Absent ids mean "we have no record", never "no
 *  recipients" — every caller must treat the two differently. */
export function regionFootprints(): Record<string, RegionFootprint> {
  if (cache === undefined) {
    try {
      cache = JSON.parse(readFileSync(
        path.join(process.cwd(), "lib", "intelligence", "regionPrior.generated.json"),
        "utf8")) as Record<string, RegionFootprint>;
    } catch {
      cache = {};
    }
  }
  return cache;
}

/** How many of this fund's recipients sit in the founder's region.
 *
 *  Containment is `regionsOverlap`, not string equality: the register reports
 *  recipients at NUTS-3 and a founder answers at NUTS-1 or 2, so FRD1 must
 *  satisfy a founder in FRD. Returns undefined — not 0 — when the fund has no
 *  recorded footprint at all. */
export function recipientsIn(id: string, region: string): number | undefined {
  const fp = regionFootprints()[id];
  if (!fp) return undefined;
  let n = 0;
  for (const [code, k] of Object.entries(fp.mix)) if (regionsOverlap(code, region)) n += k;
  return n;
}

/** The most specific NUTS region covering a supermajority of this fund's own
 *  awards, or undefined when only its country does.
 *
 *  The same question `nuts_regions.delivery_region` answers in the ETL, asked
 *  here over the artifact so the axis builder can say how a shortlist divides
 *  geographically without a second round-trip to the corpus. Undefined is
 *  meaningful and must be rendered as such: a national body's delivery region
 *  is not "France", it is "no regional claim", and a caller that collapses the
 *  two would tell a founder in Normandy that the national ministry is somebody
 *  else's door. */
export const DELIVERY_REGION_FLOOR = 0.6;

export function deliveryRegionOf(
  id: string, floor = DELIVERY_REGION_FLOOR,
): string | undefined {
  const fp = regionFootprints()[id];
  if (!fp || !fp.n) return undefined;
  let best: string | undefined;
  // NUTS ids are hierarchical, so containment is a string prefix and the whole
  // question is how long a prefix still covers `floor` of the awards. Longest
  // wins, so a body confined to one region is described as that region rather
  // than as its country. 3 and 4 chars are NUTS-1 and NUTS-2, which is what
  // regions.generated.ts carries and therefore all a founder can answer.
  for (let len = 3; len <= 4; len++) {
    const cover = new Map<string, number>();
    for (const [code, k] of Object.entries(fp.mix)) {
      if (code.length >= len) cover.set(code.slice(0, len), (cover.get(code.slice(0, len)) ?? 0) + k);
    }
    let topId: string | undefined, topN = 0;
    for (const [k, v] of cover) if (v > topN) { topN = v; topId = k; }
    // Measured against EVERY award, including those recorded only at country
    // level: a body half of whose awards are filed as "Germany" has not
    // demonstrated a regional focus, and dividing by the resolvable subset
    // alone would claim it had.
    if (topId && topN / fp.n >= floor) best = topId;
  }
  return best;
}
