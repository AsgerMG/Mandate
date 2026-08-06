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
    from populate_funding_instruments import MIN_CHILD_EVENTS
except ImportError:
    MIN_CHILD_EVENTS = 40


class Split:
    """The ETL's split, as lookups. Build once, call `leaf_for` per award."""

    def __init__(self, conn) -> None:
        self.src2fam: dict[str, list[str]] = collections.defaultdict(list)
        for source, iid in conn.execute(
                "SELECT source, instrument_id FROM funding_instrument_sources"):
            self.src2fam[source].append(iid)

        # Keyed on the child's own identity fields rather than on a rebuilt id.
        # The id is a slug plus a digest of the name; reproducing it here would
        # be a second copy of a string-munging routine that must never drift.
        self.prog_key: dict[tuple[str, str], str] = {}
        self.sch_key: dict[tuple[str, str, str], str] = {}
        for iid, parent, name, code in conn.execute(
                "SELECT id, parent_id, name, scheme_code FROM funding_instruments"):
            if not parent:
                continue
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
        for iid, code in conn.execute(
                "SELECT id, scheme_code FROM funding_instruments"):
            code = (code or "").strip()
            if code:
                self.code2inst[code].append(iid)

    def families(self, source: str) -> list[str]:
        return self.src2fam.get(source, [])

    def credit(self, source: str, programme_name, granting_authority,
               call_id) -> list[str]:
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
        if leaf:
            return [leaf]
        by_code = self.code2inst.get((call_id or "").strip(), [])
        if by_code:
            return list(by_code)
        return self.families(source)

    def leaf_for(self, source: str, programme_name, granting_authority,
                 call_id) -> str | None:
        """The instrument a founder would have applied to. None if unplaceable."""
        prog = (programme_name or "").strip()
        body = (granting_authority or "")[:200]
        call = (call_id or "").strip()
        for fam in self.src2fam.get(source, []):
            if prog and source in self.programme_split:
                hit = self.prog_key.get((fam, prog[:200]))
                if hit:
                    return hit
            if body and call:
                hit = self.sch_key.get((fam, body, call))
                if hit:
                    return hit
        return None
