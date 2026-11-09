"""Load an eval scenario (mandate/eval/scenarios/*.yaml) and turn its profile
hint into a profile the shared vocabulary accepts.

A scenario's `profile_hint` is written by the owner in plain words; the runner
needs a CompanyProfile. Fields the vocabulary accepts pass; anything else is
DROPPED and reported (never coerced), so a run says exactly what profile the
agent saw.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from mandate.profile import ProfileError, validate

SCENARIO_DIR = Path(__file__).resolve().parent / "scenarios"
REQUIRED = ("id", "founder_says", "must")


@dataclass
class Scenario:
    id: str
    founder_says: str
    must: list[str]
    must_not: list[str] = field(default_factory=list)
    job: str | None = None
    profile_hint: dict = field(default_factory=dict)
    founder_followup: str | None = None
    sha256: str = ""
    path: str = ""

    def checkpoints(self) -> list[dict]:
        """The rubric as checkpoints: every must, and every must_not (met = avoided)."""
        return ([{"id": f"must_{i + 1}", "kind": "must", "text": t} for i, t in enumerate(self.must)]
                + [{"id": f"must_not_{i + 1}", "kind": "must_not", "text": t} for i, t in enumerate(self.must_not)])


def load(path_or_id: str | Path) -> Scenario:
    p = Path(path_or_id)
    if not p.exists():
        p = SCENARIO_DIR / f"{path_or_id}.yaml"
    raw = p.read_bytes()
    data = yaml.safe_load(raw)
    missing = [k for k in REQUIRED if not data.get(k)]
    if missing:
        raise ValueError(f"{p.name}: missing {', '.join(missing)}")
    return Scenario(id=data["id"], founder_says=" ".join(str(data["founder_says"]).split()),
                    must=list(data["must"]), must_not=list(data.get("must_not") or []),
                    job=data.get("job"), profile_hint=dict(data.get("profile_hint") or {}),
                    founder_followup=(" ".join(str(data["founder_followup"]).split())
                                      if data.get("founder_followup") else None),
                    sha256=hashlib.sha256(raw).hexdigest(), path=str(p))


def all_scenarios() -> list[Scenario]:
    return [load(p) for p in sorted(SCENARIO_DIR.glob("*.yaml"))]


def profile_from_hint(s: Scenario) -> tuple[dict, list[str]]:
    """(profile, dropped): the hint's fields that the vocabulary accepts."""
    hint = {"name": f"{s.id} (eval)", **s.profile_hint}
    profile: dict = {}
    dropped: list[str] = []
    for k, v in hint.items():
        try:
            validate({"name": "x", **profile, k: v})
            profile[k] = v
        except ProfileError as e:
            dropped.append(f"{k}={v!r}: {e}")
    profile.setdefault("name", f"{s.id} (eval)")
    return validate(profile), dropped
