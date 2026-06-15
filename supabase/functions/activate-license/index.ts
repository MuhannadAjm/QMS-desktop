// Edge Function: activate-license
// Called by the desktop app (Rust/reqwest) when the user enters a license key.
// No authentication required — the license key itself is the credential.
//
// Request body:
//   { license_key, hardware_fingerprint, hardware_fingerprint_short, machine_label, app_version }
//
// Response:
//   { token: LicenseToken } — full signed token JSON, written to license.json by the desktop

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  hashLicenseKey,
  signToken,
  nowIso,
  addDays,
  type LicenseTokenPayload,
} from "../_shared/rsa.ts";

const GRACE_DAYS           = 14; // grace period after expiry
const NEXT_VALIDATION_DAYS = 30; // how often desktop should re-validate online

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { license_key, hardware_fingerprint, hardware_fingerprint_short, machine_label, app_version } = body;

    if (!license_key || !hardware_fingerprint) {
      return json({ error: "license_key and hardware_fingerprint are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Hash the submitted key for lookup
    const keyHash = await hashLicenseKey(license_key);

    // Find the license record
    const { data: license, error: licenseErr } = await supabase
      .from("license_keys")
      .select("*, license_customers(customer_name, company_name)")
      .eq("license_key_hash", keyHash)
      .single();

    if (licenseErr || !license) {
      await logEvent(supabase, null, null, "ACTIVATION_REJECTED", "License key not found");
      return json({ error: "Invalid license key" }, 403);
    }

    if (license.status !== "ACTIVE") {
      await logEvent(supabase, license.id, null, "ACTIVATION_REJECTED",
        `License status is ${license.status}`);
      return json({ error: `License is ${license.status.toLowerCase()}` }, 403);
    }

    // Check expiry
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      await logEvent(supabase, license.id, null, "ACTIVATION_REJECTED", "License expired");
      return json({ error: "License has expired" }, 403);
    }

    const customerName = license.license_customers?.customer_name ?? "Unknown";

    // Check for existing ACTIVE activation for this hardware
    const { data: existingActivation } = await supabase
      .from("license_activations")
      .select("id, hardware_fingerprint_hash, status")
      .eq("license_id", license.id)
      .eq("hardware_fingerprint_hash", hardware_fingerprint)
      .eq("status", "ACTIVE")
      .maybeSingle();

    let activationId: string;

    if (existingActivation) {
      // Same hardware — refresh the token, update last_seen_at
      activationId = existingActivation.id;
      await supabase
        .from("license_activations")
        .update({ last_seen_at: nowIso(), app_version, machine_label })
        .eq("id", activationId);

      await logEvent(supabase, license.id, activationId, "VALIDATED",
        "Existing activation refreshed");
    } else {
      // New hardware — check activation limit
      const { count } = await supabase
        .from("license_activations")
        .select("id", { count: "exact", head: true })
        .eq("license_id", license.id)
        .eq("status", "ACTIVE");

      if ((count ?? 0) >= license.max_activations) {
        await logEvent(supabase, license.id, null, "ACTIVATION_LIMIT_REACHED",
          `Max activations (${license.max_activations}) reached`);
        return json({
          error: `Activation limit reached (${license.max_activations} device${license.max_activations > 1 ? "s" : ""}). Deactivate an existing device to continue.`,
        }, 403);
      }

      // Create new activation
      const { data: newAct, error: actErr } = await supabase
        .from("license_activations")
        .insert({
          license_id:                 license.id,
          hardware_fingerprint_hash:  hardware_fingerprint,
          hardware_fingerprint_short: hardware_fingerprint_short ?? hardware_fingerprint.slice(0, 16) + "...",
          machine_label,
          app_version,
          status:       "ACTIVE",
          activated_at: nowIso(),
          last_seen_at: nowIso(),
        })
        .select("id")
        .single();

      if (actErr || !newAct) {
        return json({ error: "Failed to create activation record" }, 500);
      }

      activationId = newAct.id;
      await logEvent(supabase, license.id, activationId, "ACTIVATED",
        `New activation created for machine: ${machine_label ?? "unknown"}`);
    }

    // Build and sign the token
    const now          = nowIso();
    const nextValidate = addDays(now, NEXT_VALIDATION_DAYS);
    const gracePeriod  = license.expires_at ? addDays(license.expires_at, GRACE_DAYS) : null;

    const payload: LicenseTokenPayload = {
      license_id:             license.id,
      activation_id:          activationId,
      customer_name:          customerName,
      plan:                   license.plan,
      max_activations:        license.max_activations,
      hardware_fingerprint,
      issued_at:              now,
      activated_at:           now,
      expires_at:             license.expires_at ?? null,
      last_validated_at:      now,
      next_validation_due_at: nextValidate,
      grace_until:            gracePeriod,
      features:               Array.isArray(license.features) ? license.features : [],
      license_key_last4:      license.license_key_last4,
      status:                 "active",
    };

    const signature = await signToken(payload);

    return json({ ...payload, signature }, 200);
  } catch (err) {
    console.error("activate-license error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logEvent(
  supabase: ReturnType<typeof createClient>,
  licenseId: string | null,
  activationId: string | null,
  eventType: string,
  message: string,
  metadata: Record<string, unknown> = {},
) {
  await supabase.from("license_events").insert({
    license_id:    licenseId,
    activation_id: activationId,
    event_type:    eventType,
    event_message: message,
    metadata,
  });
}
