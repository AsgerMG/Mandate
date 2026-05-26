-- q02b: Source family co-occurrence (how many companies appear in both family A and B)
SELECT a.source_family AS family_a,
       b.source_family AS family_b,
       COUNT(DISTINCT a.company_id) AS co_count
FROM v_events a
JOIN v_events b ON a.company_id = b.company_id AND a.source_family < b.source_family
GROUP BY a.source_family, b.source_family
ORDER BY co_count DESC;
