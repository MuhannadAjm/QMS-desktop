// Edge Function: admin-list-licenses (Admin only)
// Returns all licenses with customer info and activation counts.
// Raw license keys are NEVER returned.
//
// Query params (optional):
//   ?customer_id=uuid  — filter by customer
//   ?status=ACTIVE     — filter by license status
//
// Response:
//   { licenses: [...] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  try {
    const url        = new URL(req.url);
    const customerId = url.searchParams.get("customer_id");
    const status     = url.searchParams.get("status");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let query = supabase
      .from("license_keys")
      .select(`
        id,
        customer_id,
        license_key_last4,
        plan,
        status,
        max_activations,
        expires_at,
        features,
        created_at,
        updated_at,
        license_customers (
          customer_name,
          customer_email,
          company_name
        )
      `)
      .order("created_at", { ascending: false });

    if (customerId) query = query.eq("customer_id", customerId);
    if (status)     query = query.eq("status", status);

    const { data: licenses, error } = await query;
    if (error) {
      return json({ error: error.message }, 500);
    }

    // For each license, count active activations
    const enriched = await Promise.all(
      (licenses ?? []).map(async (lic) => {
        const { count: activeCount } = await supabase
          .from("license_activations")
          .select("id", { count: "exact", head: true })
          .eq("license_id", lic.id)
          .eq("status", "ACTIVE");

        const { count: totalCount } = await supabase
          .from("license_activations")
          .select("id", { count: "exact", head: true })
          .eq("license_id", lic.id);

        return {
          ...lic,
          active_activations: activeCount ?? 0,
          total_activations:  totalCount ?? 0,
          // raw license_key_hash is NEVER returned
        };
      }),
    );

    return json({ licenses: enriched });
  } catch (err) {
    console.error("admin-list-licenses error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
