-- Make the hierarchy explicit and filterable.
--
-- parent_id already existed, but what a parent MEANT differed by channel and
-- nothing said so: a SATR parent is a notified regime, an ADEME parent is the
-- agency, an EIT parent is a KIC — and EIT genuinely nests three deep
-- (EIT -> Climate-KIC -> Clean Cities Spain). Callers had to infer "can a
-- founder apply to this?" from "does it have children?", which is true but
-- implicit, and every consumer re-derived it.
--
--   tier     'family'    a grouping that holds rules and cannot be applied to
--            'programme' a leaf: what a founder actually applies to
--   root_id  the top of its lineage, so an agency's whole tree groups in one
--            filter regardless of depth
--   depth    0 for a root, 1 for its children, and so on
--
-- Derived on every load from parent_id, never hand-set, so it cannot drift
-- from the structure it describes.
ALTER TABLE funding_instruments ADD COLUMN tier TEXT;
ALTER TABLE funding_instruments ADD COLUMN root_id TEXT;
ALTER TABLE funding_instruments ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;
-- Materialised path, "/"-delimited and root-first, e.g.
--   eit/eit_digital/eit_digital_champions
-- Adjacency (parent_id) alone answers "who is my parent" cheaply and "give me
-- everything under EIT" only with a recursive query. The path makes a subtree
-- one LIKE, gives a stable sort that keeps a family together with its
-- programmes beneath it, and renders a breadcrumb without walking. The two are
-- kept together on purpose: adjacency stays the source of truth and the path is
-- derived from it on every load, so it cannot drift.
ALTER TABLE funding_instruments ADD COLUMN path TEXT;
CREATE INDEX IF NOT EXISTS idx_fi_tier ON funding_instruments (tier);
CREATE INDEX IF NOT EXISTS idx_fi_root ON funding_instruments (root_id);
CREATE INDEX IF NOT EXISTS idx_fi_path ON funding_instruments (path);
