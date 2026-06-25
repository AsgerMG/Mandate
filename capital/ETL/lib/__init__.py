"""Shared library for EuroInvTracker scrapers and loaders.

Modules:
    satr_filters       — frozen equity-instrument and R&D-objective bid lists
    satr_country_map   — ISO2 ↔ SATR bid mapping for the 26 EC-portal countries
    satr_session       — Playwright session bootstrap; yields cookies + CSRFTOKEN
                         that can be reused by `requests` for fast pagination
"""
