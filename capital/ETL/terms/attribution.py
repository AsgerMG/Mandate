"""Which fund did this award actually come from? One definition, two readers.

`populate_funding_instruments.py` splits a rollup into the thing a founder can
actually apply to, two different ways:

    programme child   (fam, programme_name)              scheme_code = ''
    scheme child      (fam, call_id, granting_authority) scheme_code = call_id

Everything downstream that wants to say "company X won fund Y" has to reproduce
that split, and until this module existed each reader approximated it
differently:

  - `emit_peer_prior.py` joined `scheme_code = call_id`. A programme child has
    an EMPTY scheme_code by construction, so 299 instruments -- four of the five
    largest sibling groups in the corpus -- were invisible to the strongest
    ranking signal the product has. And 34 scheme codes are shared by more than
    one instrument (SA.56245 by 18), so an award credited every delivery body of
    its notified scheme rather than the one that signed it.
  - `__recallSet.json` was traced with the same two joins, so the ground truth
    could not name those funds either -- which made fixing the prior measure as
    a loss.

Both defects are the same missing definition. It lives here now.

WHAT THIS DOES NOT DO. `leaf_for` returns None when the split cannot place an
award: no source map, or a family that publishes neither a programme name nor a
(call, authority) pair, or a child that fell below `MIN_CHILD_EVENTS` and
therefore does not exist. A caller that needs a row for every award should fall
back to the FAMILY and know it is holding a regime, not a fund. Guessing a leaf
is worse than admitting there is not one: the whole point of the split is that
a founder applies to a specific door.
"""
from __future__ import annotations

import collections

# `populate_funding_instruments.py` will not create a child below this, so an
# instrument under it does not exist and cannot be an answer. Read from that
# module's own constant rather than restated, so a change there cannot leave
# this one silently stale.
try:  # pragma: no cover - import shape depends on which block is on sys.path
    from populate_funding_instruments import (
        MIN_CHILD_EVENTS, child_slug, _name_digest,
    )
except ImportError:  # pragma: no cover
    MIN_CHILD_EVENTS = 40
    child_slug = _name_digest = None


class Split:
    """The ETL's split, as lookups. Build once, call `leaf_for` per award."""

    def __init__(self, conn) -> None:
        self.src2fam: dict[str, list[str]] = collections.defaultdict(list)
        for source, iid in conn.execute(
                "SELECT source, instrument_id FROM funding_instrument_sources"):
            self.src2fam[source].append(iid)

        # ── Key on the id the ETL built, never on the name it displays ──────
        #
        # THE DEFECT THIS REPLACES, measured 2026-08-09. This used to key a
        # child on `(parent_id, name, scheme_code)` and look it up with the
        # award's `granting_authority`, on the strength of
        # `populate_funding_instruments.py` constructing a scheme child as
        # `name=authority`. Forty lines later that same pass does:
        #
        #     row["name"] = title ; row["name_source"] = "case_register"
        #
        # for every child carrying an SA number — 430 of 453 — replacing the
        # granting body with the Commission's registered scheme title. So the
        # lookup asked for "Amt der Niederösterreichischen Landesregierung" and
        # the map held "Allgemeine Richtlinie für NÖ Förderungen…". Two value
        # spaces, one membership test, and the test can never succeed: exactly
        # the shape of the `split_families()` defect one column over.
        #
        # It is not visible as an error. Placement simply reads 11.5% instead of
        # 41.9%, 241 leaves instead of 671, and SEVEN countries instead of 22 —
        # and it looked for a week like a layer that had gone stale, because a
        # rebuild run in an agent worktree (where `data/raw/state_aid_cases/`
        # is gitignored and absent) skips the rename and "repairs" it.
        #
        # THE PROPERTY. A join key must be a field nothing renames. `name` is a
        # display column with four writers (the split, the case register,
        # programme_names.json, apply_override_names.py); the ID is what the
        # ETL keys on, is asserted stable across runs by `child_slug`'s own
        # docstring, and is the thing the reconcile step tests. So this
        # reproduces the id — by IMPORTING the ETL's own two helpers, so there
        # is one definition and it cannot drift — and asks whether the corpus
        # holds it. Nothing here reads a name.
        self.child_ids: set[str] = set()
        # Retained only as the fallback for a corpus whose ETL helpers are not
        # importable (see the try/except above); it is the old behaviour, and
        # it is the behaviour with the bug.
        self.prog_key: dict[tuple[str, str], str] = {}
        self.sch_key: dict[tuple[str, str, str], str] = {}
        # A family that was split. `door_for` needs the complement of this set --
        # the families that are themselves the fund -- and it is the same one
        # `publishableInstruments()` uses to decide what may be shown.
        self.has_children: set[str] = set()
        for iid, parent, name, code in conn.execute(
                "SELECT id, parent_id, name, scheme_code FROM funding_instruments"):
            if not parent:
                continue
            self.child_ids.add(iid)
            self.has_children.add(parent)
            code = (code or "").strip()
            name = (name or "")[:200]
            if code:
                self.sch_key[(parent, name, code)] = iid
            else:
                self.prog_key[(parent, name)] = iid

        # A source splits by programme only when it publishes MORE THAN ONE
        # programme name -- the same test the ETL applies, for the same reason.
        # A split on a constant is not a split; it produces one child named
        # after its own parent and halves that programme's award history.
        self.programme_split = {r[0] for r in conn.execute("""
            SELECT source FROM public_funding_events
             WHERE programme_name IS NOT NULL AND programme_name != ''
             GROUP BY source
            HAVING COUNT(*) >= ? AND COUNT(DISTINCT programme_name) > 1
        """, (MIN_CHILD_EVENTS,))}

        # The notified scheme, for the fallback below. A scheme code is shared
        # by more than one instrument in 34 cases (SA.56245 by 18) -- one
        # notified scheme delivered by many bodies -- which is why this is a
        # fallback and not the join.
        self.code2inst: dict[str, list[str]] = collections.defaultdict(list)
        self.inst_scheme_code: dict[str, str] = {}
        for iid, code in conn.execute(
                "SELECT id, scheme_code FROM funding_instruments"):
            code = (code or "").strip()
            self.inst_scheme_code[iid] = code
            if code:
                self.code2inst[code].append(iid)

    def families(self, source: str) -> list[str]:
        return self.src2fam.get(source, [])

    def credit(self, source: str, programme_name, granting_authority,
               call_id, always_notified_scheme: bool = False) -> list[str]:
        """Every instrument this award is evidence for, best first.

        `leaf_for` is exact and often returns nothing: a scheme child exists
        only above `MIN_CHILD_EVENTS`, so 82% of awards -- overwhelmingly SATR
        -- have no child of their own. A GROUND TRUTH must refuse those, because
        a test pair has to name one right answer. A PRIOR must not: dropping
        them would delete most of the signal, and the award really is evidence
        that companies like this one win money under that notified scheme.

        So the chain widens rather than guesses:

          1. the exact leaf, when the split placed the award;
          2. otherwise every instrument sharing the notified scheme code -- one
             scheme, several delivery bodies, and we cannot tell which signed;
          3. otherwise the family, which is a regime and therefore usually
             unproposable, so an unplaceable award contributes nothing rather
             than crediting a rollup a founder cannot apply to.
        """
        leaf = self.leaf_for(source, programme_name, granting_authority, call_id)
        by_code = self.code2inst.get((call_id or "").strip(), [])
        if leaf:
            # `always_notified_scheme` credits the leaf AND its co-delivered
            # siblings. That is deliberately WRONG about which body signed --
            # it is the mis-crediting the exact split exists to remove -- but
            # every one of those siblings is the same REGIME, and REGIME@5 is
            # the operational number. Measured, not assumed: see the commit.
            if always_notified_scheme:
                return [leaf] + [i for i in by_code if i != leaf]
            return [leaf]
        if by_code:
            return list(by_code)
        return self.families(source)

    def door_for(self, source: str, programme_name, granting_authority,
                 call_id) -> str | None:
        """The instrument a founder would have applied to — INCLUDING the case
        where that instrument is a family.

        ── The blind spot this closes ────────────────────────────────────────
        `leaf_for` builds `prog_key` and `sch_key` from rows WITH a parent, so it
        can only ever return a CHILD. That was fine for its original caller and
        wrong as a definition of "the door": a family with no children is not a
        rollup above the funds, it IS the fund. `publishableInstruments()` offers
        it, the shortlist shows it, and the founder applies to it. `cdti_idi`,
        `cdti_neotec`, `innovate_uk` and Bpifrance's innovation line are all
        childless families, and `leaf_for` returns None for every one of their
        awards — 199 of the 782 leaves the product offers, 17,012 awards behind
        `innovate_uk` alone.

        The ground truth was built on `leaf_for`, so those 199 funds could never
        be an answer, and EXACT@5 was silently a statement about the subset that
        could. The PRIOR never had this hole: `credit()` already falls back to
        `families()`, so the ranker has always been able to learn these funds
        while the key could not grade them. That asymmetry is exactly what made
        promoting them measure as a loss.

        ── Why this refuses rather than guesses, in two cases ────────────────
        A FAMILY WITH CHILDREN is a regime. An award the split could not place
        under it belongs to some child we did not build (below
        `MIN_CHILD_EVENTS`) or to a body the register did not name. Crediting the
        regime would make the right answer a row the founder cannot apply to.
        AMBIGUITY: one source in the corpus maps to 88 childless families at
        once. "Which of these 88 did this award come from" has no answer, and a
        test pair needs exactly one, so it is refused.

        Both refusals leave `None`, which the caller must treat as "no honest
        pair exists" — never as a licence to pick something close."""
        leaf = self.leaf_for(source, programme_name, granting_authority, call_id)
        if leaf:
            return leaf
        fams = self.src2fam.get(source, [])
        if len(fams) == 1 and fams[0] not in self.has_children:
            return fams[0]
        return None

    def leaf_for(self, source: str, programme_name, granting_authority,
                 call_id) -> str | None:
        """The instrument a founder would have applied to, WHEN IT IS A CHILD.

        Returns None for a childless family even though that family is a real
        door — see `door_for`, which is the complete test. Kept narrow because
        `emit_peer_prior.py` reads it as the first, most specific step of a
        widening chain and `credit()` already handles the family case below it.
        """
        prog = (programme_name or "").strip()
        body = (granting_authority or "")[:200]
        call = (call_id or "").strip()
        for fam in self.src2fam.get(source, []):
            if prog and source in self.programme_split:
                hit = self._child_id(f"{fam}__{child_slug(prog)}_{_name_digest(prog)}") \
                    if child_slug else None
                if hit is None:
                    hit = self.prog_key.get((fam, prog[:200]))
                if hit:
                    return hit
            if body and call:
                # The award's own two published fields, in the order the ETL
                # composes them. `granting_authority` un-truncated: the id is
                # built from the full string, and `body` above is clipped to
                # 200 for the legacy name lookup only.
                hit = self._child_id(
                    f"{fam}__{child_slug(call)}__{child_slug(granting_authority or '')}"
                ) if child_slug else None
                if hit is None:
                    hit = self.sch_key.get((fam, body, call))
                if hit:
                    return hit
        return None

    def _child_id(self, candidate: str) -> str | None:
        """The candidate id, if the corpus actually holds it as a child.

        Membership, not construction: a child below `MIN_CHILD_EVENTS` is never
        built, so an id that reconstructs perfectly and is not in the table
        means there is no such fund — which is a `None`, not a guess.
        """
        return candidate if candidate in self.child_ids else None
