# Proposal 6: name the person the graph returns, and look up the company's own region (from tag arc6)

deeptech_fr (arc6, 24 Nov): the right-person check PARTLY and the regional door NOT MET. The tools
were right: `stakeholders` returned Bpifrance's Direction Innovation head (Paul-François Fournier),
cited to Bpifrance's governance page, as of 18 Nov; AURA Entreprises and the regional council are
in the graph with people. Wincent named P1/P2 "by function", because method.md, wincent.md,
write-brief and case-board all still said "by function; a name only when verified", written before
the graph held verified names, while funding-routes 4e2 said "name the person (from the chart,
dated)". And he searched only inside Bpifrance's tree, so the region never came up.

The change (one property in five files, now consistent): a holder the `stakeholders` tool returns is
verified (official chart or register, cited, dated): name them with the citation and the as_of
date, and "verify before contacting" when over 18 months old or flagged; the function alone only
where no holder is published. Plus a test in 4e: the company's own region is always looked up in
the graph (`institution_tree` {market, query: the region's name}) before it is parked.

Decide on: deeptech_fr re-run (before arc6), checks must_16 (right person) and must_4 (region).
