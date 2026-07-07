"""Anthropic client access. The key is read from ANTHROPIC_API_KEY by the SDK."""

from __future__ import annotations

import os


def has_api_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def get_client():
    """Return an Anthropic client, or raise a clear error if no key is set."""
    if not has_api_key():
        raise RuntimeError(
            "No ANTHROPIC_API_KEY set. Add it to your environment/.env to generate "
            "briefings. (Retrieval and `--dry-run` work without it.)"
        )
    import anthropic

    return anthropic.Anthropic()
