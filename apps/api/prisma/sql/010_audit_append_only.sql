-- AIM Command Center: make the audit log append-only at the database.
--
-- Run after every `prisma migrate deploy`, because a migration that recreates
-- the table drops its triggers with it. `npm run db:harden` does this, and the
-- API refuses to start in production if the guarantee is missing (see
-- AuditService.verifyAppendOnly).
--
-- Three layers, because any one of them can be undone by someone who can undo
-- exactly that one:
--   1. Triggers that raise on UPDATE and on DELETE.
--   2. Revoked table privileges for the application role.
--   3. A hash chain, so a row removed with superuser rights still shows.

BEGIN;

-- 1. Triggers ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_events_refuse_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_events is append-only: UPDATE refused on event %', OLD.id
    USING ERRCODE = '42501',
          HINT = 'Record a correcting event instead. History is not editable.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit_events_refuse_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_events is append-only: DELETE refused on event %', OLD.id
    USING ERRCODE = '42501',
          HINT = 'Retention is handled by archival, not by deletion.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_refuse_update();

DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events;
CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_refuse_delete();

-- TRUNCATE bypasses row triggers entirely, so it gets a statement trigger.
CREATE OR REPLACE FUNCTION audit_events_refuse_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: TRUNCATE refused'
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events;
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_refuse_truncate();

-- 2. Privileges -------------------------------------------------------------
-- The application role may insert and read. Nothing else.

REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;

DO $$
DECLARE
  app_role text := current_user;
BEGIN
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM %I', app_role);
  EXECUTE format('GRANT INSERT, SELECT ON audit_events TO %I', app_role);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not adjust privileges for %; triggers still apply.', app_role;
END;
$$;

-- 3. Chain integrity --------------------------------------------------------
-- A hash must be present and a non-first row must name its predecessor.

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_hash_present;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_hash_present CHECK (length(hash) = 64);

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_actor_present;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_actor_present CHECK (length("actorId") > 0);

COMMIT;
