-- Grant the one privilege license revocation requires: UPDATE on license_keys.
--
-- WHY THIS IS NEEDED
--   admin-revoke-license is the first Edge Function that changes a LICENCE's
--   lifecycle state. Every earlier function only ever inserted a licence
--   (admin-generate-license) or read one (activate / validate / list), so
--   migration 20260820170000 granted service_role exactly:
--
--       license_keys  ->  SELECT, INSERT
--
--   PostgreSQL checks table privileges BEFORE it evaluates RLS, so without this
--   grant the revoke UPDATE is rejected at the privilege layer and the function
--   returns a "permission denied for table license_keys" 500 — the same failure
--   class documented at length in 20260820170000, where the symptom looked like
--   an auth problem and was not.
--
-- SCOPE
--   UPDATE on license_keys, to service_role, and nothing else.
--
--   Table-level rather than column-level GRANT UPDATE (status), deliberately:
--   license_activations already carries a table-level UPDATE grant for exactly
--   the same reason (admin-deactivate-device), and matching the established
--   precedent is worth more here than a finer grant that no other table uses.
--   The practical surface is identical — admin-revoke-license is the only writer
--   and it sets `status` alone.
--
--   Still NOT granted to anyone: DELETE. Revocation is a state transition, not a
--   deletion; licence, activation and event history are preserved in full.
--   `authenticated` (the License Admin browser role) gains nothing — it remains
--   SELECT-only, so the Revoke action in the UI cannot write to the table
--   directly and must go through the Edge Function.

GRANT UPDATE ON TABLE public.license_keys TO service_role;

-- ── Assert the end state, so a wrong result fails the migration ───────────────
DO $$
DECLARE
    bad text;
    n   integer;
BEGIN
    -- 1. The grant this migration exists to make
    SELECT count(*) INTO n
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a
      JOIN pg_roles r ON r.oid = a.grantee
     WHERE ns.nspname = 'public' AND c.relname = 'license_keys'
       AND r.rolname = 'service_role' AND a.privilege_type = 'UPDATE';
    IF n = 0 THEN
        RAISE EXCEPTION 'service_role still lacks UPDATE on license_keys';
    END IF;

    -- 2. DELETE remains granted to no APPLICATION role
    --    (revocation is a state transition; it never deletes history)
    --
    --    The grantee filter is not optional. Any GRANT or REVOKE materialises a
    --    table's relacl, and a materialised relacl always carries the owner's
    --    own acldefault entry — which includes DELETE. Without the rolname
    --    restriction this check matches `postgres` on all five tables and
    --    aborts the migration, taking the GRANT above with it. 20260820190000
    --    check #6 is the same query and scopes it for exactly this reason.
    SELECT string_agg(format('%s:%s', c.relname, r.rolname), ', ') INTO bad
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a
      JOIN pg_roles r ON r.oid = a.grantee
     WHERE ns.nspname = 'public' AND c.relname LIKE 'license%'
       AND r.rolname IN ('anon', 'authenticated', 'service_role')
       AND a.privilege_type = 'DELETE';
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'DELETE granted on licensing tables: %', bad;
    END IF;

    -- 3. anon still holds nothing
    SELECT string_agg(format('%s:%s', c.relname, a.privilege_type), ', ') INTO bad
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a
      JOIN pg_roles r ON r.oid = a.grantee
     WHERE ns.nspname = 'public' AND c.relname LIKE 'license%' AND r.rolname = 'anon';
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'anon holds privileges: %', bad;
    END IF;

    -- 4. authenticated is still read-only — the browser cannot revoke directly
    SELECT string_agg(format('%s:%s', c.relname, a.privilege_type), ', ') INTO bad
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a
      JOIN pg_roles r ON r.oid = a.grantee
     WHERE ns.nspname = 'public' AND c.relname LIKE 'license%'
       AND r.rolname = 'authenticated' AND a.privilege_type <> 'SELECT';
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'authenticated holds non-SELECT privileges: %', bad;
    END IF;

    -- 5. RLS still on everywhere
    SELECT string_agg(c.relname, ', ') INTO bad
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'license%'
       AND c.relrowsecurity IS NOT TRUE;
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'RLS is not enabled on: %', bad;
    END IF;

    RAISE NOTICE 'Revocation grant verified: service_role may UPDATE license_keys; no DELETE anywhere; anon=none; authenticated=SELECT only; RLS enabled.';
END $$;
