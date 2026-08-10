"use client";

// Everything that renders a finished brief.
//
// Split out of panel.tsx in the Phase 2 decomposition. The division is between
// COLLECTING answers and PRESENTING a result: this half never sets state on
// the intake, and the intake half never formats a verdict.
//
// The rules these components display are code-computed before they arrive —
// verdicts, blockers and citations are not model-written, and the tables must
// never imply otherwise. Where no machine-readable rule exists the row says so
// rather than rendering blank, which was a real defect: an unassessed fund
// looked identical to a cleared one except for a missing green line.
import { Fragment, useEffect, useState } from "react";
import { fmtEur } from "../format";

/** Shared with panel.tsx: the serif face the brief is set in. */
const serif = { fontFamily: "var(--font-newsreader), Georgia, serif" };

import { AXIS_LABEL, rowGroups } from "./rowNovelty";
import { STATE_OF_PLAY_OFFER } from "./types";
import type { EligibilityCheck, InstitutionEntry, IntelligenceReport, NoDoors, WithheldNotice } from "./types";

/**
 * Funds withheld because their openness could not be confirmed.
 *
 * Sits directly under the table's heading, above the first row, because that
 * is where a reader forms the belief this component exists to correct: that
 * what follows is the whole answer. In the footer beside the caveats it would
 * be read after the decision it is meant to inform.
 *
 * Deliberately not styled as an error or a warning. Nothing has gone wrong
 * with the founder's request; a smaller number of funds is the correct answer
 * to it tonight, and the rule shown here is the reason it can be trusted.
 * Renders nothing when nothing was withheld.
 *
 * ── Why the sizes are pinned to the table, not to the caveats ─────────────
 * It is set no smaller than the rows it qualifies: 14px against the table's
 * 14px on screen, 11px in print against the table's 9.5px. The first printed
 * proof of this component had it at 9px, which is UNDER the table and one
 * pixel over the 8px caveats line at the foot of the page -- so on paper the
 * one sentence that says the table is incomplete was typeset as boilerplate,
 * next to the boilerplate. Quiet is carried by the muted colour and the hairline
 * rule; it must never be carried by making the type smaller than the thing it
 * corrects. A founder who skims the table must not be able to skim past this.
 */
export function WithheldLine({ withheld }: { withheld?: WithheldNotice }) {
  if (!withheld?.count) return null;
  return (
    <p
      data-withheld={withheld.count}
      className="mb-3 border-l-2 border-[var(--border)] pl-3 text-[14px] leading-relaxed text-[var(--muted-foreground)] print:text-[11px]"
    >
      {withheld.note}
    </p>
  );
}

/** A quiet editorial section title in the house serif — no number, no colour. */
/** One consistent heading grammar used by every screen of the intake flow
 *  (the live-preview panel, the adaptive round, the running screen) — a
 *  small eyebrow, a plain-English title, and a one-line explainer of what
 *  this screen is and what happens next. Replaces three previously
 *  different ad hoc heading styles per screen. */
export function StepHeader({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  return (
    <div className="mb-3">
      {eyebrow && (
        <p className="text-xs uppercase tracking-widest text-[var(--accent)]">{eyebrow}</p>
      )}
      <p className="text-sm font-semibold text-[var(--foreground)]" style={serif}>{title}</p>
      {detail && (
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{detail}</p>
      )}
    </div>
  );
}

/** A small shimmering placeholder for a model-written cell that hasn't
 *  arrived yet (see InstitutionsTable's `pending`) — real layout, honest
 *  "still writing this" signal, never a spinner standing in for content. */
export function PlaceholderBar({ narrow = false }: { narrow?: boolean }) {
  return (
    <span
      className={"inline-block h-3 animate-pulse rounded bg-[var(--muted)] align-middle " + (narrow ? "w-20" : "w-40")}
    />
  );
}

/**
 * A run of rows that are the same kind of door, introduced once.
 *
 * ── Why it leads with the choice ───────────────────────────────────────────
 * The facts a run shares are true, and stating them five times is still five
 * times one fact. But crossing them out five times is no better: the reader
 * gets five muted lines saying nothing. What a reader actually needs at the
 * top of a run is the thing they cannot work out themselves, which is HOW TO
 * CHOOSE between doors that look alike. So the shared facts are stated as
 * context and the sentence that follows names the axes the rows actually
 * differ on, which are the axes measured to differ: what each has paid, where
 * it operates, and its own conditions.
 *
 * Renders nothing for a run of one, which is most rows.
 */
function RunHeading({ group }: { group?: { size: number; shared: { axis: string; value: string }[] } }) {
  if (!group || group.size < 2) return null;
  return (
    <tr data-run={group.size}>
      <td colSpan={4} className="pt-4 pb-1.5">
        <span className="block text-[11px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
          The next {group.size} are the same kind of door
        </span>
        <span className="mt-1 block text-[12px] text-[var(--foreground-soft)]">
          {group.shared.map((s) => `${AXIS_LABEL[s.axis] ?? s.axis}: ${s.value}`).join(" · ")}
        </span>
        <span className="mt-1 block text-[12px] text-[var(--muted-foreground)]">
          Choose between them on what each one has actually paid, where it operates and the
          conditions it sets itself. Those are on the rows; the facts above are not repeated.
        </span>
      </td>
    </tr>
  );
}

/**
 * The brief's centrepiece table: institution / type of support / why you
 * qualify / comparable firms. Used identically in two moments — live, while
 * the memo is still generating (whyEligible/nextStep render as
 * PlaceholderBar until the model has written them, `pending`), and final, in
 * the finished Memo. Same component, same layout, so the placeholder cells
 * simply fill in with real text rather than the table re-laying-out.
 */
export function InstitutionsTable(
  { institutions, pending = false, withheld, noDoors }:
  { institutions: InstitutionEntry[]; pending?: boolean; withheld?: WithheldNotice;
    noDoors?: NoDoors },
) {
  // ── An empty table said NOTHING, and shipped ────────────────────────────
  // This returned null. A founder whose table came back empty was handed a
  // brief with no section 02 at all -- no rows and no reason -- and nothing in
  // the product could tell that apart from a founder for whom the section was
  // simply not built yet. Where no door is open the brief has to say so and say
  // what would change it, in the funds' own words.
  if (!institutions || institutions.length === 0) {
    if (!noDoors) return null;
    return (
      <>
        <SectionTitle n="02">Where to target</SectionTitle>
        <p className="text-[14px]">
          Nothing here is open to you today. We ranked {noDoors.considered} funds against your
          answers and every one of them is ruled out by a requirement it states itself.
        </p>
        <ul className="mt-2 list-disc pl-5 text-[14px]">
          {/* Deliberately NOT bound as the single letter the row loops use:
              rowToEntry.test.ts reads every dotted field off that identifier as
              a field an institution row must carry, and it duly failed on this
              one. The guard is right; the variable name is what changes. */}
          {noDoors.ruledOutBy.map((reason) => (
            <li key={reason.requirement} className="mt-1">
              {reason.requirement}{" "}
              <span className="text-[var(--muted-foreground)]">
                ({reason.funds} {reason.funds === 1 ? "fund" : "funds"})
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[14px]">
          Change one of those and the table changes with it. Where a requirement is about how you
          apply rather than who you are, a partner who meets it can carry the application.
        </p>
      </>
    );
  }
  // ── SAY A SHARED FACT ONCE ────────────────────────────────────────────────
  // A six-row brief was rendered and read (wsCX). Four of the six carried a
  // word-for-word identical "How to apply", and all six carried the identical
  // three comparable firms. Neither is the writer padding, and this is the
  // measurement that settles it:
  //
  //   ROUTE.  `application` is inherited from the parent regime when a leaf has
  //     none of its own (corpus.ts), so siblings of one programme share one
  //     route BY CONSTRUCTION. Over the 837 publishable rows there are 736
  //     routes and only 122 distinct ones; the largest serves 89 rows. The
  //     repetition is TRUE. A true fact stated four times is still four
  //     hundred pixels of a founder's attention spent on one fact.
  //
  //   COMPARABLES. Not the channel. THE POOL IS ONE TO THREE COMPANIES.
  //     `comparableFirmsForChannel` (pipeline.ts) filters peers on `row.channel`
  //     -- the source family -- which sounds like the answer and is not it.
  //     Measured over the twelve recorded archetype briefs: 52 published rows,
  //     22 of which carry any firm at all, and SIXTEEN distinct companies named
  //     across all twelve briefs put together. SMART Photonics publishes five
  //     rows on FIVE DIFFERENT channels and names one company on four of them.
  //     Neura Robotics: four channels, one company. The channel filter is real
  //     and it has almost nothing to filter, because a company that has drawn
  //     public money in Europe has usually drawn it on several channels, so the
  //     one or two matched peers satisfy nearly every row.
  //
  //     So the cell is a per-row claim carrying a fact about the founder's peer
  //     SET, and repeating it row after row reads as independent confirmation
  //     that each of these funds backed that company. Widening the pool is a
  //     corpus question (the hard rule that a web-found name with no traced
  //     public funding is not a row) and conditioning on the instrument needs
  //     per-instrument company attribution the prebuilt index does not carry
  //     (website/build/companies_index.py keys on source_family). Both are
  //     REPORTED, not invented here: a differentiation we cannot evidence would
  //     be a worse defect than the repetition it hid.
  //
  // So both are stated once and then referred back to. Nothing is dropped and
  // no row loses information it uniquely held.
  //   STATUTORY TERMS. Found by rendering the fixed table and LOOKING at it,
  //     which is the only reason it was found at all. Three of six rows of a
  //     real German brief carried the SAME GBER Art. 25 bullets word for word --
  //     the intensity ceilings, the EUR 200,000 de minimis cap, the AGVO
  //     maxima -- because those are STATUTORY: they are a property of the
  //     article, identical for every scheme notified under it, which is exactly
  //     what makes them worth publishing and exactly what makes publishing them
  //     six times a waste of the page. Between them these bullets were the
  //     single largest thing on the row.
  //
  // A shared fact is stated on the row that first carries it, and later rows
  // count what they are not repeating. Deduped BULLET BY BULLET rather than
  // block by block, so a row that genuinely adds a term still shows that term:
  // nothing a row uniquely holds is ever suppressed.
  const firstWithRoute = new Map<string, number>();
  const firstWithPeers = new Map<string, number>();
  const firstWithBullet = new Map<string, number>();
  institutions.forEach((r, i) => {
    for (const c of [...(r.judgementCriteria ?? []), ...(r.structuringNotes ?? [])]) {
      if (!firstWithBullet.has(c)) firstWithBullet.set(c, i);
    }
  });
  const firstSaid = (xs: string[] | undefined, i: number) =>
    (xs ?? []).filter((c) => firstWithBullet.get(c) === i);
  const repeatedCount = (r: InstitutionEntry, i: number) =>
    [...(r.judgementCriteria ?? []), ...(r.structuringNotes ?? [])]
      .filter((c) => firstWithBullet.get(c) !== i).length;
  institutions.forEach((r, i) => {
    const route = r.applicationChannel?.trim();
    if (route && !firstWithRoute.has(route)) firstWithRoute.set(route, i);
    const peers = r.comparableFirms.map((f) => f.name).join("|");
    if (peers && !firstWithPeers.has(peers)) firstWithPeers.set(peers, i);
  });
  // ── SAY THE SHARED FRAMING ONCE, ABOVE THE ROWS THAT SHARE IT ────────────
  // The fold above deduplicates a repeated VALUE and leaves a back-reference
  // in its place, and it was the right shape for a route or a statutory
  // bullet: those recur in a scatter, on rows that are otherwise unlike each
  // other. It is the wrong shape for the tail both rendered briefs actually
  // had, which is a RUN -- four or five consecutive rows that are the same
  // KIND of door and repeat the family, the legal basis, the support type, the
  // ticket band and the route, all five together, in order.
  //
  // Measured over 250 founders, 1,750 published rows: 39% of rows sit in such a
  // run, 38% of tables carry a run of three or more, and runs of six and seven
  // occur. On those rows the fold's own back-reference reads as five muted
  // "the same as above" lines under five near-identical names, which is a
  // catalogue with the catalogue's facts crossed out.
  //
  // A run is instead introduced ONCE and its shared facts stated there, and
  // the rows inside it then carry only what is theirs: what each has actually
  // paid, where it operates, who takes the application, its own conditions.
  // 432 of 432 rows that follow another row of their own kind carry at least
  // one such fact, so there is always something for the row to be.
  //
  // NO ROW IS REMOVED and no fund is withheld. This changes what a row SAYS,
  // never which rows exist: a wrongly-withheld row is a fund a founder never
  // sees, and one notified scheme delivered by several bodies is several real
  // doors (wsCG2). The runs are read off the order as given -- nothing here
  // reorders anything to make a run longer.
  const groups = rowGroups(institutions);
  const groupOf = new Map<number, { start: number; size: number }>();
  for (const g of groups) {
    if (g.size < 2) continue;
    for (let o = 0; o < g.size; o++) groupOf.set(g.start + o, { start: g.start, size: g.size });
  }
  /** True where the fact is already stated in the run's own heading above. */
  const inRunHeading = (i: number) => groupOf.has(i);
  return (
    <>
      <SectionTitle n="02">Where to target</SectionTitle>
      <WithheldLine withheld={withheld} />
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-[var(--foreground)] text-left align-bottom">
            <th className="py-2 pr-3 font-semibold">Institution</th>
            <th className="py-2 pr-3 font-semibold">Type of support</th>
            <th className="py-2 pr-3 font-semibold">Why you qualify</th>
            <th className="py-2 font-semibold">Comparable firms funded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] align-top">
          {institutions.map((r, i) => (
            <Fragment key={i}>
            {/* The run's shared facts, stated once, immediately above the rows
                that share them. A heading rather than a footnote: a reader who
                has not yet seen the rows is being told how to choose between
                them, which is advice; the same sentence under the rows would
                be an apology for having repeated something. */}
            <RunHeading group={groups.find((g) => g.start === i && g.size > 1)} />
            <tr>
              <td className="py-2.5 pr-3">
                {/* The name IS the link. What it opens differs by row - an
                    application portal, the scheme's entry in the EU state-aid
                    register, or the programme's front door - so the kind is
                    labelled rather than left for the reader to discover after
                    clicking. Rows we hold nothing for stay plain text: a wrong
                    application link is worse than none, because a founder
                    acts on it. */}
                {/* While the brief is still being written the row is not yet
                    a recommendation: the shortlist can still change as the
                    writer resolves it. Showing a fund name during that window
                    presents an unfinished candidate as an answer, and a
                    thematically odd one reads as a mistake we then correct in
                    front of the reader. The row keeps its shape and fills in.
                    Only the name is held back — the table below still shows
                    real progress rather than a spinner. */}
                {pending ? (
                  <PlaceholderBar />
                ) : r.link ? (
                  <a
                    href={r.link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--primary)] hover:text-[var(--primary)]"
                  >
                    {r.institution}
                  </a>
                ) : (
                  <span className="font-semibold">{r.institution}</span>
                )}
                {!pending && r.link && r.link.kind !== "apply" && (
                  <span
                    data-linkkind
                    className="ml-1.5 align-[1px] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"
                  >
                    {r.link.label}
                  </span>
                )}
                {/* Everything that identifies the fund is held with the name:
                    a country and a legal basis name it just as clearly. */}
                {/* Who actually takes an application under this scheme. The
                    name above is the scheme; a department notifies it, these
                    bodies run it, and without them the row names something
                    real that a founder still cannot approach. */}
                {!pending && r.accessMode === "invest" && (
                  <span className="block text-[12px] text-[var(--accent)]">
                    An investor, not a grant: expect a cap-table seat and, usually, a lead investor first
                  </span>
                )}
                {/* Only where the row's own name does not already answer
                    "who do I approach?". These exist for schemes rendered by
                    their code because a department notified them; on a row
                    that IS a granting body, listing the other bodies on the
                    same regime reads as nonsense — a Normandy row citing
                    Nouvelle-Aquitaine and Grand Est as its operators. */}
                {/* This IS the "one programme behind several doors, shown
                    once" affordance, on the only key that can express it: one
                    NOTIFIED SCHEME delivered by several bodies. Workstream M
                    rebuilt it as a row collapse over `parent_id` before
                    finding it here, and that collapse merges distinctly named
                    calls of one agency instead -- 50 ADEME calls under one
                    row. If this ever stops rendering, someone will rebuild it
                    the wrong way again. See findings/sibling_collapse_wsM.md. */}
                {!pending && r.schemeCode && r.institution.includes(r.schemeCode)
                  && operatorsOtherThan(r).length > 0 && (
                  <span className="block text-[12px] text-[var(--muted-foreground)]">
                    Operated by {operatorsOtherThan(r).slice(0, 2).join(", ")}
                    {operatorsOtherThan(r).length > 2 && ` and ${operatorsOtherThan(r).length - 2} others`}
                  </span>
                )}
                {/* What this fund is, measured. The name above is the granting
                    body and 535 of 861 rows share one with a sibling, so
                    without this a founder reads "Bpifrance" three times and
                    cannot tell which one is theirs. */}
                {/* Breadcrumb: the agency above this programme. A founder who
                    sees "Tremplin pour la transition ecologique des PME" needs
                    to know ADEME runs it, and that ADEME runs others. */}
                {/* Inside a run the family, the legal basis and the ticket
                    band are the run's heading, one block up, and repeating
                    them on each row is the catalogue this workstream exists to
                    end. Outside a run they are the row's own and stay put. */}
                {!pending && r.familyName && !inRunHeading(i) && (
                  <span className="block text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                    {r.familyName}
                  </span>
                )}
                {!pending && r.descriptor && (
                  <span className="block text-[12px] text-[var(--muted-foreground)]">
                    {r.descriptor}
                  </span>
                )}
                {/* The country stays on every row even inside a run: it is one
                    of the three things the run's heading tells the reader to
                    choose on, and a run can span regions of one member state. */}
                {!pending && (r.country || (r.legalBasis && !inRunHeading(i))) && (
                  <span className="block text-[12px] text-[var(--muted-foreground)]">
                    {[r.country, inRunHeading(i) ? "" : r.legalBasis].filter(Boolean).join(" · ")}
                  </span>
                )}
                {!pending && !inRunHeading(i) && (
                  <span className="block text-[12px] tabular-nums text-[var(--muted-foreground)]">
                    {r.ticket}
                  </span>
                )}
                {/* What this instrument has actually paid, where enough real
                    awards stand behind it to say. The curated ticket above is
                    the whole channel's range; this is the leaf's own median,
                    and the two are routinely an order of magnitude apart. The
                    count travels with it so the founder can weigh it. */}
                {/* What the assessor weighs but no comparator can settle.
                    Cited, in the fund's own words. For instruments with no
                    evaluable cited rule at all, this is the only thing the
                    fund has told us about who it says yes to, and it used to
                    reach nobody. */}
                {!pending && !!firstSaid(r.judgementCriteria, i).length && (
                  <ul className="mt-1 list-disc pl-4 text-[12px] text-[var(--muted-foreground)]">
                    {firstSaid(r.judgementCriteria, i).map((c) => <li key={c}>{c}</li>)}
                  </ul>
                )}
                {/* How the money is shaped. Labelled, and kept apart from the
                    criteria above: "you fund half of it" and "you must be an
                    SME" are both true and constrain different things, and a
                    founder who runs them together plans the wrong project. */}
                {!pending && !!firstSaid(r.structuringNotes, i).length && (
                  <div className="mt-1 text-[12px] text-[var(--muted-foreground)]">
                    <span className="uppercase tracking-wide text-[10px]">How the money works</span>
                    <ul className="list-disc pl-4">
                      {firstSaid(r.structuringNotes, i).map((c) => <li key={c}>{c}</li>)}
                    </ul>
                  </div>
                )}
                {!pending && repeatedCount(r, i) > 0 && (
                  <span className="mt-1 block text-[12px] italic text-[var(--muted-foreground)]">
                    {repeatedCount(r, i) === 1
                      ? "One further term is the same as above."
                      : `${repeatedCount(r, i)} further terms are the same as above.`}
                  </span>
                )}
                {/* The structuring number, stated from both sides: a founder
                    plans around what they must fund themselves at least as
                    much as around what the fund covers. */}
                {!pending && r.aidIntensity != null && (
                  <span className="block text-[12px] tabular-nums text-[var(--muted-foreground)]">
                    {`Covered ${Math.round(r.aidIntensity * 100)}% of project cost`}
                    {`, you fund ${Math.round((1 - r.aidIntensity) * 100)}%`}
                    {r.aidIntensityN ? ` · ${r.aidIntensityN.toLocaleString()} awards` : ""}
                  </span>
                )}
                {!pending && r.typicalAward != null && (
                  <span className="block text-[12px] tabular-nums text-[var(--muted-foreground)]">
                    {`Typical award ${fmtEur(r.typicalAward)}`}
                    {r.typicalAwardN ? ` · ${r.typicalAwardN.toLocaleString()} awards` : ""}
                  </span>
                )}
                {/* Dormancy, stated rather than hidden. A brief that sends a
                    founder at a scheme which stopped awarding in 2019 is not
                    thin, it is wrong with authority — so the date they would
                    need in order to disbelieve us is on the row itself. */}
                {!pending && r.stale && r.lastAwardYear && (
                  <span className="mt-1 block text-[12px] text-[var(--accent)]">
                    No award recorded since {r.lastAwardYear} — confirm it is still running
                  </span>
                )}
              </td>
              {/* Left as words rather than an empty cell. A blank in a column
                  a reader is scanning reads as a fact we do not hold, which is
                  the opposite of what is true here. */}
              <td className="py-2.5 pr-3">
                {pending ? <PlaceholderBar narrow />
                  : inRunHeading(i) ? <span className="text-[var(--muted-foreground)]">As above</span>
                    : r.supportType}
              </td>
              <td className="py-2.5 pr-3">
                {/* Qualification comes first and is code-computed, so it is
                    already correct while the model's prose streams. Funds a
                    company cannot access were dropped in the pipeline and
                    never reach this table. */}
                {r.verdict === "one_blocker" && r.blocker ? (
                  <span className="mb-1 block">
                    <span className="font-semibold text-[var(--accent)]">One thing in the way:</span>{" "}
                    <span className="text-[var(--foreground-soft)]">{r.blocker}</span>
                  </span>
                ) : r.verdict === "open" && (r.gatesChecked ?? 0) > 0 ? (
                  // Nothing rendered. A published row already MEANS the door is
                  // open; announcing it in every row spent a line on the
                  // product's own reasoning rather than on the fund, and the
                  // phrasing read as a shrug (contract rule BRIEF-4).
                  null
                ) : (
                  // Say so when we checked NOTHING. 177 instruments carry no
                  // machine-readable rule yet, and an unassessed row used to
                  // render blank here — indistinguishable from one we had
                  // actually cleared, except for a missing green line nobody
                  // would notice was absent. Dropping these rows instead was
                  // considered and rejected: they include the Dutch, Swedish,
                  // Spanish and Czech national routes, so excluding them would
                  // leave founders in those countries with no domestic option
                  // at all. Ranking already sorts them below assessed rows
                  // (VERDICT_RANK), so they surface only when nothing better
                  // exists — which is exactly when a founder should see one,
                  // clearly labelled.
                  <span className="mb-1 block font-semibold text-[var(--muted-foreground)]">
                    Not yet verified: we hold no machine-readable rules for this
                    one, so check its criteria yourself before committing time
                  </span>
                )}
                {pending && !r.whyEligible ? <PlaceholderBar /> : r.whyEligible}
                {/* `whyEasy` used to render here: "your answers speak to N of
                    its M documented eligibility rules". That is a ranking
                    confidence metric about our own gate coverage, not an
                    observation about the founder's company (contract rule
                    BRIEF-4). It still computes and still drives ranking; it is
                    no longer printed. */}
                <span className="mt-1.5 block text-[12px] italic text-[var(--foreground-soft)]">
                  <strong className="not-italic font-semibold">Move.</strong>{" "}
                  {pending && !r.nextStep ? <PlaceholderBar narrow /> : r.nextStep}
                </span>
                {/* Curated from the scheme's own document, never model-written.
                    It is the only line on the row that is an instruction rather
                    than an assessment, so it renders even when the writer's
                    prose is still streaming. */}
                {/* Inside a run the route itself is in the heading. The
                    CAVEAT is not: whose route we hold differs row by row
                    inside a run, and dropping it with the route would leave a
                    founder building to a parent regime's instruction believing
                    it was this scheme's own. */}
                {r.applicationChannel && inRunHeading(i) ? (
                  r.applicationRouteFor ? (
                    <span className="mt-1 block text-[12px] text-[var(--muted-foreground)]">
                      <strong className="font-semibold">How to apply.</strong>{" "}
                      The route above is the one recorded for {r.applicationRouteFor}. Confirm it
                      with the body running this scheme before you build to it.
                    </span>
                  ) : null
                ) : r.applicationChannel ? (
                  <span className="mt-1 block text-[12px] text-[var(--muted-foreground)]">
                    <strong className="font-semibold">How to apply.</strong>{" "}
                    {firstWithRoute.get(r.applicationChannel.trim()) === i
                      ? r.applicationChannel
                      : "The same route as above."}
                    {/* Whose route it is. A route recorded for the parent
                        programme is publishable and is NOT this scheme's own
                        instruction, and the row says which it is rather than
                        letting the founder assume. */}
                    {r.applicationRouteFor && (
                      <em className="not-italic">
                        {" "}This is the route recorded for {r.applicationRouteFor}. Confirm it
                        with the body running this scheme before you build to it.
                      </em>
                    )}
                  </span>
                ) : r.applicationRouteUnknown ? (
                  /* An unknown next step stated as unknown. The alternative was
                     what shipped: a parent regime's addressee printed as this
                     scheme's instruction, which sends the founder to the wrong
                     desk with confidence. */
                  <span className="mt-1 block text-[12px] text-[var(--muted-foreground)]">
                    <strong className="font-semibold">How to apply.</strong>{" "}
                    Start by confirming the route with the body that runs this scheme: we hold no
                    application route recorded for it.
                  </span>
                ) : null}
              </td>
              <td className="py-2.5">
                {r.comparableFirms.length > 0 ? (
                  firstWithPeers.get(r.comparableFirms.map((f) => f.name).join("|")) === i ? (
                    r.comparableFirms.map((f) => `${f.name} (${f.amount})`).join(", ")
                  ) : (
                    <span className="text-[var(--muted-foreground)]">The same firms as above</span>
                  )
                ) : (
                  <span className="text-[var(--muted-foreground)]">None traced yet</span>
                )}
              </td>
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      {/* Said ONCE, under the table, rather than in every cell that repeats.
          The first draft put the scope on each repeated cell and it read as
          three lines of muted apology inside a narrow column. The claim
          belongs to the column, so it is stated where the column ends. */}
      {institutions.some((r, i) =>
        r.comparableFirms.length > 0
        && firstWithPeers.get(r.comparableFirms.map((f) => f.name).join("|")) !== i) && (
        <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
          Comparable firms are the peers whose public funding we traced. They are
          named against every route they drew on, so the same names recur; that is
          not evidence a particular fund backed them.
        </p>
      )}
    </>
  );
}

/**
 * Export the brief as a PDF.
 *
 * Two things the bare `window.print()` got wrong. The browser names the file
 * from `document.title`, so every export was called after the marketing page
 * ("Get your state-backed capital brief | Wincent") rather than after the
 * company. And the print stylesheet hid the page with `visibility: hidden`,
 * which blanks pixels but keeps layout — so the nav, hero and footer still
 * occupied their full height around the report.
 *
 * Both are fixed here rather than in CSS alone: the title has to be swapped
 * around the print call and restored after, and the `printing` class lets the
 * stylesheet use `display: none`, which removes the boxes entirely.
 */
function printReport(company: string): void {
  const slug = (company || "brief").normalize("NFKD")
    .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);
  const previous = document.title;
  document.title = `Wincent-brief-${slug}-${stamp}`;
  document.documentElement.classList.add("printing");
  const restore = () => {
    document.title = previous;
    document.documentElement.classList.remove("printing");
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
  // Safari never fires afterprint in some versions; the timer is the backstop
  // so the tab is not left renamed and unstyled.
  setTimeout(restore, 1000);
}

/** The scheme's operators, minus the row's own body. A row never lists itself
 *  as somebody else you could go to. */
function operatorsOtherThan(r: InstitutionEntry): string[] {
  const self = r.institution.trim().toLowerCase();
  return (r.schemeOperators ?? []).filter((o) => o.trim().toLowerCase() !== self);
}

export function SectionTitle({ children, n }: { children: React.ReactNode; n?: string }) {
  return (
    <h3
      className="mt-10 mb-3 flex items-baseline gap-3 text-[17px] font-semibold text-[var(--foreground)] print:mt-7 print:text-[13px]"
      style={serif}
    >
      {n && (
        <span className="font-mono text-[11px] font-normal tracking-[0.18em] text-[var(--accent)] print:text-[9px]">
          {n}
        </span>
      )}
      {children}
    </h3>
  );
}

/** Deterministic, cited, never model-written — shared by the fast verdict
 *  screen and the final memo so both render identically. */
export function EligibilityTable({ rows }: { rows: EligibilityCheck[] }) {
  if (!rows || rows.length === 0) return null;
  // Show what the founder can act on. Once the rules corpus became machine-
  // readable this screen filled with "likely met — verify:" rows that carry no
  // decision: passing a rule you were always going to pass is not information,
  // and 20 such rows sit between the reader and the two that matter. Anything
  // failing, unknown, or asserted (met/not_met on a verified gate) is shown;
  // the merely-likely-met are counted instead.
  const ACTIONABLE = new Set(["not_met", "likely_not_met", "unknown", "met", "info"]);
  const shown = rows.filter((r) => ACTIONABLE.has(r.status));
  const passedQuietly = rows.length - shown.length;
  return (
    <>
      <SectionTitle>Eligibility screen</SectionTitle>
      <p className="mb-3 text-[13px] text-[var(--muted-foreground)]">
        Evaluated in code against the primary texts. Each row cites its legal
        basis; failed gates name the cure.
        {passedQuietly > 0 && (
          <>
            {" "}
            A further {passedQuietly} documented {passedQuietly === 1 ? "rule" : "rules"} on
            these funds {passedQuietly === 1 ? "was" : "were"} checked and raised nothing.
          </>
        )}
      </p>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-[var(--foreground)] text-left align-bottom">
            <th className="py-2 pr-3 font-semibold">Check</th>
            <th className="py-2 pr-3 font-semibold">Status</th>
            <th className="py-2 font-semibold">Finding</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] align-top">
          {shown.map((r, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-3 font-semibold">{r.check}</td>
              <td className="py-2.5 pr-3">
                <span
                  className={
                    "rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide " +
                    (r.status === "met"
                      ? "bg-[#2D6A4F]/15 text-[#1f4d3a]"
                      : r.status === "not_met"
                        ? "bg-[#9b2c2c]/10 text-[#9b2c2c]"
                        : r.status === "likely_met"
                          ? "bg-[#2D6A4F]/10 text-[#1f4d3a]/70"
                          : r.status === "likely_not_met"
                            ? "bg-[#9b2c2c]/5 text-[#9b2c2c]/70"
                            : "bg-[var(--muted)] text-[var(--muted-foreground)]")
                  }
                >
                  {r.status === "not_met" ? "not met"
                    : r.status === "likely_met" ? "likely met"
                    : r.status === "likely_not_met" ? "likely not met"
                    : r.status === "info" ? "note" : r.status}
                </span>
              </td>
              <td className="py-2.5">
                {r.verified ? r.finding : `Verify: ${r.finding}`}
                {r.cure && (
                  <span className="block text-[13px]">
                    <span className="font-semibold">Path.</span> {r.cure}
                  </span>
                )}
                <span className="block text-[11px] text-[var(--muted-foreground)]">
                  {r.source.file}
                  {r.source.locator ? ` · ${r.source.locator}` : ""}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}


/**
 * The whole report rendered as a single advisory letter — flowing serif prose,
 * hairline rules, one restrained comparables table. No cards, boxes, pills or
 * colour blocks. Reads top to bottom and prints to a clean PDF.
 */
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * The trace panel: where every part of this brief came from, and what was
 * removed on the way here.
 *
 * Shown only when the URL carries ?trace=1. Never part of the founder's brief,
 * and deliberately rendered INSIDE the report component rather than as a
 * separate debug page, so what it describes is the brief actually on screen
 * rather than a re-run that might differ.
 *
 * The exclusion counts are the half that cannot be answered any other way: a
 * published fund carries its whole justification, while a fund that never
 * appeared leaves no trace in the output at all.
 */
function TracePanel({ report }: { report: IntelligenceReport }) {
  const p = report.provenance;
  if (!p) return null;
  const badge = (o: string) =>
    o === "code" ? "bg-[#e8efe6] text-[#3d6136]"
      : o === "fixed" ? "bg-[#f0ece2] text-[#6b5f45]"
      : "bg-[#e6ecf4] text-[#2f4d73]";
  const exclusions = Object.entries(p.exclusions).sort((a, b) => b[1] - a[1]);
  return (
    <div className="mt-12 border-t-2 border-dashed border-[var(--border)] pt-6 print:hidden">
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Trace · not part of the brief
      </p>
      <table className="mb-6 w-full border-collapse text-[12px]">
        <tbody className="divide-y divide-[var(--border)] align-top">
          {Object.entries(p.fields).map(([field, meta]) => (
            <tr key={field}>
              <td className="py-1.5 pr-3 font-mono">{field}</td>
              <td className="py-1.5 pr-3">
                <span className={`rounded px-1.5 py-0.5 font-semibold ${badge(meta.origin)}`}>
                  {meta.origin}
                </span>
                {meta.contract && (
                  <span className="ml-2 text-[var(--muted-foreground)]">{meta.contract}</span>
                )}
              </td>
              <td className="py-1.5 text-[var(--muted-foreground)]">{(meta.evidence ?? []).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Funds removed on the way here
      </p>
      {exclusions.length === 0 ? (
        <p className="text-[12px] text-[var(--muted-foreground)]">nothing recorded</p>
      ) : (
        <ul className="text-[12px] text-[var(--muted-foreground)]">
          {exclusions.map(([rule, n]) => (
            <li key={rule} className="font-mono">{rule}: {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Memo({ report, corpusWindow }: {
  report: IntelligenceReport;
  /** The years the corpus covers, e.g. "2021 to 2025". Handed down from
   *  app/brief/page.tsx via IntelligencePanel: this footer used to state
   *  "2021–2025" as a literal, on the one artifact a founder keeps. */
  corpusWindow: string;
}) {
  const self = report.self;
  // Debug view, opt-in per request. Read from the URL rather than held in
  // state: it must survive a reload and never leak into a normal session.
  const trace =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("trace") === "1";
  const date = new Date(report.generatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // The founder's own footprint, as a single quiet line of prose.
  const selfLine = [self.euCapital, self.channelBreakdown, self.activeYears]
    .filter(Boolean)
    .join(" · ");

  const readMinutes = Math.max(
    1,
    Math.round(
      (report.bottomLine.reduce((n, b) => n + wordCount(b), 0) +
        wordCount(report.positioning) +
        wordCount(report.stateOfPlay)) /
        200,
    ),
  );

  // Reveal-first-bullet: the single best line lands immediately, everything
  // else fades in a beat later — an opened loop reads better than a wall of
  // text arriving all at once. The parent keys this component by
  // generatedAt, so this state starts fresh (false) for every new report,
  // never stuck "revealed" from a prior run.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 550);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      id="print-report"
      style={serif}
      className="mt-8 border border-[var(--border)] bg-[var(--paper)] px-7 py-9 sm:px-12 sm:py-12 text-[15px] leading-relaxed text-[var(--foreground)] print:mt-0 print:border-0 print:px-0 print:py-0"
    >
      {/* Export — screen only */}
      <div className="mb-8 flex justify-end print:hidden">
        <button
          onClick={() => printReport(report.company)}
          className="rounded-[var(--radius)] border border-[var(--primary)] px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.06em] text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-[var(--paper)]"
        >
          Export PDF
        </button>
      </div>

      {/* ── Letterhead ─────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between border-t-2 border-[var(--primary)] pt-3 print:pt-2">
        <span className="text-sm font-bold tracking-[0.2em] text-[var(--primary)] print:text-[11px]">
          WINCENT
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)] print:text-[8px]">
          Private funding memorandum · ~{readMinutes} min read
        </span>
      </div>

      {/* ── Salutation block ───────────────────────────────────────── */}
      <dl className="mt-6 grid grid-cols-[4.5rem_1fr] gap-x-4 gap-y-1 text-[14px] print:mt-3 print:gap-y-0.5 print:text-[10px]">
        <dt className="text-[var(--muted-foreground)]">To</dt>
        <dd>The leadership of {report.company}</dd>
        <dt className="text-[var(--muted-foreground)]">Date</dt>
        <dd>{date}</dd>
        <dt className="text-[var(--muted-foreground)]">Re</dt>
        <dd className="font-semibold">Public capital positioning brief</dd>
      </dl>

      <hr className="mt-6 border-[var(--border)] print:mt-3" />

      {/* ── Bottom line: the single best line lands first, up front ──── */}
      <ul className="mt-6 space-y-3 text-[17px] leading-[1.55] print:mt-4 print:space-y-2 print:text-[11px] print:leading-[1.5]">
        <li className="flex gap-3">
          <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
          <span>{report.bottomLine[0]}</span>
        </li>
      </ul>

      {/* ── Everything else fades in a beat later ────────────────────── */}
      <div
        data-reveal
        className={"transition-opacity duration-500 " + (revealed ? "opacity-100" : "opacity-0")}
        aria-hidden={!revealed}
      >
        <ul className="mt-3 space-y-3 text-[17px] leading-[1.55] print:space-y-2 print:text-[11px] print:leading-[1.5]">
          {report.bottomLine.slice(1).map((b, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {selfLine && (
          <p className="mt-3 text-[13px] italic text-[var(--muted-foreground)]">
            Your traced public funding: {selfLine}.
          </p>
        )}

        {/* The brief is exactly four sections (contract BRIEF): bottom line,
            funds, positioning, state of play. The eligibility screen used to
            render here as a fifth block — every documented rule behind every
            candidate, with its source document and page. It is an internal
            artifact, it sat between the reader and what they came for, and
            the funds table below already IS the eligibility statement: a row
            appears because the founder can go after it. The screen still
            computes, and still decides the shortlist; it is no longer
            printed. */}

        {/* ── 2. Where to target ───────────────────────────────────────── */}
        <InstitutionsTable institutions={report.institutions} withheld={report.withheld}
          noDoors={report.noDoors} />

        {/* ── 3. Positioning: fitting the current political moment ─────── */}
        <SectionTitle n="03">Positioning</SectionTitle>
        <p>{report.positioning}</p>

        {/* ── 4. State of play, then the standing offer as its own block ── */}
        <SectionTitle n="04">State of play</SectionTitle>
        <p>{report.stateOfPlay}</p>
        {/* Rendered separately, never concatenated into the paragraph above:
            welded on, the analysis ended mid-thought in a sales line
            (contract rule SOP-2). */}
        <p className="mt-4 border-l-2 border-[var(--primary)] pl-4 text-[var(--foreground-soft)] print:mt-3 print:border-l print:pl-3 print:text-[10px] print:italic">
          {STATE_OF_PLAY_OFFER}
        </p>

        {trace && <TracePanel report={report} />}

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="mt-12 border-t border-[var(--border)] pt-4 print:mt-6 print:pt-2">
          <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)] print:text-[8px]">{report.caveats}</p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)] print:hidden">
            Wincent · the state-backed capital record of European companies, {corpusWindow}
          </p>
        </div>
      </div>
    </div>
  );
}
