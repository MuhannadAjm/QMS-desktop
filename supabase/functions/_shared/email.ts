// Email delivery helper for license admin Edge Functions.
//
// Provider is selected via LICENSE_EMAIL_PROVIDER env var.
// Currently supports: "resend"
// If no provider is configured, sendLicenseEmail returns { sent: false } silently.
//
// Required env vars (when provider = "resend"):
//   RESEND_API_KEY          — Resend API key (server-side only, never exposed to frontend)
//   LICENSE_FROM_EMAIL      — Sender address, e.g. "noreply@yourdomain.com"
//
// Optional env vars:
//   LICENSE_COMPANY_NAME    — Display name in email (default: "QMS Desktop")
//   LICENSE_SUPPORT_EMAIL   — Reply-to / support address shown in email
//   LICENSE_DOWNLOAD_URL    — Download link shown in email
//
// Security:
//   The raw license_key is included in the email HTML but is NEVER logged or stored.
//   Do not add any console.log that prints the license_key.

export interface LicenseEmailParams {
  to: string;
  customer_name: string;
  plan: string;
  license_key: string;       // included in email body only — never logged
  expires_at: string | null;
  max_activations: number;
}

export interface EmailResult {
  sent: boolean;
  error?: string;
}

const PLAN_LABELS: Record<string, string> = {
  trial:        "Trial",
  standard:     "Standard",
  professional: "Professional",
  enterprise:   "Enterprise",
};

export async function sendLicenseEmail(params: LicenseEmailParams): Promise<EmailResult> {
  const provider    = Deno.env.get("LICENSE_EMAIL_PROVIDER") ?? "";
  const apiKey      = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromEmail   = Deno.env.get("LICENSE_FROM_EMAIL") ?? "";
  const company     = Deno.env.get("LICENSE_COMPANY_NAME") ?? "QMS Desktop";
  const support     = Deno.env.get("LICENSE_SUPPORT_EMAIL") ?? "";
  const downloadUrl = Deno.env.get("LICENSE_DOWNLOAD_URL") ?? "";

  if (provider !== "resend" || !apiKey || !fromEmail) {
    return { sent: false };
  }

  const planLabel  = PLAN_LABELS[params.plan] ?? params.plan;
  const isTrial    = params.plan === "trial";
  const expiryText = params.expires_at
    ? new Date(params.expires_at).toISOString().split("T")[0]
    : "Never (perpetual)";

  const trialWarningBlock = isTrial
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:13px;">
        <strong>Trial License Notice:</strong> This is a 30-day trial license.
        It will stop working after the expiry date, including offline use.
       </div>`
    : "";

  const downloadBlock = downloadUrl
    ? `<p style="margin-top:8px;"><strong>Download ${company}:</strong> <a href="${downloadUrl}" style="color:#1d4ed8;">${downloadUrl}</a></p>`
    : "";

  const supportBlock = support
    ? `<p style="margin-top:24px;color:#6b7280;font-size:12px;">
         Need help? Contact us at <a href="mailto:${support}" style="color:#1d4ed8;">${support}</a>.
       </p>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#1e3a5f;max-width:600px;margin:0 auto;padding:24px;">

  <h2 style="color:#1e3a5f;margin-bottom:4px;">${company}</h2>
  <p style="color:#6b7280;margin-top:0;font-size:13px;">License Key Delivery</p>

  <p>Hello ${params.customer_name},</p>
  <p>Your <strong>${planLabel}</strong> license for ${company} has been generated. Details are below.</p>

  ${trialWarningBlock}

  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
    <tr>
      <td style="padding:6px 12px 6px 0;color:#6b7280;width:160px;vertical-align:top;">Plan</td>
      <td style="padding:6px 0;font-weight:600;">${planLabel}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;">Max Activations</td>
      <td style="padding:6px 0;font-weight:600;">${params.max_activations}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;">Expires</td>
      <td style="padding:6px 0;font-weight:600;">${expiryText}</td>
    </tr>
  </table>

  <p style="margin-bottom:6px;font-size:13px;font-weight:600;">Your License Key</p>
  <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:6px;padding:18px;font-family:monospace;font-size:20px;font-weight:700;letter-spacing:3px;text-align:center;color:#1e3a5f;">
    ${params.license_key}
  </div>
  <p style="font-size:11px;color:#dc2626;margin-top:6px;font-weight:600;">Keep this key safe. Do not share it publicly.</p>

  <h3 style="margin-top:24px;font-size:14px;">Activation Steps</h3>
  <ol style="font-size:13px;line-height:1.8;padding-left:20px;">
    <li>Install ${company} on your Windows PC.</li>
    <li>Open the application.</li>
    <li>When the License screen appears, paste the key above.</li>
    <li>Click <strong>Activate</strong>.</li>
  </ol>

  ${downloadBlock}

  ${supportBlock}

  <hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb;">
  <p style="font-size:11px;color:#9ca3af;margin-bottom:0;">${company} &mdash; This email was sent automatically after license generation.</p>
</body>
</html>`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    fromEmail,
        to:      [params.to],
        subject: `${company} License Key — ${planLabel}`,
        html,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "unknown");
      return { sent: false, error: `Email provider error (${resp.status}): ${errText.slice(0, 200)}` };
    }

    return { sent: true };
  } catch (err) {
    return { sent: false, error: `Email delivery failed: ${String(err).slice(0, 200)}` };
  }
}
