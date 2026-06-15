// Edge Function: validate-license
// Called periodically by the desktop app to refresh the signed token.
// No authentication required — the license_id + activation_id + hardware_fingerprint
// combination is the credential (all validated server-side).
//
// Request body:
//   { license_id, activation_id, hardware_fingerprint, app_version }
//
// Response:
//   { ...token, signature } — fresh signed token

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  signToken,
  nowIso,
  addDays,
  type LicenseTokenPayload,
} from "../_shared/rsa.ts";

const GRACE_DAYS           = 14;
const NEXT_VALIDATION_DAYS = 30;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { license_id, activation_id, hardware_fingerprint, app_version } = body;

    if (!license_id || !activation_id || !hardware_fingerprint) {
      return json({ error: "license_id, activation_id, and hardware_fingerprint are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load activation
    const { data: activation, error: actErr } = await supabase
      .from("license_activations")
      .select("*")
      .eq("id", activation_id)
      .eq("license_id", license_id)
      .single();

    if (actErr || !activation) {
      return json({ error: "Activation record not found" }, 404);
    }

    if (activation.status !== "ACTIVE") {
      return json({ error: `Activation is ${activation.status.toLowerCase()}` }, 403);
    }

    if (activation.hardware_fingerprint_hash !== hardware_fingerprint) {
      await logEvent(supabase, license_id, activation_id, "HARDWARE_MISMATCH",
        "Hardware fingerprint mismatch during validation");
      return json({ error: "Hardware mismatch" }, 403);
    }

    // Load license
    const { data: license, error: licErr } = await supabase
      .from("license_keys")
      .select("*, license_customers(customer_name)")
      .eq("id", license_id)
      .single();

    if (licErr || !license) {
      return json({ error: "License not found" }, 404);
    }

    if (license.status !== "ACTIVE") {
      await logEvent(supabase, license_id, activation_id, "REVOKED",
        `License status is ${license.status}`);
      return json({ error: `License is ${license.status.toLowerCase()}` }, 403);
    }

    // Check expiry
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      await logEvent(supabase, license_id, activation_id, "EXPIRED", "License expired during validation");
      return json({ error: "License has expired" }, 403);
    }

    // Update last_seen_at
    await supabase
      .from("license_activations")
      .update({ last_seen_at: nowIso(), app_version })
      .eq("id", activation_id);

    const now          = nowIso();
    const nextValidate = addDays(now, NEXT_VALIDATION_DAYS);
    const gracePeriod  = license.expires_at ? addDays(license.expires_at, GRACE_DAYS) : null;
    const customerName = license.license_customers?.customer_name ?? "Unknown";

    const payload: LicenseTokenPayload = {
      license_id,
      activation_id,
      customer_name:          customerName,
      plan:                   license.plan,
      max_activations:        license.max_activations,
      hardware_fingerprint,
      issued_at:              activation.activated_at,
      activated_at:           activation.activated_at,
      expires_at:             license.expires_at ?? null,
      last_validated_at:      now,
      next_validation_due_at: nextValidate,
      grace_until:            gracePeriod,
      features:               Array.isArray(license.features) ? license.features : [],
      license_key_last4:      license.license_key_last4,
      status:                 "active",
    };

    const signature = await signToken(payload);

    await logEvent(supabase, license_id, activation_id, "VALIDATED", "Token refreshed", { app_version });

    return json({ ...payload, signature }, 200);
  } catch (err) {
    console.error("validate-license error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

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
