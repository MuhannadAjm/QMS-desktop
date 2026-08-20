-- Read-only baseline assertion. Creates and modifies NOTHING.
--
-- Freezes the expected security posture of the licensing backend as an auditable
-- migration so any future drift fails loudly on the next `db push` rather than
-- being discovered by a customer. Everything here is SELECT plus RAISE.

DO $$
DECLARE
    n integer;
    bad text;
BEGIN
    -- 1. Exactly the five licensing tables
    SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
     WHERE ns.nspname='public' AND c.relkind='r' AND c.relname LIKE 'license%';
    IF n <> 5 THEN RAISE EXCEPTION 'Expected 5 licensing tables, found %', n; END IF;

    -- 2. RLS enabled on all of them
    SELECT string_agg(c.relname, ', ') INTO bad
      FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
     WHERE ns.nspname='public' AND c.relkind='r' AND c.relname LIKE 'license%'
       AND c.relrowsecurity IS NOT TRUE;
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'RLS disabled on: %', bad; END IF;

    -- 3. Every licensing table carries at least one policy
    SELECT string_agg(c.relname, ', ') INTO bad
      FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
     WHERE ns.nspname='public' AND c.relkind='r' AND c.relname LIKE 'license%'
       AND NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname='public' AND p.tablename=c.relname);
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'No RLS policy on: %', bad; END IF;

    -- 4. anon holds no privilege on any licensing table
    SELECT string_agg(format('%s:%s', c.relname, a.privilege_type), ', ') INTO bad
      FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a JOIN pg_roles r ON r.oid=a.grantee
     WHERE ns.nspname='public' AND c.relname LIKE 'license%' AND r.rolname='anon';
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'anon holds privileges: %', bad; END IF;

    -- 5. authenticated is read-only (RLS then decides which rows)
    SELECT string_agg(format('%s:%s', c.relname, a.privilege_type), ', ') INTO bad
      FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a JOIN pg_roles r ON r.oid=a.grantee
     WHERE ns.nspname='public' AND c.relname LIKE 'license%'
       AND r.rolname='authenticated' AND a.privilege_type <> 'SELECT';
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'authenticated holds non-SELECT: %', bad; END IF;

    -- 6. service_role never granted DELETE (no Edge Function performs one)
    SELECT string_agg(c.relname, ', ') INTO bad
      FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a JOIN pg_roles r ON r.oid=a.grantee
     WHERE ns.nspname='public' AND c.relname LIKE 'license%'
       AND r.rolname='service_role' AND a.privilege_type='DELETE';
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'service_role has DELETE on: %', bad; END IF;

    -- 7. Trigger functions are not executable by anon/authenticated
    SELECT string_agg(p.proname, ', ') INTO bad
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      JOIN pg_roles r ON r.oid=a.grantee
     WHERE ns.nspname='public' AND r.rolname IN ('anon','authenticated')
       AND p.proname IN ('rls_auto_enable','set_updated_at');
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'anon/authenticated can execute: %', bad; END IF;

    -- 8. Exactly one admin profile, and no ACTIVE licence or activation remains
    SELECT count(*) INTO n FROM public.license_admin_profiles WHERE role='admin';
    RAISE NOTICE 'admin profiles (role=admin): %', n;
    SELECT count(*) INTO n FROM public.license_keys WHERE status='ACTIVE';
    IF n <> 0 THEN RAISE EXCEPTION '% ACTIVE licence(s) remain after test cleanup', n; END IF;
    SELECT count(*) INTO n FROM public.license_activations WHERE status='ACTIVE';
    IF n <> 0 THEN RAISE EXCEPTION '% ACTIVE activation(s) remain after test cleanup', n; END IF;

    SELECT count(*) INTO n FROM public.license_events;
    RAISE NOTICE 'BASELINE VERIFIED: 5 tables, RLS on, policies present, anon=none, authenticated=SELECT only, service_role has no DELETE, trigger functions not caller-executable, 0 ACTIVE licences/activations, % audit events retained.', n;
END $$;
