"""The company profile — the input that personalizes a policy briefing.

The profile is filled in two passes: the initial form (name, description,
sectors, flags) and the scoping answers collected by the follow-up questions
(see questions.py). The scoping fields are what let the report say "in scope"
or "out of scope" instead of hedging — SME status, AI value-chain role, and
user counts are the thresholds most EU instruments actually turn on.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from data.models import Jurisdiction


class CompanyProfile(BaseModel):
    """What a company tells us about itself, used to retrieve and frame the
    relevant policy landscape."""

    name: str
    description: str = Field(
        default="",
        description="Free-text: what the company does, products, business model.",
    )
    sectors: list[str] = Field(default_factory=list, description="Sector slugs (see seeds).")
    markets: list[Jurisdiction] = Field(
        default_factory=lambda: [Jurisdiction.EU],
        description="Jurisdictions the company operates in.",
    )
    uses_ai: bool = False
    handles_personal_data: bool = False

    # --- Scoping fields (second pass, from the clarifying questions) ---------
    company_size: str | None = Field(
        default=None,
        description="micro / small / medium / large — SME status gates many obligations.",
    )
    ai_role: str | None = Field(
        default=None,
        description="provider / deployer / both / none — the AI Act assigns duties by role.",
    )
    monthly_eu_users: str | None = Field(
        default=None,
        description="Approximate monthly active EU users (DSA tiers turn on this).",
    )
    data_categories: list[str] = Field(
        default_factory=list,
        description="Sensitive processing: special-category, biometric, children, location…",
    )
    ai_use_cases: list[str] = Field(
        default_factory=list,
        description=(
            "What the AI system decides about a person, if anything — the AI Act's "
            "Annex III high-risk trigger turns on this, not on provider/deployer role."
        ),
    )
    customer_type: str | None = Field(
        default=None, description="b2b / b2c / both — consumer-facing rules differ."
    )
    answers: dict[str, str] = Field(
        default_factory=dict,
        description="Free-form scoping Q&A (question id → answer) from the follow-up step.",
    )

    def scoping_lines(self) -> list[str]:
        """Human-readable scoping facts, used both in the retrieval query and in
        the report instruction so the analyst can rule instruments in or out."""
        lines: list[str] = []
        if self.company_size:
            lines.append(f"Company size: {self.company_size}.")
        if self.ai_role and self.ai_role != "none":
            lines.append(f"Role in the AI value chain: {self.ai_role}.")
        if self.monthly_eu_users:
            lines.append(f"Approx. monthly active EU users: {self.monthly_eu_users}.")
        if self.data_categories:
            lines.append("Sensitive data processed: " + ", ".join(self.data_categories) + ".")
        if self.ai_use_cases:
            lines.append(
                "What the AI system decides about a person: "
                + ", ".join(self.ai_use_cases)
                + "."
            )
        if self.customer_type:
            lines.append(f"Customer base: {self.customer_type}.")
        for qid, answer in self.answers.items():
            if answer:
                lines.append(f"{qid.replace('_', ' ').capitalize()}: {answer}")
        return lines

    def to_query(self) -> str:
        """Compose a natural-language retrieval query from the profile. This is
        what gets embedded and matched against passage vectors."""
        parts = [self.name]
        if self.description:
            parts.append(self.description)
        if self.sectors:
            parts.append("Sectors: " + ", ".join(self.sectors))
        if self.uses_ai:
            parts.append("Develops or deploys artificial intelligence systems.")
        if self.handles_personal_data:
            parts.append("Processes personal data of individuals.")
        parts.extend(self.scoping_lines())
        parts.append("What EU tech-policy obligations and upcoming changes apply?")
        return " ".join(parts)

    def retrieval_queries(self) -> list[tuple[str, str]]:
        """``(facet, query)`` pairs to retrieve for, the profile query first.

        to_query() concatenates everything the company is into one string, and
        an embedding of that string is the *centroid* of all of it — close to
        everything the company touches and sharply close to nothing. Measured
        live 2026-07-27 on a fintech/AI profile: median cosine similarity 0.53
        across 66 retrieved passages, top match 0.645. That is the signature
        of a centroid query, and it is why the retrieved set reads as
        topically-adjacent rather than on-point.

        Splitting the profile into the obligation areas it actually implicates
        and retrieving per area gives each facet its own sharp query, so
        "automated decision-making and profiling" retrieves GDPR Art. 22
        material instead of losing to whatever prose best matches the blob.
        Facets union rather than compete: a company is not asked to pick
        between its AI exposure and its consumer-law exposure.

        Deliberately deterministic — derived from the profile's own structured
        fields, no LLM call. Retrieval planning that costs a model call would
        add latency and spend to every brief, and the mapping from "handles
        personal data" to "the data-protection facet" is not a judgment call
        that needs one.
        """
        facets: list[tuple[str, str]] = [("profile", self.to_query())]

        if self.uses_ai:
            has_role = self.ai_role and self.ai_role != "none"
            role = self.ai_role if has_role else "provider or deployer"
            # Annex III's high-risk trigger turns on WHAT the system decides about a
            # person, not who built it — role alone retrieves the generic high-risk
            # boilerplate, never the specific Annex III category (creditworthiness,
            # hiring, biometric ID…) that actually resolves the verdict.
            concrete_use_cases = [
                u for u in self.ai_use_cases if u and u != "none of these"
            ]
            annex_iii = (
                "Annex III high-risk classification for "
                + ", ".join(concrete_use_cases)
                + " use cases, "
                if concrete_use_cases
                else "high-risk classification and Annex III use cases, "
            )
            facets.append(
                (
                    "ai",
                    f"Obligations of an AI system {role}: prohibited practices, " + annex_iii +
                    "risk management system, data "
                    "governance and training data quality, technical documentation, "
                    "conformity assessment and CE marking, human oversight, accuracy and "
                    "robustness, transparency duties, general-purpose AI model obligations.",
                )
            )
        if self.handles_personal_data:
            facets.append(
                (
                    "data-protection",
                    "Personal data processing obligations: lawful basis and consent, "
                    "purpose limitation and data minimisation, automated individual "
                    "decision-making and profiling, data subject rights of access and "
                    "erasure, data protection impact assessment, controller and processor "
                    "duties, security of processing and breach notification, "
                    "international transfers.",
                )
            )
        # Enforcement precedent needs its own facet or it is never retrieved at
        # all. Verified 2026-07-27, right after case law was first ingested: a
        # court-shaped query ("Court of Justice ruling on international
        # transfers") returns 4 judgments in its top 10, while the profile query
        # for the same company returns zero. Judgments are written as
        # "Case C-123/24, X v Y: Judgment of the Court..." — that has no
        # resemblance to a company description, so no amount of profile text
        # reaches them. Phrasing this facet the way rulings are phrased is what
        # makes the case-law layer usable rather than merely present, and "what a
        # court actually held" is what turns a verdict from a reading of the text
        # into a statement about how the text has actually been applied.
        enforcement_scope = ""
        if self.uses_ai:
            enforcement_scope += "artificial intelligence systems, "
        if self.handles_personal_data:
            enforcement_scope += (
                "personal data processing, automated decision-making, "
                "international data transfers, "
            )
        facets.append(
            (
                "enforcement",
                "Court of Justice and General Court rulings, supervisory authority "
                "enforcement decisions and fines concerning "
                + enforcement_scope
                + "obligations of the kind this company is subject to — what the court "
                "held, which provision was breached, and the penalty imposed.",
            )
        )
        if self.data_categories:
            facets.append(
                (
                    "sensitive-data",
                    "Processing of "
                    + ", ".join(self.data_categories)
                    + " data: special categories of personal data, explicit consent, "
                    "biometric and emotion recognition restrictions, protection of "
                    "children, prohibited processing and derogations.",
                )
            )
        # Distinct slugs only: aliases collapse (a profile listing both
        # "manufacturing" and "iot" means one sector), and retrieving the same
        # facet query twice would spend an embedding call and a rerank call to
        # produce passages _merge_passages then discards as duplicates.
        seen_sectors: set[str] = set()
        for sector in self.sectors:
            raw = sector.strip().lower()
            slug = _SECTOR_ALIASES.get(raw, raw)
            if slug in seen_sectors:
                continue
            seen_sectors.add(slug)
            terms = _SECTOR_FACETS.get(slug)
            if terms:
                facets.append((f"sector:{slug}", terms))
        if self.customer_type in {"b2c", "both"}:
            facets.append(
                (
                    "consumer",
                    "Consumer protection duties of a trader selling to consumers: unfair "
                    "commercial practices, pre-contractual information, distance and "
                    "off-premises contracts, right of withdrawal, unfair contract terms, "
                    "price transparency, dark patterns, legal guarantees and remedies.",
                )
            )
        if self.monthly_eu_users:
            facets.append(
                (
                    "platform",
                    f"Online platform and intermediary service obligations at a scale of "
                    f"{self.monthly_eu_users} monthly active users in the EU: notice and "
                    "action, trusted flaggers, transparency reporting, recommender system "
                    "disclosure, advertising restrictions, very large online platform "
                    "designation thresholds and systemic risk assessment.",
                )
            )
        # Non-EU markets bring their own national implementing law, which the
        # blob query never surfaces: it is out-competed by EU-level text every
        # time, since the corpus is EU-heavy and the profile reads EU-generic.
        national = [m.value for m in self.markets if m != Jurisdiction.EU]
        if national:
            facets.append(
                (
                    "national",
                    "National implementing and supervisory rules in "
                    + ", ".join(national)
                    + " : the competent supervisory authority, national enforcement "
                    "powers and sanctions, national derogations and additional "
                    "requirements beyond the EU baseline.",
                )
            )
        return facets


# Loose sector labels -> the seed slug they mean. The website only ever sends
# real slugs (its chips are built from the seeded Sector table), but the
# profile field is a plain list[str] and other callers do pass free text —
# brief_eval/panel.py's fixture profiles use "software", "iot", "ai". Without
# normalization those silently contribute no sector facet, which reads as "the
# sector facet doesn't work" rather than "that label isn't a slug".
_SECTOR_ALIASES: dict[str, str] = {
    "software": "software-saas",
    "saas": "software-saas",
    "cloud": "software-saas",
    "iot": "manufacturing",
    "industrial": "manufacturing",
    "finance": "fintech",
    "financial-services": "fintech",
    "banking": "fintech",
    "insurance": "fintech",
    "retail": "ecommerce",
    "e-commerce": "ecommerce",
    "marketplace": "ecommerce",
    "health": "healthtech",
    "healthcare": "healthtech",
    "medtech": "healthtech",
    "advertising": "adtech",
    "media": "adtech",
    "telecoms": "telecom",
    "telecommunications": "telecom",
    "automotive": "mobility",
    "transport": "mobility",
    "utilities": "energy",
}

# Sector slug -> the obligation vocabulary that sector actually turns on. Keys
# match data/seeds.py's SECTORS; an unmapped sector simply contributes no
# facet of its own (it still shapes the profile query), so adding a sector to
# the seeds never breaks retrieval — it just doesn't sharpen it until mapped.
# "ai" and "logistics" are deliberately absent from the aliases above: AI is
# already its own facet via uses_ai, and logistics has no distinct EU
# tech-policy instrument set worth a dedicated query.
_SECTOR_FACETS: dict[str, str] = {
    "software-saas": (
        "Software and cloud service provider duties: cybersecurity risk management and "
        "incident reporting, products with digital elements and vulnerability handling, "
        "software liability and defectiveness, contractual data access and switching "
        "between cloud providers, interoperability."
    ),
    "fintech": (
        "Financial services obligations: ICT risk management and digital operational "
        "resilience, third-party ICT provider oversight, incident reporting to financial "
        "supervisors, payment services authorisation and strong customer authentication, "
        "creditworthiness assessment and consumer credit, anti-money-laundering and "
        "customer due diligence, open finance and financial data access."
    ),
    "ecommerce": (
        "Online sales and marketplace obligations: trader identification and traceability, "
        "product safety and market surveillance for online offers, geo-blocking, "
        "platform-to-business fairness and ranking transparency, distance selling, "
        "product compliance of imported goods."
    ),
    "healthtech": (
        "Health technology obligations: medical device classification and conformity "
        "assessment, clinical evaluation and post-market surveillance, health data "
        "processing and secondary use, electronic health records interoperability, "
        "software as a medical device."
    ),
    "adtech": (
        "Advertising and media obligations: online advertising transparency and "
        "repositories, political advertising labelling and targeting restrictions, "
        "profiling-based advertising limits, cookies and terminal equipment access, "
        "direct marketing consent, media pluralism and audiovisual commercial "
        "communications."
    ),
    "manufacturing": (
        "Manufacturer obligations for products and connected devices: machinery and "
        "product safety essential requirements, CE marking and conformity assessment, "
        "cybersecurity requirements for products with digital elements, radio equipment, "
        "product liability for defective products and software, ecodesign and digital "
        "product passport."
    ),
    "telecom": (
        "Electronic communications obligations: authorisation and general conditions, "
        "end-user rights, confidentiality of communications and traffic data, security "
        "of networks and services and incident notification, lawful interception and "
        "data retention, spectrum and access regulation, gigabit infrastructure."
    ),
    "public-sector": (
        "Public sector and public procurement obligations: web and mobile accessibility, "
        "open data and high-value datasets, re-use of public sector information, public "
        "procurement of AI and ICT, interoperable digital public services, processing by "
        "public authorities."
    ),
    "mobility": (
        "Mobility and automotive obligations: vehicle type approval and general safety, "
        "automated and connected driving, in-vehicle data access, cybersecurity and "
        "software update management for vehicles, driver monitoring and telematics data, "
        "intelligent transport systems."
    ),
    "energy": (
        "Energy and utilities obligations: critical entity resilience and essential "
        "service continuity, network and information security for energy operators, smart "
        "metering and consumer energy data access, grid interoperability, energy "
        "efficiency reporting for data centres, sustainability reporting."
    ),
}
