-- q06b: Sector mix 2020-2021 vs 2024-2025 (compare early vs late period)
SELECT c.sector_inferred AS sector,
       SUM(CASE WHEN CAST(v.event_year AS INTEGER) BETWEEN 2020 AND 2021 THEN 1 ELSE 0 END) AS early_count,
       SUM(CASE WHEN CAST(v.event_year AS INTEGER) BETWEEN 2024 AND 2025 THEN 1 ELSE 0 END) AS late_count
FROM companies c
JOIN v_events v ON v.company_id = c.id
WHERE v.event_year IS NOT NULL AND c.sector_inferred IS NOT NULL
GROUP BY c.sector_inferred
ORDER BY late_count DESC;
