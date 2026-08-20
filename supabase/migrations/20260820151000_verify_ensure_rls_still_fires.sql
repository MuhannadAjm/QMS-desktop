-- Regression proof for 20260820150000 (revoking PUBLIC EXECUTE on rls_auto_enable).
--
-- The risk being tested: if PostgreSQL checked EXECUTE on the event-trigger
-- function at FIRE time rather than at CREATE EVENT TRIGGER time, the revoke
-- would silently stop `ensure_rls` from enabling RLS on new tables — a security
-- regression that would only surface the next time someone added a table.
--
-- This creates a throwaway table, asserts the event trigger enabled RLS on it,
-- then drops it. If the control is broken the migration ABORTS, so the failure
-- is loud instead of silent.

DO $$
DECLARE
    rls_on boolean;
BEGIN
    CREATE TABLE public._rls_trigger_probe (id integer);

    SELECT c.relrowsecurity INTO rls_on
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_rls_trigger_probe';

    DROP TABLE public._rls_trigger_probe;

    IF rls_on IS NOT TRUE THEN
        RAISE EXCEPTION
            'REGRESSION: ensure_rls did not enable RLS on a newly created table. '
            'Revoking PUBLIC EXECUTE on rls_auto_enable() broke the control.';
    END IF;

    RAISE NOTICE 'ensure_rls verified: RLS auto-enabled on a new table after the revoke.';
END $$;
