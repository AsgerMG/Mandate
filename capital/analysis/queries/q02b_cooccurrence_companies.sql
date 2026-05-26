-- q02b (companies-only): Source family co-occurrence, restricted to entity_type='company'.
SELECT a.source_family AS family_a,
       b.source_family AS family_b,
       COUNT(DISTINCT a.company_id) AS co_count
FROM v_events a
JOIN v_events b ON a.company_id = b.company_id AND a.source_family < b.source_family
JOIN companies c ON c.id = a.company_id
WHERE c.entity_type = 'company'
GROUP BY a.source_family, b.source_family
ORDER BY co_count DESC;
