// RSA-PKCS1v1.5 SHA-256 signing utility for Supabase Edge Functions (Deno).
//
// The private key is loaded from the LICENSE_PRIVATE_KEY_PEM environment variable.
// Required format: PKCS#8 PEM-encoded RSA-2048 private key.
//   -----BEGIN PRIVATE KEY-----
//   <base64>
//   -----END PRIVATE KEY-----
//
// The secret may be stored with real newlines OR with literal \n (escaped, e.g. via CLI).
// Both formats are normalized automatically.
//
// PKCS#1 keys (-----BEGIN RSA PRIVATE KEY-----) are NOT supported by WebCrypto.
// Convert with: openssl pkcs8 -topk8 -nocrypt -in private.pem -out private_pkcs8.pem
//
// The matching public key is embedded in the desktop Rust binary.
//
// Token canonicalization:
//   All token fields (except 'signature') are included in alphabetical key order,
//   with null for absent optional fields, serialized as compact JSON (no whitespace).
//   This canonical string is signed. The Rust desktop must produce the same canonical
//   form to verify.

export interface LicenseTokenPayload {
  license_id: string;
  activation_id: string | null;
  customer_name: string;
  plan: string;
  max_activations: number;
  hardware_fingerprint: string;
  issued_at: string;
  activated_at: string | null;
  expires_at: string | null;
  last_validated_at: string | null;
  next_validation_due_at: string | null;
  grace_until: string | null;
  features: string[];
  license_key_last4: string | null;
  status: string;
}

// ── Key import ─────────────────────────────────────────────────────────────────

// Strips PKCS#8 PEM headers and decodes base64 → DER bytes.
// Assumes pem is already normalized (real newlines, trimmed).
function pemToBytes(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!b64) {
    throw new Error(
      "Private key base64 payload is empty after stripping PEM headers. " +
      "Check that the LICENSE_PRIVATE_KEY_PEM value contains base64 content."
    );
  }

  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf.buffer;
}

let _privateKey: CryptoKey | null = null;

export async function getPrivateKey(): Promise<CryptoKey> {
  if (_privateKey) return _privateKey;

  const raw = Deno.env.get("LICENSE_PRIVATE_KEY_PEM");

  // Safe diagnostic: log presence and length, never the key value itself
  console.log("[rsa] LICENSE_PRIVATE_KEY_PEM present:", !!raw, "raw length:", raw?.length ?? 0);

  if (!raw || !raw.trim()) {
    throw new Error(
      "LICENSE_PRIVATE_KEY_PEM is not configured or is empty. " +
      "Set it with: supabase secrets set LICENSE_PRIVATE_KEY_PEM=\"$escaped\""
    );
  }

  // Normalize: literal \\n (stored via CLI escaping) → real newlines
  const pem = raw.replace(/\\n/g, "\n").trim();

  const isPkcs8 = pem.includes("-----BEGIN PRIVATE KEY-----");
  const isPkcs1 = pem.includes("-----BEGIN RSA PRIVATE KEY-----");

  // Safe diagnostic: log detected format, never the content
  console.log("[rsa] PEM type detected:", isPkcs8 ? "PKCS#8 (correct)" : isPkcs1 ? "PKCS#1 (unsupported)" : "unrecognized");

  if (isPkcs1) {
    throw new Error(
      "LICENSE_PRIVATE_KEY_PEM is in PKCS#1 format (-----BEGIN RSA PRIVATE KEY-----). " +
      "WebCrypto requires PKCS#8. Convert with: " +
      "openssl pkcs8 -topk8 -nocrypt -in private.pem -out private_pkcs8.pem " +
      "then re-set the secret using the PKCS#8 output."
    );
  }

  if (!isPkcs8) {
    throw new Error(
      "LICENSE_PRIVATE_KEY_PEM does not contain a recognized PEM header. " +
      "Expected: -----BEGIN PRIVATE KEY----- (PKCS#8 format). " +
      "Verify the secret was set correctly."
    );
  }

  const derBytes = pemToBytes(pem);

  // Safe diagnostic: log byte length only
  console.log("[rsa] DER byte length after decode:", derBytes.byteLength);

  if (derBytes.byteLength === 0) {
    throw new Error(
      "Private key DER payload is empty (0 bytes) after base64 decode. " +
      "The PEM base64 content may be missing or corrupted. Re-set the secret."
    );
  }

  _privateKey = await crypto.subtle.importKey(
    "pkcs8",
    derBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return _privateKey;
}

// ── Canonical payload ──────────────────────────────────────────────────────────

export function canonicalPayload(token: LicenseTokenPayload): string {
  // All 15 fields in alphabetical order, null for absent optionals.
  // This MUST match the Rust canonical_payload() function in validation.rs.
  const fields: Record<string, unknown> = {
    activation_id:          token.activation_id    ?? null,
    activated_at:           token.activated_at     ?? null,
    customer_name:          token.customer_name,
    expires_at:             token.expires_at       ?? null,
    features:               token.features,
    grace_until:            token.grace_until      ?? null,
    hardware_fingerprint:   token.hardware_fingerprint,
    issued_at:              token.issued_at,
    last_validated_at:      token.last_validated_at ?? null,
    license_id:             token.license_id,
    license_key_last4:      token.license_key_last4 ?? null,
    max_activations:        token.max_activations,
    next_validation_due_at: token.next_validation_due_at ?? null,
    plan:                   token.plan,
    status:                 token.status,
  };

  // Keys are already in alphabetical order above; sort explicitly for safety.
  const sorted = Object.fromEntries(
    Object.keys(fields).sort().map((k) => [k, fields[k]]),
  );
  return JSON.stringify(sorted);
}

// ── Sign ───────────────────────────────────────────────────────────────────────

export async function signToken(token: LicenseTokenPayload): Promise<string> {
  const privateKey = await getPrivateKey();
  const canonical  = canonicalPayload(token);
  const msgBytes   = new TextEncoder().encode(canonical);
  const sigBuffer  = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, msgBytes);
  // Standard base64 (matches base64::engine::general_purpose::STANDARD in Rust)
  return btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
}

// ── License key hashing ────────────────────────────────────────────────────────

export async function hashLicenseKey(licenseKey: string): Promise<string> {
  const secret = Deno.env.get("LICENSE_KEY_HASH_SECRET") ?? "";
  const msg    = new TextEncoder().encode(licenseKey + ":" + secret);
  const buf    = await crypto.subtle.digest("SHA-256", msg);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Random license key generation ─────────────────────────────────────────────

export function generateLicenseKey(): string {
  // Format: QMS-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX
  // 5 groups of 6 cryptographically random characters.
  // Charset: uppercase letters + digits 2-9.
  // Excluded to avoid visual confusion: O (looks like 0), I (looks like 1), L (looks like 1).
  // Also excluded: 0 and 1 (look like O and I/L).
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 unambiguous chars
  const groups: string[] = [];
  for (let g = 0; g < 5; g++) {
    let segment = "";
    const rand = crypto.getRandomValues(new Uint8Array(6));
    for (let i = 0; i < 6; i++) {
      segment += chars[rand[i] % chars.length];
    }
    groups.push(segment);
  }
  return "QMS-" + groups.join("-");
}

// ── Date helpers ───────────────────────────────────────────────────────────────

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
