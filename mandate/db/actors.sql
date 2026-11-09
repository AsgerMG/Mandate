-- mandate.actor_*: the register of who a founder engages. Institutions and their
-- units, public-role people, coalitions and trade associations, media outlets
-- and the beats journalists publicly cover, the contact points those bodies
-- PUBLISH, and the email formats organisations visibly use.
--
--   psql "$ADMIN_URL" -f mandate/db/actors.sql      (after roles.sql and grounding.sql; idempotent)
--
-- NOT YET APPLIED IN PRODUCTION. Written by mandate-api (mandate/api/actors.py)
-- as mandate_app, populated by the agents' research and by targeted seeding.
--
-- ── THE PERSONAL-DATA LINE (owner, 9 Nov 2026) ──────────────────────────────
-- 1. Public professional roles only. A person is in the register because of a
--    role they hold in public (an MEP, a head of unit, a journalist on a beat),
--    never as a private individual.
-- 2. A contact detail is stored only where the person or their organisation
--    PUBLISHES it for that role: a masthead email, a press office, an
--    institutional address. The DB enforces the mechanical half: a contact
--    point's value must appear verbatim in the cited quote (CHECK below), so a
--    value nobody published cannot be stored with a citation that says it was.
-- 3. Every entry cites where it was published (a grounding citation: sha256 of
--    the fetched bytes, the canonical URL, the span and its quote) and carries
--    a last-verified date (actor_verifications, newest row).
-- 4. Dropped when no longer published, and on request. That is the ONE
--    deletion this schema allows, and only for personal data (people, roles,
--    contact points), only through the erasure path, which records THAT an
--    erasure happened (actor_erasures) and never what was erased.
-- 5. Organisation email FORMATS are facts about the organisation, derived from
--    addresses it publishes itself and cited to them; confidence follows how
--    many published examples agree. A guessed personal address derived from a
--    format is ADVICE shown to the founder in that conversation, never stored
--    here and never presented as a verified contact. There is deliberately no
--    table for one.
--
-- Basis: legitimate interest; publicly available information only.
--
-- CITATION SHAPE (jsonb): {"sha256", "canonical_url", "span": [start, end],
-- "quote", "fetched_at"} as mandate/grounding.cite returns it. The API resolves
-- it against grounding before inserting; the CHECK is the floor.

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE mandate_app;

CREATE OR REPLACE FUNCTION mandate.is_citation(c jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(c) = 'object'
     AND coalesce(c->>'sha256', '') ~ '^[0-9a-f]{64}$'
     AND coalesce(length(c->>'canonical_url'), 0) > 0
     AND coalesce(length(btrim(c->>'quote')), 0) > 0
$$;

-- Institutions, units, companies, coalitions, trade associations, media outlets.
CREATE TABLE IF NOT EXISTS mandate.actor_organisations (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL CHECK (length(btrim(name)) > 0),
    kind          text NOT NULL CHECK (kind IN (
                    'eu_institution', 'national_authority', 'regulator', 'agency',
                    'development_bank', 'promotional_bank', 'parliament', 'committee',
                    'political_group', 'coalition', 'trade_association', 'ecosystem_body',
                    'media_outlet', 'company', 'ngo', 'other')),
    -- ISO2, or 'EU' for a European body
    jurisdiction  text CHECK (jurisdiction IS NULL OR jurisdiction ~ '^([A-Z]{2}|EU)$'),
    parent_id     uuid REFERENCES mandate.actor_organisations(id),
    website       text,
    description   text NOT NULL DEFAULT '',
    citation      jsonb NOT NULL CHECK (mandate.is_citation(citation)),
    created_by    text NOT NULL CHECK (created_by IN ('mandate', 'wincent', 'regina', 'seed')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    db_role       text NOT NULL DEFAULT current_user
);
CREATE UNIQUE INDEX IF NOT EXISTS actor_organisations_name_idx
  ON mandate.actor_organisations (lower(name), coalesce(jurisdiction, ''));
CREATE INDEX IF NOT EXISTS actor_organisations_kind_idx ON mandate.actor_organisations (kind, jurisdiction);

-- What an organisation works on: a coalition's cause, an outlet's coverage, an
-- authority's remit. Free-text topics, matched by the register's search.
CREATE TABLE IF NOT EXISTS mandate.actor_topics (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id  uuid NOT NULL REFERENCES mandate.actor_organisations(id),
    topic            text NOT NULL CHECK (length(btrim(topic)) > 0),
    citation         jsonb NOT NULL CHECK (mandate.is_citation(citation)),
    created_by       text NOT NULL CHECK (created_by IN ('mandate', 'wincent', 'regina', 'seed')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, topic)
);

-- An organisation that is a member of a coalition or association.
CREATE TABLE IF NOT EXISTS mandate.actor_memberships (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id        uuid NOT NULL REFERENCES mandate.actor_organisations(id),
    coalition_id     uuid NOT NULL REFERENCES mandate.actor_organisations(id),
    citation         jsonb NOT NULL CHECK (mandate.is_citation(citation)),
    created_by       text NOT NULL CHECK (created_by IN ('mandate', 'wincent', 'regina', 'seed')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (member_id, coalition_id),
    CHECK (member_id <> coalition_id)
);

-- A person, ONLY as the holder of a public professional role (see actor_roles).
-- No contact details here: those are contact points, and need their own citation.
CREATE TABLE IF NOT EXISTS mandate.actor_people (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL CHECK (length(btrim(name)) > 0),
    created_by    text NOT NULL CHECK (created_by IN ('mandate', 'wincent', 'regina', 'seed')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    db_role       text NOT NULL DEFAULT current_user
);

-- The public role that is the ONLY reason a person is in the register.
CREATE TABLE IF NOT EXISTS mandate.actor_roles (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id        uuid NOT NULL REFERENCES mandate.actor_people(id),
    organisation_id  uuid NOT NULL REFERENCES mandate.actor_organisations(id),
    title            text NOT NULL CHECK (length(btrim(title)) > 0),
    -- a journalist's beat, an official's portfolio, a rapporteur's file
    beat             text NOT NULL DEFAULT '',
    citation         jsonb NOT NULL CHECK (mandate.is_citation(citation)),
    created_by       text NOT NULL CHECK (created_by IN ('mandate', 'wincent', 'regina', 'seed')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    db_role          text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS actor_roles_org_idx ON mandate.actor_roles (organisation_id);
CREATE INDEX IF NOT EXISTS actor_roles_person_idx ON mandate.actor_roles (person_id);

-- A contact detail AS PUBLISHED. Attached to an organisation (a press office, a
-- switchboard, a desk) or to a role (a masthead email the outlet prints for its
-- correspondent). `value` must appear in the cited quote: what was not
-- published cannot be stored as if it were.
CREATE TABLE IF NOT EXISTS mandate.actor_contact_points (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id  uuid REFERENCES mandate.actor_organisations(id),
    role_id          uuid REFERENCES mandate.actor_roles(id),
    kind             text NOT NULL CHECK (kind IN (
                       'press_office', 'desk', 'switchboard', 'institutional_email',
                       'masthead_email', 'contact_form', 'phone', 'postal')),
    channel          text NOT NULL CHECK (channel IN ('email', 'phone', 'url', 'postal')),
    value            text NOT NULL CHECK (length(btrim(value)) > 0),
    citation         jsonb NOT NULL CHECK (mandate.is_citation(citation)),
    created_by       text NOT NULL CHECK (created_by IN ('mandate', 'wincent', 'regina', 'seed')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    db_role          text NOT NULL DEFAULT current_user,
    CHECK ((organisation_id IS NULL) <> (role_id IS NULL)),
    -- PUBLISHED, mechanically: the value is in the quote it is cited to
    CHECK (position(lower(btrim(value)) IN lower(citation->>'quote')) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS actor_contact_points_value_idx
  ON mandate.actor_contact_points (coalesce(organisation_id, role_id), lower(value));

-- The address format an organisation visibly uses, as a FACT about it:
-- `pattern` over the placeholders {first} {last} {f} {l}, e.g.
-- '{first}.{last}@bmwk.bund.de'. `examples` are the published addresses it was
-- derived from (each also inside one of the citations' quotes); confidence is
-- derived from how many agree, never asserted.
CREATE TABLE IF NOT EXISTS mandate.actor_email_formats (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id  uuid NOT NULL REFERENCES mandate.actor_organisations(id),
    domain           text NOT NULL CHECK (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
    pattern          text NOT NULL CHECK (pattern ~ '\{(first|last|f|l)\}' AND pattern LIKE '%@%'),
    examples         jsonb NOT NULL CHECK (jsonb_typeof(examples) = 'array' AND jsonb_array_length(examples) >= 1),
    citations        jsonb NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    -- examples_agreeing / examples_seen, computed by the API (mandate/api/actors.py)
    examples_agreeing integer NOT NULL CHECK (examples_agreeing >= 1),
    examples_seen     integer NOT NULL CHECK (examples_seen >= examples_agreeing),
    confidence       text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
    created_by       text NOT NULL CHECK (created_by IN ('mandate', 'wincent', 'regina', 'seed')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    db_role          text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS actor_email_formats_org_idx ON mandate.actor_email_formats (organisation_id);

-- "Still published": each re-check of an entry's source, newest = last_verified.
CREATE TABLE IF NOT EXISTS mandate.actor_verifications (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity        text NOT NULL CHECK (entity IN ('organisation', 'role', 'contact_point', 'email_format')),
    entity_id     uuid NOT NULL,
    still_published boolean NOT NULL,
    citation      jsonb CHECK (citation IS NULL OR mandate.is_citation(citation)),
    verified_at   timestamptz NOT NULL DEFAULT now(),
    created_by    text NOT NULL CHECK (created_by IN ('mandate', 'wincent', 'regina', 'seed', 'refresh')),
    CHECK (still_published = false OR citation IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS actor_verifications_entity_idx ON mandate.actor_verifications (entity, entity_id, verified_at DESC);

-- THAT an erasure happened, never what was erased: no name, no value.
CREATE TABLE IF NOT EXISTS mandate.actor_erasures (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity        text NOT NULL CHECK (entity IN ('person', 'role', 'contact_point')),
    entity_id     uuid NOT NULL,
    reason        text NOT NULL CHECK (reason IN ('on_request', 'no_longer_published')),
    erased_at     timestamptz NOT NULL DEFAULT now(),
    db_role       text NOT NULL DEFAULT current_user
);

-- ── Append-only, except the personal-data erasure path ────────────────────
-- No row is ever rewritten. Organisations, topics, memberships, formats,
-- verifications and the erasure log are never deleted either. People, roles
-- and contact points may be DELETED, and only inside a transaction that set
-- `mandate.erasure = 'on'` (mandate/api/actors.py erase()), which also writes
-- the actor_erasures row.
CREATE OR REPLACE FUNCTION mandate.actors_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND TG_TABLE_NAME IN ('actor_people', 'actor_roles', 'actor_contact_points')
     AND current_setting('mandate.erasure', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only: % refused (personal data is erased only through the erasure path)',
    TG_TABLE_NAME, TG_OP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['actor_organisations','actor_topics','actor_memberships','actor_people',
                           'actor_roles','actor_contact_points','actor_email_formats',
                           'actor_verifications','actor_erasures'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON mandate.%I', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON mandate.%I '
                   'FOR EACH ROW EXECUTE FUNCTION mandate.actors_append_only()', t || '_append_only', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON mandate.%I', t || '_no_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON mandate.%I '
                   'FOR EACH STATEMENT EXECUTE FUNCTION mandate.actors_append_only()', t || '_no_truncate', t);
  END LOOP;
END $$;

-- The register as an agent reads it: one row per organisation, with its
-- topics and its last verification.
CREATE OR REPLACE VIEW mandate.actor_organisations_current AS
  SELECT o.*,
         coalesce((SELECT array_agg(t.topic ORDER BY t.topic) FROM mandate.actor_topics t
                    WHERE t.organisation_id = o.id), '{}') AS topics,
         (SELECT max(v.verified_at) FROM mandate.actor_verifications v
           WHERE v.entity = 'organisation' AND v.entity_id = o.id AND v.still_published) AS last_verified
    FROM mandate.actor_organisations o
   WHERE NOT EXISTS (SELECT 1 FROM mandate.actor_verifications v
                      WHERE v.entity = 'organisation' AND v.entity_id = o.id
                        AND v.verified_at = (SELECT max(w.verified_at) FROM mandate.actor_verifications w
                                              WHERE w.entity = 'organisation' AND w.entity_id = o.id)
                        AND NOT v.still_published);

RESET ROLE;

REVOKE UPDATE, DELETE, TRUNCATE ON mandate.actor_organisations, mandate.actor_topics,
  mandate.actor_memberships, mandate.actor_people, mandate.actor_roles,
  mandate.actor_contact_points, mandate.actor_email_formats, mandate.actor_verifications,
  mandate.actor_erasures FROM capital_app, policy_app, capital_ro;

COMMIT;
