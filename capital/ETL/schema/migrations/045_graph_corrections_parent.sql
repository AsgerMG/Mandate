-- 045: a graph correction may also move a node in the hierarchy (column parent_key). 19 Nov 2026:
-- gov.uk says DBT and DSIT closed and BIST now sponsors UKRI and the British Business Bank; the
-- original rows stay (insert-only), the newest parent_key correction places the node under BIST.
-- Schema-only: widens the CHECK; no row is changed.
ALTER TABLE graph_corrections DROP CONSTRAINT IF EXISTS graph_corrections_column_name_check;
ALTER TABLE graph_corrections ADD CONSTRAINT graph_corrections_column_name_check
    CHECK (column_name IN ('name', 'name_local', 'role', 'product_name', 'title', 'parent_key'));
