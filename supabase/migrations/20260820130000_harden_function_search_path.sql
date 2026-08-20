-- Security hardening: pin search_path on set_updated_at()
--
-- Supabase's database security advisor flags "Function Search Path Mutable"
-- for any function without an explicit search_path. A function that resolves
-- unqualified identifiers through a caller-controlled search_path can be
-- tricked into calling an attacker-supplied object of the same name.
--
-- Fix: declare SECURITY INVOKER explicitly and pin search_path to empty, then
-- schema-qualify every builtin. now() becomes pg_catalog.now().
--
-- Behaviour is unchanged: the trigger still stamps updated_at on UPDATE.
-- CREATE OR REPLACE keeps the existing trigger bindings on
-- license_customers / license_keys / license_activations intact.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = pg_catalog.now();
    RETURN NEW;
END;
$$;
