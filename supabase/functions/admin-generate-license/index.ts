// Edge Function: admin-generate-license (Admin only)
//
// Creates a new customer (if needed) and generates a signed license key.
//
// Expiry resolution (first match wins):
//   1. expires_in_days (positive integer) — calculated as now + N days
//   2. plan === "trial" — forced to now + 30 days if expires_in_days not sent
//   3. Otherwise — expires_at = null (perpetual)
//
// Trial plan:
//   - expires_at is always set (30 days if not overridden)
//   - max_activations is forced to 1
//
// Email:
//   - Sent after license creation if customer_email is present
//   - Requires LICENSE_EMAIL_PROVIDER=resend + RESEND_API_KEY + LICENSE_FROM_EMAIL
//   - Email failure does NOT fail license generation
//
// Request body:
//   {
//     customer_name, customer_email, company_name, notes,   // new customer
//     existing_customer_id,                                  // OR attach to existing
//     plan, max_activations,
//     expires_in_days,   // number of days — server calculates expires_at = now + N days
//     features
//   }
//
// Response:
//   {
//     license_id, customer_id,
//     raw_license_key,      // SHOWN ONCE — copy and give to customer immediately
//     license_key_last4,
//     plan, max_activations, expires_at, features, created_at,
//     email_sent, email_skipped, email_error?
//   }
//
// Security:
//   raw_license_key is returned once and never stored in the database.
//   Do NOT add console.log statements that print raw_license_key.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";
import {
  generateLicenseKey,
  hashLicenseKey,
  nowIso,
  addDays,
} from "../_shared/rsa.ts";
import { sendLicenseEmail } from "../_shared/email.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  try {
    const body = await req.json();
    const {
      existing_customer_id,
      customer_name,
      customer_email,
      company_name,
      notes,
      plan:             rawPlan       = "standard",
      max_activations:  rawMaxAct     = 1,
      expires_in_days:  rawExpireDays = null,
      features = ["capa", "risks", "complaints", "audits", "documents", "nc", "reports", "backup"],
    } = body;

    const plan = String(rawPlan).toLowerCase();

    // Trial always gets max_activations = 1
    const max_activations = plan === "trial" ? 1 : Number(rawMaxAct);

    // ── Expiry resolution ─────────────────────────────────────────────────────
    let expiresAt: string | null = null;

    if (rawExpireDays !== null && rawExpireDays !== undefined && rawExpireDays !== "") {
      const days = Number(rawExpireDays);
      if (!Number.isInteger(days) || days < 1) {
        return json({ error: "expires_in_days must be a positive integer" }, 400);
      }
      expiresAt = addDays(nowIso(), days);
    } else if (plan === "trial") {
      // Trial licenses always expire — default 30 days
      expiresAt = addDays(nowIso(), 30);
    }
    // else expiresAt remains null (perpetual)

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Resolve customer ──────────────────────────────────────────────────────
    let customerId: string;
    let resolvedEmail: string | null = null;
    let resolvedName  = "Customer";

    if (existing_customer_id) {
      const { data: existCust, error: fetchErr } = await supabase
        .from("license_customers")
        .select("id, customer_email, customer_name")
        .eq("id", existing_customer_id)
        .single();
      if (fetchErr || !existCust) {
        return json({ error: "Existing customer not found" }, 404);
      }
      customerId    = existCust.id;
      resolvedEmail = existCust.customer_email ?? null;
      resolvedName  = existCust.customer_name  ?? "Customer";
    } else {
      if (!customer_name) {
        return json({ error: "customer_name is required when not using existing_customer_id" }, 400);
      }
      const { data: newCust, error: custErr } = await supabase
        .from("license_customers")
        .insert({
          customer_name,
          customer_email,
          company_name: company_name ?? null,
          notes:        notes ?? null,
          status:       "ACTIVE",
        })
        .select("id")
        .single();
      if (custErr || !newCust) {
        return json({ error: `Failed to create customer: ${custErr?.message}` }, 500);
      }
      customerId    = newCust.id;
      resolvedEmail = customer_email ?? null;
      resolvedName  = customer_name;
    }

    // ── Generate license key (raw key never stored) ───────────────────────────
    const rawKey  = generateLicenseKey();         // QMS-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX
    const keyHash = await hashLicenseKey(rawKey);
    const last4   = rawKey.slice(-4);             // last 4 chars of final group

    const { data: license, error: licErr } = await supabase
      .from("license_keys")
      .insert({
        customer_id:       customerId,
        license_key_hash:  keyHash,
        license_key_last4: last4,
        plan,
        status:            "ACTIVE",
        max_activations,
        expires_at:        expiresAt,
        features,
      })
      .select("id")
      .single();

    if (licErr || !license) {
      return json({ error: `Failed to create license: ${licErr?.message}` }, 500);
    }

    // ── Log generation event ──────────────────────────────────────────────────
    await supabase.from("license_events").insert({
      license_id:    license.id,
      activation_id: null,
      event_type:    "ADMIN_GENERATED",
      event_message: `License generated by admin ${userId}`,
      // Safe metadata only — no raw key
      metadata: { plan, max_activations, expires_at: expiresAt, admin_user_id: userId },
    });

    // ── Email delivery ────────────────────────────────────────────────────────
    let emailSent    = false;
    let emailSkipped = false;
    let emailError: string | undefined;

    if (resolvedEmail) {
      const result = await sendLicenseEmail({
        to:              resolvedEmail,
        customer_name:   resolvedName,
        plan,
        license_key:     rawKey,   // sent in email only — never logged below
        expires_at:      expiresAt,
        max_activations,
      });
      emailSent  = result.sent;
      emailError = result.error;

      // Log email event (safe metadata only)
      await supabase.from("license_events").insert({
        license_id:    license.id,
        activation_id: null,
        event_type:    emailSent ? "LICENSE_EMAIL_SENT" : "LICENSE_EMAIL_FAILED",
        event_message: emailSent
          ? "License key emailed to customer"
          : `Email failed: ${emailError ?? "unknown"}`,
        metadata: {
          to:            resolvedEmail,
          plan,
          admin_user_id: userId,
        },
      });
    } else {
      emailSkipped = true;
    }

    // Return raw key once — never retrievable again
    return json({
      license_id:        license.id,
      customer_id:       customerId,
      raw_license_key:   rawKey,    // SHOW ONCE — copy and give to customer immediately
      license_key_last4: last4,
      plan,
      max_activations,
      expires_at:        expiresAt,
      features,
      created_at:        nowIso(),
      email_sent:        emailSent,
      email_skipped:     emailSkipped,
      ...(emailError ? { email_error: emailError } : {}),
    }, 201);
  } catch (err) {
    console.error("admin-generate-license error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
