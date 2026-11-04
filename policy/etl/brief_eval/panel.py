"""Fixed evaluation panel for the brief self-improvement loop.

Deliberately hand-written and stable rather than regenerated each run — the
whole point is that a score change week over week reflects a prompt/retrieval
change, not a different sample. Update this list only when you deliberately
want to widen coverage, and treat that as its own decision (it resets the
baseline for comparing future rounds).

Five profiles, chosen for spread across the compliance verdict space rather
than breadth — each one should pull a different set of instruments/verdicts:
a platform (DMA/DSA-adjacent), an industrial-tech manufacturer (CRA), a
genuinely out-of-scope traditional business (tests the "Out of Scope"
appendix for real, not just as a fallback), a thinly-scoped early-stage B2B
tech start-up, and a consumer digital-health start-up (AI Act + special-
category data). Judge calls are batched across the whole panel in one call
(see judge.py), so panel size drives generation cost linearly but NOT judge
cost — widening this list is cheaper than it looks.
"""

from __future__ import annotations

from data.models import Jurisdiction
from etl.intelligence.profile import CompanyProfile

EVAL_PANEL: list[CompanyProfile] = [
    CompanyProfile(
        name="Panel: AI SaaS platform",
        description=(
            "B2B software-as-a-service platform providing an AI-powered "
            "document-analysis API to enterprise customers."
        ),
        sectors=["software", "ai"],
        markets=[Jurisdiction.EU, Jurisdiction.DE],
        uses_ai=True,
        handles_personal_data=True,
        company_size="medium",
        ai_role="provider",
        customer_type="b2b",
    ),
    CompanyProfile(
        name="Panel: Industrial IoT manufacturer",
        description=(
            "Manufacturer of connected sensors and controllers for factory "
            "automation, sold to industrial customers."
        ),
        sectors=["manufacturing", "iot"],
        markets=[Jurisdiction.EU],
        uses_ai=False,
        handles_personal_data=False,
        company_size="large",
        customer_type="b2b",
    ),
    CompanyProfile(
        name="Panel: Local logistics & warehousing operator",
        description=(
            "Regional logistics and warehousing company providing freight "
            "storage and last-mile delivery for domestic business customers. "
            "No digital product; internal operations software only."
        ),
        sectors=["logistics"],
        markets=[Jurisdiction.EU, Jurisdiction.DE],
        uses_ai=False,
        handles_personal_data=False,
        company_size="medium",
        customer_type="b2b",
    ),
    CompanyProfile(
        name="Panel: Early-stage B2B SaaS start-up",
        description=(
            "Two-person early-stage startup building a project-management "
            "tool for small engineering teams. Pre-revenue, no dedicated "
            "compliance or legal function."
        ),
        sectors=["software"],
        markets=[Jurisdiction.EU],
        uses_ai=False,
        handles_personal_data=True,
        company_size="micro",
        customer_type="b2b",
    ),
    CompanyProfile(
        name="Panel: Consumer digital-health app start-up",
        description=(
            "Early-stage startup building an AI-assisted symptom-checker app "
            "for consumers, offered directly to the public via app stores."
        ),
        sectors=["healthtech", "ai"],
        markets=[Jurisdiction.EU, Jurisdiction.FR],
        uses_ai=True,
        handles_personal_data=True,
        company_size="micro",
        ai_role="provider",
        customer_type="b2c",
        data_categories=["health"],
    ),
    # --- Added 2026-07-28 (Phase 5.0) -----------------------------------
    # Widened 5 -> 10 because at n=5 the judge's noise floor (~±0.3 on a 1-5
    # scale) cannot resolve the gains Phase 5 is designed to produce — we would
    # pay for a lever and be unable to tell whether it worked. Judge cost is
    # flat in panel size (scores batch into one call); only generation scales,
    # so this roughly doubles generation cost per round and leaves judging
    # unchanged.
    #
    # These five were chosen to exercise retrieval paths the original panel
    # never triggered: no profile had `monthly_eu_users` (so the `platform`
    # facet never fired), none was b2c outside health (so `consumer` rarely
    # fired), and fintech/adtech/telecom/public-sector had no representation at
    # all despite each having its own mapped sector facet. A panel that never
    # exercises half the facets cannot detect a regression in them.
    #
    # NOTE: this resets the baseline. The 3.80 -> 4.11 Phase 1-4 comparison
    # cannot be extended across a panel change — the widened panel needs its own
    # baseline run before any Phase 5 lever lands.
    CompanyProfile(
        name="Panel: Large consumer marketplace platform",
        description=(
            "Consumer marketplace connecting independent sellers with buyers "
            "across the EU, with an advertising business funded by on-platform "
            "behavioural targeting and an in-house recommender feed."
        ),
        sectors=["ecommerce", "adtech"],
        markets=[Jurisdiction.EU, Jurisdiction.DE, Jurisdiction.FR],
        uses_ai=True,
        handles_personal_data=True,
        company_size="large",
        ai_role="deployer",
        monthly_eu_users="over 45 million",
        customer_type="both",
    ),
    CompanyProfile(
        name="Panel: Payments and credit-scoring fintech",
        description=(
            "Licensed payment institution providing account-to-account payments "
            "plus an AI credit-scoring API sold to consumer lenders."
        ),
        sectors=["fintech"],
        markets=[Jurisdiction.EU, Jurisdiction.DE],
        uses_ai=True,
        handles_personal_data=True,
        company_size="medium",
        ai_role="provider",
        customer_type="b2b",
        data_categories=["financial"],
    ),
    CompanyProfile(
        name="Panel: Adtech targeting and measurement vendor",
        description=(
            "Programmatic advertising vendor providing audience segmentation, "
            "cross-site measurement and consent management to publishers."
        ),
        sectors=["adtech"],
        markets=[Jurisdiction.EU, Jurisdiction.FR],
        uses_ai=True,
        handles_personal_data=True,
        company_size="medium",
        ai_role="deployer",
        customer_type="b2b",
        data_categories=["behavioural", "special-category"],
    ),
    CompanyProfile(
        name="Panel: Regional telecoms operator",
        description=(
            "Fixed and mobile electronic communications provider serving "
            "residential and business subscribers in two member states."
        ),
        sectors=["telecom"],
        markets=[Jurisdiction.EU, Jurisdiction.DE],
        uses_ai=False,
        handles_personal_data=True,
        company_size="large",
        customer_type="both",
    ),
    CompanyProfile(
        name="Panel: Public-sector digital services supplier",
        description=(
            "Builds and operates citizen-facing web and mobile services under "
            "contract to municipal and national public authorities."
        ),
        sectors=["public-sector", "software-saas"],
        markets=[Jurisdiction.EU, Jurisdiction.FR],
        uses_ai=False,
        handles_personal_data=True,
        company_size="medium",
        customer_type="b2b",
    ),
]
