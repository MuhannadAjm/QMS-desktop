-- QMS Desktop — Licensing Backend Schema
-- Phase 9B: Online Activation Server
-- Supabase Postgres migration
-- Run via: supabase db push

-- ── Extensions ─────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ── 1. license_customers ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS license_customers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name   text NOT NULL,
    customer_email  text,
    company_name    text,
    notes           text,
    status          text NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 2. license_keys ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS license_keys (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         uuid NOT NULL REFERENCES license_customers(id) ON DELETE RESTRICT,
    license_key_hash    text NOT NULL UNIQUE,   -- SHA-256(key + ":" + HASH_SECRET), never raw
    license_key_last4   text NOT NULL,
    plan                text NOT NULL,
    status              text NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED')),
    max_activations     integer NOT NULL DEFAULT 1 CHECK (max_activations >= 1),
    expires_at          timestamptz,            -- NULL = perpetual
    features            jsonb NOT NULL DEFAULT '[]',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 3. license_activations ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS license_activations (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id                  uuid NOT NULL REFERENCES license_keys(id) ON DELETE RESTRICT,
    hardware_fingerprint_hash   text NOT NULL,  -- same SHA-256 hex used by desktop app
    hardware_fingerprint_short  text,           -- first 16 chars for admin display
    machine_label               text,           -- human-readable label (e.g. "Office PC")
    app_version                 text,
    status                      text NOT NULL DEFAULT 'ACTIVE'
                                CHECK (status IN ('ACTIVE', 'DEACTIVATED', 'SUPERSEDED')),
    activated_at                timestamptz NOT NULL DEFAULT now(),
    last_seen_at                timestamptz NOT NULL DEFAULT now(),
    deactivated_at              timestamptz,
    deactivation_reason         text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Prevent exceeding max_activations at DB level for single-seat licenses.
-- Multi-seat enforcement is handled in the Edge Function (count check).
-- This index ensures the same hardware cannot have two ACTIVE activations for the same license.
CREATE UNIQUE INDEX IF NOT EXISTS uix_license_hardware_active
    ON license_activations(license_id, hardware_fingerprint_hash)
    WHERE status = 'ACTIVE';

-- ── 4. license_events ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS license_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id      uuid REFERENCES license_keys(id) ON DELETE SET NULL,
    activation_id   uuid REFERENCES license_activations(id) ON DELETE SET NULL,
    event_type      text NOT NULL,
    -- e.g. ACTIVATED, VALIDATED, DEACTIVATED, REVOKED, ACTIVATION_LIMIT_REACHED,
    --      HARDWARE_MISMATCH, EXPIRED, ADMIN_GENERATED, ADMIN_DEACTIVATED
    event_message   text,
    metadata        jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 5. license_admin_profiles ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS license_admin_profiles (
    id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role        text NOT NULL DEFAULT 'admin'
                CHECK (role IN ('admin', 'viewer')),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Automatic updated_at triggers ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON license_customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_keys_updated_at
    BEFORE UPDATE ON license_keys
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_activations_updated_at
    BEFORE UPDATE ON license_activations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────────────
-- All tables default DENY. Edge Functions use service_role key (bypasses RLS).
-- Admin portal uses anon key + user JWT; RLS grants read to authenticated admins.

ALTER TABLE license_customers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_activations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_admin_profiles ENABLE ROW LEVEL SECURITY;

-- Admin portal: authenticated admins can read everything (via admin_profiles check)
CREATE POLICY "admin_select_customers" ON license_customers
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM license_admin_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "admin_select_keys" ON license_keys
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM license_admin_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "admin_select_activations" ON license_activations
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM license_admin_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "admin_select_events" ON license_events
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM license_admin_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "own_profile" ON license_admin_profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

-- Write operations: all go through Edge Functions with service_role key (bypasses RLS).
-- No direct INSERT/UPDATE/DELETE policies for authenticated users.
