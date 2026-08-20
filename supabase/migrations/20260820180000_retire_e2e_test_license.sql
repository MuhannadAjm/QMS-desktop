-- Retire the controlled E2E test licence created during the licensing recovery.
--
-- WHY
--   A real production licence was generated to prove the delivery chain end to
--   end. Its raw key was subsequently exposed in a session transcript, and it was
--   issued against a real-sounding customer name rather than a disposable marker.
--   It must not survive as an accidental production artifact.
--
-- APPROACH
--   Uses the product's own lifecycle states rather than deleting rows:
--     activation -> DEACTIVATED (mirrors admin-deactivate-device)
--     licence    -> REVOKED     (rejected by activate-license, which requires ACTIVE)
--   Audit history in license_events is PRESERVED and extended, not erased. The
--   customer row is kept because license_keys.customer_id is ON DELETE RESTRICT
--   and the event trail references the licence.
--
--   Scoped to exact primary keys captured during the exercise, and aborts if the
--   database contains anything beyond those single test records.

DO $$
DECLARE
    test_license    constant uuid := '2808d856-7645-40ac-a887-f0a8254df416';
    test_activation constant uuid := '5b08b8bf-be28-4c99-a131-84e73c72170f';
    n_customers integer;
    n_keys      integer;
    n_acts      integer;
    n_events    integer;
    still_active integer;
BEGIN
    SELECT count(*) INTO n_customers FROM public.license_customers;
    SELECT count(*) INTO n_keys      FROM public.license_keys;
    SELECT count(*) INTO n_acts      FROM public.license_activations;
    SELECT count(*) INTO n_events    FROM public.license_events;
    RAISE NOTICE 'BEFORE: customers=% keys=% activations=% events=%', n_customers, n_keys, n_acts, n_events;

    -- Refuse to run if anything other than the single known test pair exists.
    IF n_keys <> 1 OR n_acts <> 1 THEN
        RAISE EXCEPTION 'Refusing to clean: expected exactly 1 licence and 1 activation, found % and %. Investigate before retrying.', n_keys, n_acts;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.license_keys WHERE id = test_license) THEN
        RAISE EXCEPTION 'Refusing to clean: expected test licence % not present.', test_license;
    END IF;

    -- 1. Deactivate the device activation (same end state as admin-deactivate-device)
    UPDATE public.license_activations
       SET status              = 'DEACTIVATED',
           deactivated_at      = now(),
           deactivation_reason = 'E2E recovery test record retired'
     WHERE id = test_activation AND status = 'ACTIVE';

    INSERT INTO public.license_events (license_id, activation_id, event_type, event_message, metadata)
    VALUES (test_license, test_activation, 'ADMIN_DEACTIVATED',
            'E2E recovery test activation deactivated during baseline cleanup',
            '{"source":"migration 20260820180000","reason":"controlled test record"}'::jsonb);

    -- 2. Revoke the licence itself. activate-license requires status = ACTIVE,
    --    so the exposed raw key can no longer activate anything.
    UPDATE public.license_keys
       SET status = 'REVOKED'
     WHERE id = test_license;

    INSERT INTO public.license_events (license_id, activation_id, event_type, event_message, metadata)
    VALUES (test_license, NULL, 'REVOKED',
            'E2E recovery test licence revoked during baseline cleanup; raw key was exposed in a session transcript',
            '{"source":"migration 20260820180000","reason":"key exposed in transcript"}'::jsonb);

    -- 3. Assertions
    SELECT count(*) INTO still_active FROM public.license_keys WHERE status = 'ACTIVE';
    IF still_active <> 0 THEN
        RAISE EXCEPTION 'VERIFY FAILED: % licence(s) still ACTIVE.', still_active;
    END IF;
    SELECT count(*) INTO still_active FROM public.license_activations WHERE status = 'ACTIVE';
    IF still_active <> 0 THEN
        RAISE EXCEPTION 'VERIFY FAILED: % activation(s) still ACTIVE.', still_active;
    END IF;

    SELECT count(*) INTO n_events FROM public.license_events;
    RAISE NOTICE 'AFTER: licences ACTIVE=0, activations ACTIVE=0, events=% (history preserved and extended)', n_events;
    RAISE NOTICE 'Real (non-test) customer licences in this database: 0.';
END $$;
