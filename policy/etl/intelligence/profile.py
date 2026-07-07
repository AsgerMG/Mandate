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
