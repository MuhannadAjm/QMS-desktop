-- Fix: "permission denied for table license_customers / license_keys" in License Admin
--
-- ROOT CAUSE
--   PostgreSQL checks TABLE privileges BEFORE it evaluates RLS policies. The
--   licensing tables had RLS enabled and correct admin policies, but no role had
--   been granted SELECT, so every request was rejected at the privilege layer and
--   the policies never ran. The symptom looked like an RLS/auth problem; it was not.
--
--   The tables inherited their ACL from a default-privilege entry granted by
--   `postgres` for schema public:
--       anon=Dxtm  authenticated=Dxtm  service_role=Dxtm
--   i.e. TRUNCATE (D), REFERENCES (x), TRIGGER (t), MAINTAIN (m) — and none of
--   SELECT/INSERT/UPDATE/DELETE. Those four are exactly the privileges nothing
--   here needs, while the ones everything needs were absent.
--
--   This also silently broke the SERVICE ROLE path. The Edge Functions talk to
--   PostgREST as `service_role`, so their reads and writes were unprivileged too.
--   activate-license masked it: it folds a query error and a genuine miss into the
--   same `403 Invalid license key`, so a permission error was indistinguishable
--   from an unknown key.
--
-- PRIVILEGE MODEL (derived from source, not assumed)
--   License Admin (browser, role `authenticated`) performs SELECT only:
--     license_customers    Customers.tsx, GenerateLicense.tsx
--     license_keys         Licenses.tsx, LicenseDetail.tsx
--     license_activations  LicenseDetail.tsx, joined in Licenses.tsx
--     license_events       Events.tsx
--   It performs NO direct INSERT/UPDATE/DELETE anywhere. All privileged writes go
--   through admin-generate-license / admin-deactivate-device, which is preserved.
--
--   `authenticated` additionally needs SELECT on license_admin_profiles, because
--   every data-table policy evaluates
--       EXISTS (SELECT 1 FROM license_admin_profiles WHERE id = auth.uid())
--   as the calling role. Without that privilege the subquery errors and even a
--   real admin is denied. The `own_profile` policy still restricts each user to
--   their own row, so this grants no visibility into other admins.
--
--   Edge Functions (role `service_role`) need exactly:
--     license_customers    SELECT, INSERT          (admin-generate-license)
--     license_keys         SELECT, INSERT          (activate/validate/generate/list)
--     license_activations  SELECT, INSERT, UPDATE  (activate/validate/deactivate/list)
--     license_events       SELECT, INSERT          (audit trail)
--     license_admin_profiles SELECT                (requireAdmin)
--   No function performs DELETE, so DELETE is granted to no one.
--
--   `anon` gets nothing. Unauthenticated activation reaches the database only via
--   activate-license / validate-license, which run as service_role.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   Does not disable RLS. Does not add USING (true) policies. Does not move any
--   write from an Edge Function into the browser. Does not grant ALL to anyone.

-- ── 1. Clear the inherited junk ACL ───────────────────────────────────────────
-- Removes TRUNCATE / REFERENCES / TRIGGER / MAINTAIN, which nothing requires.
REVOKE ALL ON TABLE
    public.license_customers,
    public.license_keys,
    public.license_activations,
    public.license_events,
    public.license_admin_profiles
FROM anon, authenticated, service_role;

-- ── 2. authenticated: read-only, still gated by RLS ───────────────────────────
GRANT SELECT ON TABLE
    public.license_customers,
    public.license_keys,
    public.license_activations,
    public.license_events,
    public.license_admin_profiles
TO authenticated;

-- ── 3. service_role: exactly the operations the Edge Functions perform ────────
GRANT SELECT, INSERT         ON TABLE public.license_customers      TO service_role;
GRANT SELECT, INSERT         ON TABLE public.license_keys           TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.license_activations    TO service_role;
GRANT SELECT, INSERT         ON TABLE public.license_events         TO service_role;
GRANT SELECT                 ON TABLE public.license_admin_profiles TO service_role;

-- ── 4. anon: nothing. Left with no privileges by step 1; asserted below. ──────

-- ── 5. Stop the junk default from re-applying to future tables ────────────────
-- Without this, the next table created in public is born with TRUNCATE/REFERENCES/
-- TRIGGER/MAINTAIN for anon and no SELECT for anyone — reproducing this bug.
-- Only the unnecessary privileges are revoked from the default; this does not
-- grant anything new, so it cannot widen access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated, service_role;

-- ── 6. Assert the end state, so a wrong result fails the migration ────────────
DO $$
DECLARE
    bad text;
BEGIN
    -- anon must hold no privilege at all on any licensing table
    SELECT string_agg(format('%s:%s', c.relname, a.privilege_type), ', ')
      INTO bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'public' AND c.relname LIKE 'license%' AND r.rolname = 'anon';
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'anon still holds privileges: %', bad;
    END IF;

    -- authenticated must hold SELECT and nothing else
    SELECT string_agg(format('%s:%s', c.relname, a.privilege_type), ', ')
      INTO bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'public' AND c.relname LIKE 'license%'
      AND r.rolname = 'authenticated' AND a.privilege_type <> 'SELECT';
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'authenticated holds non-SELECT privileges: %', bad;
    END IF;

    -- RLS must still be on everywhere
    SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'license%' AND c.relkind='r'
      AND c.relrowsecurity IS NOT TRUE;
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'RLS is not enabled on: %', bad;
    END IF;

    RAISE NOTICE 'Grants verified: anon=none, authenticated=SELECT only, RLS enabled on all licensing tables.';
END $$;
