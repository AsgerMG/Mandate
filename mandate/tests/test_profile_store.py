"""mandate/db/profiles.sql + mandate/profile/store.py, on the production layout.

A profile is versioned, never overwritten: an edit is a new version, a stale
writer is refused, and no brain role (nor the owner) can rewrite or delete one.
"""
from __future__ import annotations

import psycopg
import pytest

from mandate.profile import ProfileError
from mandate.profile.store import (
    VersionConflict, append_version, create_account, create_profile, create_workspace,
    current, history,
)


@pytest.fixture
def site(mdb):
    """capital_app: the role the site (and so the conversational product) runs as."""
    with psycopg.connect(mdb.url("capital_app"), autocommit=True) as c:
        yield c


def test_a_profile_is_versioned_and_never_overwritten(site, mdb):
    acct = create_account(site, "founder@acme.eu")
    ws = create_workspace(site, "Acme", acct)
    pid, v1 = create_profile(site, ws, {"name": "Acme", "fteBand": "10-49"},
                             source="founder", author=acct)
    assert v1 == 1
    v2 = append_version(site, pid, {"name": "Acme", "fteBand": "10-49", "balanceBand": "2-10M"},
                        source="wincent", expected=v1)
    assert current(site, pid)["payload"]["balanceBand"] == "2-10M"
    assert [h["version"] for h in history(site, pid)] == [1, 2]
    assert history(site, pid)[0]["payload"] == {"name": "Acme", "fteBand": "10-49"}

    # a writer who read version 1 cannot overwrite version 2
    with pytest.raises(VersionConflict):
        append_version(site, pid, {"name": "Acme"}, source="founder", expected=v1)
    # nor skip ahead
    with pytest.raises(VersionConflict):
        append_version(site, pid, {"name": "Acme"}, source="founder", expected=v2 + 3)

    # policy's agent appends too, and reads what capital's wrote
    with psycopg.connect(mdb.url("policy_app"), autocommit=True) as pol:
        append_version(pol, pid, {"name": "Acme", "usesAi": True}, source="regina", expected=v2)
        assert current(pol, pid)["version"] == 3

    for role in ("capital_app", "policy_app"):
        with psycopg.connect(mdb.url(role), autocommit=True) as c:
            for sql in ("UPDATE mandate.company_profile_versions SET note = 'x'",
                        "DELETE FROM mandate.company_profile_versions"):
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    c.execute(sql)
    # and the trigger stops even the owner
    with psycopg.connect(mdb.admin_url, autocommit=True) as admin:
        admin.execute("SET ROLE mandate_app")
        with pytest.raises(psycopg.errors.RaiseException):
            admin.execute("DELETE FROM mandate.company_profile_versions")


def test_only_vocabulary_values_are_stored(site):
    acct = create_account(site, "other@acme.eu")
    ws = create_workspace(site, "Other", acct)
    with pytest.raises(ProfileError):
        create_profile(site, ws, {"name": "X", "company_size": "small"}, source="founder")
    n = site.execute("SELECT count(*) FROM mandate.company_profiles WHERE workspace_id = %s",
                     (ws,)).fetchone()[0]
    assert n == 0  # refused before the anchor was created


def test_capital_ro_reads_no_founder_data(mdb):
    with psycopg.connect(mdb.url("capital_ro"), autocommit=True) as c:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("SELECT * FROM mandate.company_profile_versions")
