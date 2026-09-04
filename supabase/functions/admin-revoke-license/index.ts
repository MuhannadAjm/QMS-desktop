// Edge Function: admin-revoke-license (Admin only)
//
// Permanently revokes a licence so it can no longer activate any machine, and
// deactivates every device currently activated against it.
//
// Request body:
//   { license_id: uuid, reason?: string }
//
// Response:
//   { success: true, license_id, status: "REVOKED", previous_status,
//     already_revoked, revoked_at, activations_deactivated, warnings: [] }
//
// ── Design notes ──────────────────────────────────────────────────────────────
//
// IDENTIFIER
//   Takes the licence's uuid primary key and nothing else. No filter object, no
//   key material, no free-form predicate — a caller cannot widen the blast
//   radius beyond one row. The value is shape-checked as a uuid before it is
//   used, so a malformed id is rejected here rather than by PostgREST.
//
// AUTHORIZATION
//   requireAdmin() — the same shared gate the other admin functions use — plus
//   an explicit `role = 'admin'` check. license_admin_profiles.role is
//   CHECK (role IN ('admin','viewer')), and requireAdmin only proves a profile
//   row EXISTS; it never reads the role. For the reversible operations that gate
//   protects today that is tolerable, but revocation cannot be undone from this
//   application, so an account provisioned under the schema's own read-only
//   'viewer' role must not be able to perform it. The check is made here rather
//   than in _shared/auth.ts so the three already-deployed admin functions keep
//   behaving exactly as they do now.
//
// CANONICAL END STATE
//   Matches migration 20260820180000, which retired the E2E test licence and is
//   the product's own definition of a revoked licence:
//       licence     -> status = 'REVOKED'   (activate-license requires ACTIVE)
//       activations -> status = 'DEACTIVATED' + deactivated_at + reason
//       events      -> one licence event + one 'ADMIN_DEACTIVATED' per device
//   Nothing is deleted. Licence, activation and event rows are all preserved;
//   revocation is a state transition and the audit trail is extended, not erased.
//
// EVENT TYPE — 'ADMIN_REVOKED', not 'REVOKED'
//   validate-license already writes a 'REVOKED' event every time a desktop tries
//   to validate a licence whose status is not ACTIVE — including SUSPENDED and
//   EXPIRED (validate-license/index.ts:76-80). That is a client-rejection record,
//   not an administrative act. Reusing the same type here would make the audit
//   trail ambiguous: you could no longer tell "an admin revoked this licence"
//   from "a machine tried to validate a suspended one". 'ADMIN_REVOKED' follows
//   the existing ADMIN_GENERATED / ADMIN_DEACTIVATED convention for admin
//   actions and stays unambiguous. event_type is free text with no CHECK
//   constraint, so no migration is needed to introduce it.
//
// ORDER OF OPERATIONS — FAIL CLOSED
//   The licence is revoked FIRST, then its activations are deactivated.
//
//   That order matters. Deactivating first would free activation seats on a key
//   that is still ACTIVE, so a failure part-way through would leave the licence
//   *easier* to activate than before it was revoked. Revoking first means any
//   later failure leaves the licence already unusable — the safe direction.
//
// IDEMPOTENCE
//   Re-revoking is not an error. The licence transition is a compare-and-set
//   (`status <> 'REVOKED'`) whose affected rows are read back, so a second call
//   records no second ADMIN_REVOKED event but still sweeps any activation that
//   is somehow still ACTIVE. Calling twice reaches the same end state as calling
//   once, which is what makes retry-after-partial-failure safe. A device that
//   activated in the instant before the licence flipped is cleaned up by the
//   next call rather than by this one.
//
// ATOMICITY
//   These are sequential PostgREST statements, not one transaction — the same
//   shape as admin-deactivate-device. A partial failure is reported in
//   `warnings` rather than hidden, and is repaired by calling again.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { nowIso } from "../_shared/rsa.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_REASON_LEN = 500;

interface ActivationRow {
  id: string;
  machine_label: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // requireAdmin's 401/403 responses are built without CORS headers, so a
  // browser blocks them and fetch() rejects — the Admin app would report a bare
  // "Failed to fetch" for exactly the authorization failures it most needs to
  // explain. Re-emit the gate's own status and body with the CORS headers
  // attached. The decision is unchanged; only its readability is.
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) {
    const denied = await authResult.text();
    return new Response(denied, {
      status: authResult.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { userId } = authResult;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "A JSON body is required" }, 400);
    }

    const rawId = (body as { license_id?: unknown }).license_id;
    if (typeof rawId !== "string" || !UUID_RE.test(rawId.trim())) {
      return json({ error: "license_id must be a licence UUID" }, 400);
    }
    const licenseId = rawId.trim();

    const rawReason = (body as { reason?: unknown }).reason;
    const reason =
      typeof rawReason === "string" && rawReason.trim()
        ? rawReason.trim().slice(0, MAX_REASON_LEN)
        : "Admin revocation";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Authorization, part 2: the role, not just the row ─────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from("license_admin_profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return json({ error: "Forbidden: not an admin" }, 403);
    }
    if (profile.role !== "admin") {
      return json(
        { error: "Forbidden: revoking a license requires the admin role" },
        403,
      );
    }

    // ── Load the licence ──────────────────────────────────────────────────────
    const { data: license, error: licErr } = await supabase
      .from("license_keys")
      .select("id, status, plan, license_key_last4, customer_id")
      .eq("id", licenseId)
      .single();

    if (licErr || !license) {
      return json({ error: "License not found" }, 404);
    }

    const previousStatus: string = license.status;
    const revokedAt = nowIso();
    const warnings: string[] = [];

    // ── 1. Revoke the licence (compare-and-set, result read back) ─────────────
    // Done before touching activations so that a failure below cannot leave an
    // ACTIVE key with newly freed seats.
    //
    // `.select()` matters: without it a zero-row match and a one-row match are
    // indistinguishable, so two concurrent callers would both believe they
    // performed the revocation and both would write an ADMIN_REVOKED event.
    let transitioned = false;
    if (previousStatus !== "REVOKED") {
      const { data: changed, error: revokeErr } = await supabase
        .from("license_keys")
        .update({ status: "REVOKED" })
        .eq("id", licenseId)
        .neq("status", "REVOKED")
        .select("id");

      if (revokeErr) {
        return json(
          { error: `Failed to revoke license: ${revokeErr.message}` },
          500,
        );
      }
      transitioned = (changed ?? []).length > 0;

      if (transitioned) {
        const { error: evErr } = await supabase.from("license_events").insert({
          license_id: licenseId,
          activation_id: null,
          event_type: "ADMIN_REVOKED",
          event_message: `Revoked by admin ${userId}: ${reason}`,
          metadata: {
            reason,
            admin_user_id: userId,
            previous_status: previousStatus,
            source: "admin-revoke-license",
          },
        });
        if (evErr) {
          warnings.push(
            `The licence is revoked, but its audit event was not recorded: ${evErr.message}`,
          );
        }
      }
    }

    // The licence was already REVOKED on entry, or another caller won the race.
    const alreadyRevoked = !transitioned;

    // ── 2. Deactivate every device still activated against it ─────────────────
    // One statement, with the changed rows read back, so the reported count and
    // the audit events describe exactly the rows this call actually changed —
    // not a count taken from an earlier SELECT that a concurrent deactivation
    // could have made stale.
    let deactivated = 0;
    const { data: sweptRaw, error: deactErr } = await supabase
      .from("license_activations")
      .update({
        status: "DEACTIVATED",
        deactivated_at: revokedAt,
        deactivation_reason: `License revoked: ${reason}`,
      })
      .eq("license_id", licenseId)
      .eq("status", "ACTIVE")
      .select("id, machine_label");

    if (deactErr) {
      warnings.push(
        `The licence is revoked, but its device activations could not be deactivated: ` +
          `${deactErr.message}. Run the revoke again to finish releasing them.`,
      );
    } else {
      const swept = (sweptRaw ?? []) as ActivationRow[];
      deactivated = swept.length;

      if (swept.length > 0) {
        const { error: actEvErr } = await supabase.from("license_events").insert(
          swept.map((a) => ({
            license_id: licenseId,
            activation_id: a.id,
            event_type: "ADMIN_DEACTIVATED",
            event_message:
              `Deactivated by admin ${userId} as part of license revocation: ${reason}`,
            metadata: {
              machine_label: a.machine_label,
              reason,
              admin_user_id: userId,
              source: "admin-revoke-license",
            },
          })),
        );
        if (actEvErr) {
          warnings.push(
            `${swept.length} device activation(s) were deactivated, but their audit ` +
              `events were not recorded: ${actEvErr.message}`,
          );
        }
      }
    }

    return json({
      success: true,
      license_id: licenseId,
      status: "REVOKED",
      previous_status: previousStatus,
      already_revoked: alreadyRevoked,
      // Only this call's own transition has a timestamp to report. When the
      // licence was already revoked, the time of that earlier revocation lives
      // in its ADMIN_REVOKED event — inventing "now" here would misdate it.
      revoked_at: transitioned ? revokedAt : null,
      activations_deactivated: deactivated,
      warnings,
    });
  } catch (err) {
    console.error("admin-revoke-license error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
