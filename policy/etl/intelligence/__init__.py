"""Intelligence layer: company profile → scoping questions → retrieval →
grounded, cited report.

Sits between the data layer and the website, per the methodology.
"""

from .briefing import build_documents, build_request, generate_briefing, parse_response
from .profile import CompanyProfile
from .questions import core_questions, generate_questions

__all__ = [
    "CompanyProfile",
    "generate_briefing",
    "generate_questions",
    "core_questions",
    "build_documents",
    "build_request",
    "parse_response",
]
