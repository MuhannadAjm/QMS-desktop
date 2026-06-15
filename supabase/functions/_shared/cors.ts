// CORS headers for all Edge Functions.
// Desktop app (Rust/reqwest) doesn't need CORS, but the Admin Portal browser calls do.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
