// Admin authentication helper for protected Edge Functions.
// Verifies the caller is a logged-in Supabase user with a row in license_admin_profiles.
// Uses the service_role client to bypass RLS for the profile lookup.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const jwt = authHeader.replace("Bearer ", "");

  // Use the service role client to verify the JWT and look up the admin profile.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Get the user from the JWT
  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check admin profile
  const { data: profile, error: profileError } = await supabase
    .from("license_admin_profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return new Response(JSON.stringify({ error: "Forbidden: not an admin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { userId: user.id };
}
