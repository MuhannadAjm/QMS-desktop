-- One-time bootstrap: promote the first License Admin.
--
-- The intended process (README_LICENSE_SERVER step 9) is: the owner creates a
-- confirmed Supabase Auth user in the Dashboard, then that user is granted a row
-- in public.license_admin_profiles. This migration performs only the second half.
-- It creates no users and handles no passwords.
--
-- Target: qms.systems.admin@gmail.com
--
-- Safety properties:
--   * resolves the email to EXACTLY ONE auth user, aborting on 0 or >1
--   * idempotent — re-running is a no-op, never a duplicate
--   * asserts the final row id equals the auth user's UUID and role = 'admin'
--     ('admin' is the privileged value in the license_admin_profiles CHECK
--      constraint; 'viewer' is the read-only alternative)

DO $$
DECLARE
    target_email  constant text := 'qms.systems.admin@gmail.com';
    match_count   integer;
    auth_uid      uuid;
    already       boolean;
    final_uid     uuid;
    final_role    text;
BEGIN
    SELECT count(*) INTO match_count
    FROM auth.users
    WHERE lower(email) = lower(target_email);

    IF match_count = 0 THEN
        RAISE EXCEPTION 'No auth user found for %. Create the user in Dashboard > Authentication > Users first.', target_email;
    ELSIF match_count > 1 THEN
        RAISE EXCEPTION 'Ambiguous: % auth users match %. Refusing to guess which to promote.', match_count, target_email;
    END IF;

    SELECT id INTO auth_uid
    FROM auth.users
    WHERE lower(email) = lower(target_email);

    RAISE NOTICE 'Resolved % to exactly 1 auth user (uuid %).', target_email, auth_uid;

    SELECT EXISTS (SELECT 1 FROM public.license_admin_profiles WHERE id = auth_uid) INTO already;
    RAISE NOTICE 'Existing license_admin_profiles row for that uuid: %', already;

    INSERT INTO public.license_admin_profiles (id, role)
    VALUES (auth_uid, 'admin')
    ON CONFLICT (id) DO UPDATE SET role = 'admin';

    -- Independent verification of the end state
    SELECT id, role INTO final_uid, final_role
    FROM public.license_admin_profiles
    WHERE id = auth_uid;

    IF final_uid IS NULL THEN
        RAISE EXCEPTION 'VERIFY FAILED: no license_admin_profiles row after insert.';
    END IF;
    IF final_uid <> auth_uid THEN
        RAISE EXCEPTION 'VERIFY FAILED: profile id % does not match auth uuid %.', final_uid, auth_uid;
    END IF;
    IF final_role <> 'admin' THEN
        RAISE EXCEPTION 'VERIFY FAILED: role is %, expected admin.', final_role;
    END IF;

    SELECT count(*) INTO match_count FROM public.license_admin_profiles;

    RAISE NOTICE 'VERIFIED: profile id matches auth uuid, role = %. Total admin profiles now: %.', final_role, match_count;
END $$;
