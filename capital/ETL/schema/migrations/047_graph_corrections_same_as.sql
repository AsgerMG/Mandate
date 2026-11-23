-- 047: a graph correction may say a body is THE SAME AS another (column same_as, value = the
-- canonical key). 23-24 Nov 2026: the census added register bodies and units that the hand-made map
-- already held under another name (DG CLIMA vs "Directorate-General for Climate Action"); insert-only
-- forbids deleting either, so the newest same_as correction makes the tools show ONE body: the alias
-- is hidden, its units hang under the canonical body, its people appear there. Schema-only.
ALTER TABLE graph_corrections DROP CONSTRAINT IF EXISTS graph_corrections_column_name_check;
ALTER TABLE graph_corrections ADD CONSTRAINT graph_corrections_column_name_check
    CHECK (column_name IN ('name', 'name_local', 'role', 'product_name', 'title', 'parent_key', 'same_as'));
