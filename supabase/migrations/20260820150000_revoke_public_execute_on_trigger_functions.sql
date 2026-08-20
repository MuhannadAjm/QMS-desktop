-- Security advisor remediation: SECURITY DEFINER function executable by anon/authenticated
--
-- FINDING
--   public.rls_auto_enable() is SECURITY DEFINER, owned by postgres, and carried
--   no explicit ACL — so it inherited the PostgreSQL default of EXECUTE to PUBLIC,
--   which includes the anon and authenticated roles.
--
-- WHAT THE FUNCTION IS FOR (verified by introspection before changing anything)
--   It is the handler for the `ensure_rls` event trigger on ddl_command_end. It
--   walks pg_event_trigger_ddl_commands() and runs
--   `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on every newly created table in
--   the public schema. It is a hardening control, not leftover scaffolding, so it
--   is KEPT — dropping it would silently stop new tables from getting RLS.
--
-- REMEDIATION
--   Revoke the default PUBLIC EXECUTE. The function keeps working: PostgreSQL
--   checks EXECUTE on an event-trigger function at CREATE EVENT TRIGGER time, not
--   when the trigger fires, and event triggers fire with the definer's rights
--   regardless of who ran the DDL. Direct invocation was never actually possible
--   either — a function returning `event_trigger` cannot be called from SQL — but
--   the grant is still wrong under least privilege and the advisor flags it.
--
--   public.set_updated_at() is given the same treatment. It is SECURITY INVOKER
--   so the exposure is lower, but it is likewise a trigger-only function that
--   nothing should be able to call directly. Row triggers also check EXECUTE at
--   CREATE TRIGGER time, so the existing triggers are unaffected.

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM authenticated;
