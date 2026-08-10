"""The guards that decide whether a string may be a test query.

Extracted from `enrich_recall_set.py` when `extend_recall_set.py` needed the
same predicates. Two copies of a leak guard is the worst possible duplication:
the copy that drifts is the one that silently stops catching leaks, and a leak
does not announce itself -- it announces itself as a good score.

THE PROPERTY every guard here enforces, stated once: a description used as a
test query must be a statement about the COMPANY'S WORK that could have been
written without knowing which fund is the right answer. Anything that is
really the fund's own words -- its name, its notified scheme code, a string
already inside the text retrieval is scored against, or a label carried by
most of its recipients -- makes the query a copy of the answer.

The guards, and what each one alone has caught:

  short/shape   too little text to embed, or not prose at all.
  sample title  the string is one of some instrument's `sample_project_titles`,
                which is what `instrument_profiles.profile_text` is built from.
  profile text  the string sits verbatim inside the won fund's own
                `profile_text` -- the column retrieval actually scores against.
                Lives in POSTGRES; the sample-title guard reads SQLite and
                misses 46% of what this one catches. Never approximate one with
                the other.
  funding line  the string covers more than MAX_INSTRUMENT_SHARE of some one
                instrument's recipient companies. A description is specific to
                a piece of work; a funding line's name is carried by everyone
                it funds. Counting companies alone is wrong -- a Horizon
                consortium title is shared by up to 198 partners and is still a
                real project. The measured separation is wide: genuine
                consortium projects at 0.07 and below, scheme names at 1.000.
  names it      the string contains the won fund's scheme code, or a
                distinctive word from its name or its parent's name.

`distinctive` is derived, never enumerated: a token appearing in more than 2%
of instrument names is structural vocabulary ("aid", "programme", "regional")
and sharing one tells us nothing.
"""
from __future__ import annotations

import collections
import hashlib
import json
import os
import re
import unicodedata

# Below this a summary is a stub, not a description. 80 chars is roughly one
# full sentence; semantic.ts refuses to embed under 12 in any case.
MIN_SUMMARY = 80
# Titles are terser than summaries by nature -- a Horizon project title is a
# single descriptive clause -- so they get their own, lower bar.
MIN_TITLE = 25
# See "funding line" above. The observed separation is 0.07 against 1.000, so
# anywhere in between is safe; a tenth sits in the middle of that gap.
MAX_INSTRUMENT_SHARE = 0.10
# A token in more than this share of instrument names is structural vocabulary.
STRUCTURAL_TOKEN_SHARE = 0.02


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s)
                   if not unicodedata.combining(c))


def norm(s: str) -> str:
    """Comparison form: accent-free, punctuation-free, single-spaced lowercase."""
    return re.sub(r"[^a-z0-9 ]+", " ", strip_accents(s).lower()).strip()


def squash(s: str) -> str:
    return re.sub(r"\s+", " ", norm(s))


# Eight words is the unit: long enough that two independent texts do not share
# one by chance, short enough to catch a text quoted into a profile with a word
# changed. MUST match GRAM in website/frontend/lib/intelligence/recallLeaks.ts.
GRAM = 8


def _grams(squashed: str, k: int = GRAM) -> set[str]:
    w = [t for t in squashed.split(" ") if t]
    if not w:
        return set()
    return {" ".join(w[i:i + k]) for i in range(max(len(w) - k + 1, 1))}


def digest(s: str) -> str:
    """A short, stable fingerprint of an ALREADY-SQUASHED string.

    Used where a guard has to ship a set of strings to a credential-free check
    without shipping the strings themselves. `profileLeakIndex.generated.json`
    is committed and `check_answer_not_reachable.ts` treats award prose as an
    answer-bearing source, so the fund's own project titles travel as digests:
    the check can still ask "is this description one of them" and the artifact
    still carries no award title anyone could read.

    sha1 because both languages have it natively and the artifact carries
    probes that fail the build if the two implementations ever disagree. It is
    a fingerprint, not a secret.
    """
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:12]


def distinctive_tokens(names: list[str], corpus_freq: dict[str, int],
                       total: int) -> set[str]:
    out: set[str] = set()
    for n in names:
        for tok in squash(n).split():
            if len(tok) < 5:
                continue
            if corpus_freq.get(tok, 0) / max(total, 1) > STRUCTURAL_TOKEN_SHARE:
                continue
            out.add(tok)
    return out


class LeakIndex:
    """Everything the guards need to consult, built once from the corpus.

    `conn` is an open sqlite3 connection to the ETL database. The Postgres
    profile text is optional and its absence is announced, never faked: a guard
    that cannot run must be visibly off rather than quietly passing everything.
    """

    def __init__(self, conn, verbose: bool = True,
                 title_kinds: dict[str, str] | None = None) -> None:
        self.inst = {r["id"]: dict(r) for r in conn.execute(
            "SELECT id, name, parent_id, root_id, scheme_code, sample_project_titles "
            "FROM funding_instruments")}
        # The corpus's own judgement about whether an instrument's award TITLES
        # are project names or statute names. Empty means "assume project",
        # which is what the callers did when this lived in one of them.
        self.title_kinds: dict[str, str] = title_kinds or {}

        self.sample_titles: set[str] = set()
        for i in self.inst.values():
            raw = i["sample_project_titles"]
            if not raw:
                continue
            try:
                for t in json.loads(raw):
                    if isinstance(t, str) and t.strip():
                        self.sample_titles.add(squash(t))
            except (ValueError, TypeError):
                continue

        self.name_freq: collections.Counter = collections.Counter()
        for i in self.inst.values():
            self.name_freq.update(set(squash(i["name"] or "").split()))
        self.n_inst = len(self.inst)

        self.profile_text: dict[str, str] = {}
        dsn = os.environ.get("DATABASE_URL")
        if dsn:
            try:
                import psycopg2
                pg = psycopg2.connect(dsn)
                with pg.cursor() as cur:
                    cur.execute("SELECT instrument_id, profile_text FROM instrument_profiles")
                    self.profile_text = {i: squash(t or "") for i, t in cur.fetchall()}
                pg.close()
            except Exception as err:  # noqa: BLE001 - any failure means "no guard", loudly
                print(f"WARNING: profile-text guard disabled, could not read "
                      f"instrument_profiles: {err}")
        else:
            print("WARNING: profile-text guard disabled, DATABASE_URL is not set")
        if verbose and self.profile_text:
            print(f"profile-text guard armed over {len(self.profile_text):,} instruments")

        # Filled by build_funding_line_index(). Left empty until then so a
        # caller that skips it gets a share of 0.0 rather than a wrong answer
        # -- and `armed` says which it is.
        self.inst_firms: dict[str, set[int]] = collections.defaultdict(set)
        self.text_inst_firms: dict[str, dict[str, set[int]]] = collections.defaultdict(
            lambda: collections.defaultdict(set))
        self.funding_line_armed = False
        self._kids: dict[str, list[str]] | None = None

    # ── indices that need a full events scan ─────────────────────────────────
    def note_event(self, company_id: int, iids: list[str], texts: list[str]) -> None:
        """Feed one award row into the funding-line index."""
        for iid in iids:
            self.inst_firms[iid].add(company_id)
            for text in texts:
                if text:
                    self.text_inst_firms[squash(text)][iid].add(company_id)
        self.funding_line_armed = True

    # ── the guards ───────────────────────────────────────────────────────────
    def root_of(self, iid: str) -> str:
        i = self.inst.get(iid)
        if not i:
            return iid
        return i["root_id"] or i["parent_id"] or iid

    def in_profile(self, text: str, won: str) -> bool:
        p = self.profile_text.get(won)
        n = squash(text)
        return bool(p and n and n in p)

    def shares_gram(self, text: str, won: str) -> bool:
        """Eight consecutive words in common with the won fund's profile.

        THE GAP THIS CLOSES. `in_profile` asks for whole-string containment, and
        `check_recall_leaks.ts` has always asked the weaker, stricter question
        too -- eight words shared is enough that the string is QUOTING the
        profile rather than coinciding with it. So the build-time guard could
        pass a text the check-time guard then failed, and it did: the first run
        of the description rebuild produced two rows that were verbatim-clean
        and shared an 8-gram, and the only thing that caught them was CI.

        A build guard weaker than the check it feeds is a build guard that
        hands somebody a red build with no way to have known. Same unit, same
        window, same normaliser as recallLeaks.ts.
        """
        n = squash(text)
        p = self.profile_text.get(won) or ""
        if not n or not p:
            return False
        return bool(_grams(n) & _grams(p))

    def siblings_of(self, iid: str) -> list[str]:
        if self._kids is None:
            self._kids = collections.defaultdict(list)
            for other, i in self.inst.items():
                self._kids[i["parent_id"] or other].append(other)
        parent = self.inst.get(iid, {}).get("parent_id") or iid
        return [s for s in self._kids.get(parent, ()) if s != iid]

    def shares_sibling_gram(self, text: str, won: str) -> bool:
        n = squash(text)
        if not n:
            return False
        g = _grams(n)
        return any(g & _grams(self.profile_text.get(s, ""))
                   for s in self.siblings_of(won) if self.profile_text.get(s))

    def in_sibling_profile(self, text: str, won: str) -> bool:
        """Inside the profile of a fund that shares the won fund's parent.

        A sibling shares the scheme name, so such a string describes the FAMILY
        rather than the company -- and it would hand REGIME@5, the operational
        number, for free.
        """
        n = squash(text)
        if not n:
            return False
        return any(n in self.profile_text.get(s, "") for s in self.siblings_of(won))

    def is_sample_title(self, text: str) -> bool:
        return squash(text) in self.sample_titles

    def instrument_share(self, text: str) -> float:
        """Largest share of any one instrument's companies carrying this string."""
        return max((len(firms) / max(len(self.inst_firms[iid]), 1)
                    for iid, firms in self.text_inst_firms.get(squash(text), {}).items()),
                   default=0.0)

    def names_the_fund(self, text: str, won: str) -> bool:
        n = squash(text)
        won_inst = self.inst.get(won, {})
        code = (won_inst.get("scheme_code") or "").strip()
        if code and squash(code) and squash(code) in n:
            return True
        parent = self.inst.get(won_inst.get("parent_id") or "", {})
        names = [won_inst.get("name") or "", parent.get("name") or ""]
        # The fund's WHOLE name, contiguous. The token test below cannot see
        # this: it ignores tokens under 5 characters, so a fund called "AAP
        # PNA" is invisible to it -- and ADEME's award summaries are literally
        # "<programme name> | <project title>", i.e. the answer prefixed to the
        # query. The property is the same one the token test serves; only the
        # unit differs, and a short acronym needs the whole-string unit.
        for name in names:
            s = squash(name)
            if s and len(s) >= 3 and s in n:
                return True
        toks = distinctive_tokens(names, self.name_freq, self.n_inst)
        return bool(toks & set(n.split()))

    def too_short(self, text: str, kind: str) -> bool:
        floor = MIN_SUMMARY if kind == "summary" else MIN_TITLE
        return len(text) < floor

    def not_prose(self, text: str) -> bool:
        return len(squash(text).split()) < 3

    def reject_reason(self, text: str, kind: str, won: str) -> str | None:
        """The first guard this string fails, cheapest first. None means usable.

        Deliberately does NOT include the cross-regime guard: whether a
        description may come from the won fund's own award is a question about
        where the caller is sourcing text, not about the string.
        """
        if not text:
            return "empty"
        if self.too_short(text, kind):
            return "too short"
        if self.not_prose(text):
            return "not prose"
        if self.is_sample_title(text):
            return "is a fund's own sample title"
        if self.in_profile(text, won):
            return "appears in the won fund's profile text"
        if self.shares_gram(text, won):
            return "shares an 8-gram with the won fund's profile text"
        if self.in_sibling_profile(text, won):
            return "appears in a SIBLING's profile text"
        if self.shares_sibling_gram(text, won):
            return "shares an 8-gram with a SIBLING's profile text"
        if self.instrument_share(text) > MAX_INSTRUMENT_SHARE:
            return "names a funding line, not a project"
        if self.names_the_fund(text, won):
            return "names the fund it should help us find"
        return None

    # ── borrowing ANOTHER award's text ───────────────────────────────────────
    def borrow_reject_reason(self, text: str, kind: str, iids: list[str],
                             won: str) -> str | None:
        """`reject_reason` plus the two guards that only a BORROWED text needs.

        Three scripts now recover a description from an award other than the
        one being predicted (`enrich_recall_set`, `extend_recall_set` for its
        composed base, `rebuild_recall_descriptions`). Each needs the same two
        extra predicates, and two copies of a leak guard is the duplication
        this whole module exists to remove -- the copy that drifts is the one
        that silently stops catching leaks.

          cross-regime  the text's own instrument, and every instrument its
                        source maps to, must have a different root from the won
                        fund. Not merely a different id: siblings share a scheme
                        name, which is exactly the string that leaked.
          title kind    a `project_title` is used only from instruments whose
                        titles the corpus classifier calls 'project'. That
                        classifier already knows which registers publish statute
                        names as titles. `project_summary` is exempt: no scheme
                        publishes a per-award summary.
        """
        won_root = self.root_of(won)
        if any(i == won or self.root_of(i) == won_root for i in iids):
            return "same regime as the won fund"
        if kind == "title" and not any(
                self.title_kinds.get(i, "project") == "project" for i in iids):
            return "source titles are scheme names"
        return self.reject_reason(text, kind, won)
