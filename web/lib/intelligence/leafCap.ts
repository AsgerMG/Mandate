// Is POOL_LEAVES_PER_CHANNEL binding? — the counting, separated from the check.
//
// ── Why this constant gets a guard of its own ──────────────────────────────
// `POOL_LEAVES_PER_CHANNEL` has been the single largest loss in the product
// TWICE, at 14 and again at 40. Both times the mechanism was identical and both
// times it was silent: the corpus widened, a channel came to hold more
// country-serving leaves than the cap, and `selectLeafInstruments` began
// cutting candidates BEFORE the ranker ever scored them. Nothing downstream can
// notice — a fund removed there is absent from the pool, so every ranking
// diagnostic reports a healthy ordering over a set that no longer contains the
// answer. At 14, `SEL-LEAF-CAP` accounted for 38 of 42 pool misses, and five
// ranking experiments in one session moved nothing because they were reordering
// a set the won fund was not in.
//
// A constant that has caused the top defect twice must not be able to do it a
// third time quietly. `scripts/check_leaf_cap.ts` is the noise; this file is
// the arithmetic, kept separate so it can be tested without a corpus.
//
// ── The quantity that decides it ───────────────────────────────────────────
// The cap is applied per channel, AFTER the country filter, so what decides
// whether it binds is, for each (channel, country), the number of publishable
// leaves in that channel whose own country is that country or "EU". That is the
// candidate count for a founder established in one country — the shape of
// essentially every founder and of every measured case.
//
// It is a structural property of the corpus: no replay, no model call, no
// answer key, decided by counting and decided the same way every time. So it
// catches the widening at the moment the corpus lands, which is months before a
// recall measurement would show it and years before anyone would think to
// suspect the constant again.

/** Only what the count needs. Structurally a `DbInstrument`, narrowed so the
 *  test can build cases without a corpus. */
export interface LeafCapInstrument {
  sourceFamilyBucket?: string | null;
  country: string;
}

export interface LeafCapGroup {
  channel: string;
  /** An ISO-2, or "EU only" for the founder whose own country holds nothing in
   *  this channel and who therefore sees only the EU-wide instruments. */
  country: string;
  /** Candidates this channel offers that founder, before the cap. */
  n: number;
}

export interface LeafCapVerdict {
  groups: LeafCapGroup[];
  /** Groups the cap is actively cutting. Empty is the only healthy state. */
  over: LeafCapGroup[];
  worst: LeafCapGroup;
  /** Instruments the widest group may still gain before the cap bites. */
  headroom: number;
}

/**
 * Candidate count per (channel, country), widest first.
 *
 * EU-wide instruments are added to EVERY country's count, because
 * `instrumentServesCountry` admits them for every founder — they are not a
 * separate lane, they are part of each country's competition for the same
 * slots. Missing that is how a per-country count can look safe while the set
 * the cap actually sees is larger.
 */
export function leafCapGroups(instruments: LeafCapInstrument[]): LeafCapGroup[] {
  const byChannel = new Map<string, LeafCapInstrument[]>();
  for (const i of instruments) {
    const b = i.sourceFamilyBucket ?? "(none)";
    (byChannel.get(b) ?? byChannel.set(b, []).get(b)!).push(i);
  }
  const groups: LeafCapGroup[] = [];
  for (const [channel, list] of byChannel) {
    const eu = list.filter((i) => i.country === "EU").length;
    for (const c of new Set(list.map((i) => i.country).filter((x) => x && x !== "EU"))) {
      groups.push({ channel, country: c, n: list.filter((i) => i.country === c).length + eu });
    }
    groups.push({ channel, country: "EU only", n: eu });
  }
  // Total order, so the reported "worst" group is the same one on every machine
  // even when two groups tie at the top.
  return groups.sort((a, b) => b.n - a.n
    || a.channel.localeCompare(b.channel) || a.country.localeCompare(b.country));
}

/** Whether the cap is cutting anything, and how much room is left if not. */
export function leafCapVerdict(
  instruments: LeafCapInstrument[], cap: number,
): LeafCapVerdict {
  const groups = leafCapGroups(instruments);
  const worst = groups[0] ?? { channel: "(none)", country: "(none)", n: 0 };
  return {
    groups,
    over: groups.filter((g) => g.n > cap),
    worst,
    headroom: cap - worst.n,
  };
}
