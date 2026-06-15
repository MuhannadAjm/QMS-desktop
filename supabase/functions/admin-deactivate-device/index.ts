// Edge Function: admin-deactivate-device (Admin only)
// Deactivates a specific device activation so a new device can be activated
// on a license that has reached its max_activations limit.
//
// Request body:
//   { activation_id, reason }
//
// Response:
//   { success: true, activation_id, deactivated_at }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { nowIso } from "../_shared/rsa.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  try {
    const body = await req.json();
    const { activation_id, reason = "Admin deactivated" } = body;

    if (!activation_id) {
      return json({ error: "activation_id is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load activation to get license_id for event logging
    const { data: activation, error: actErr } = await supabase
      .from("license_activations")
      .select("id, license_id, status, machine_label")
      .eq("id", activation_id)
      .single();

    if (actErr || !activation) {
      return json({ error: "Activation not found" }, 404);
    }

    if (activation.status !== "ACTIVE") {
      return json({ error: `Activation is already ${activation.status.toLowerCase()}` }, 409);
    }

    const deactivatedAt = nowIso();

    // Deactivate
    const { error: updateErr } = await supabase
      .from("license_activations")
      .update({
        status:              "DEACTIVATED",
        deactivated_at:      deactivatedAt,
        deactivation_reason: reason,
      })
      .eq("id", activation_id);

    if (updateErr) {
      return json({ error: `Failed to deactivate: ${updateErr.message}` }, 500);
    }

    // Log event
    await supabase.from("license_events").insert({
      license_id:    activation.license_id,
      activation_id: activation_id,
      event_type:    "ADMIN_DEACTIVATED",
      event_message: `Deactivated by admin ${userId}: ${reason}`,
      metadata:      {
        machine_label:  activation.machine_label,
        reason,
        admin_user_id:  userId,
      },
    });

    return json({ success: true, activation_id, deactivated_at: deactivatedAt });
  } catch (err) {
    console.error("admin-deactivate-device error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
