// QMS licensing — RSA key pair generator.
//
// GUARD: this script OVERWRITES license_private_key.pem, license_public_key.pem
// AND license_hash_secret.txt.
//
// Running it by accident retires the production key: every licence already issued
// stops verifying, and any build still carrying the old embedded public key rejects
// all new licences with a bare "Invalid" and no diagnostic pointing at the key.
// That failure mode has already occurred on this project.
//
// Overwriting license_hash_secret.txt is separately destructive: license_keys rows
// store SHA-256(key + ":" + HASH_SECRET), so a new secret makes every existing
// licence key permanently unrecognisable to activate-license.
//
// Rotation is a deliberate, owner-approved operation requiring, in order:
//   1. regenerate the pair
//   2. update src-tauri/src/license/rsa_public_key.rs
//   3. reset the Supabase secret LICENSE_PRIVATE_KEY_PEM
//   4. rebuild ALL artifacts and verify the embedded fingerprint
//   5. re-issue every outstanding licence
// See supabase/README_LICENSE_SERVER.md step 8.

const { generateKeyPairSync, randomBytes, createPublicKey, createHash } = require("crypto");
const fs = require("fs");

const CONFIRM = "--i-understand-this-retires-the-production-key";

if (!process.argv.includes(CONFIRM)) {
  console.error("REFUSED: this script overwrites the production RSA key pair and hash secret.");
  console.error("Re-run with " + CONFIRM + " only if that is genuinely intended.");
  try {
    const pub = fs.readFileSync("license_public_key.pem", "utf8");
    const der = createPublicKey(pub).export({ type: "spki", format: "der" });
    console.error("Current public key SPKI SHA-256:");
    console.error("  " + createHash("sha256").update(der).digest("hex"));
  } catch {
    console.error("(no existing license_public_key.pem found)");
  }
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

fs.writeFileSync("license_private_key.pem", privateKey, { mode: 0o600 });
fs.writeFileSync("license_public_key.pem", publicKey);
fs.writeFileSync("license_hash_secret.txt", randomBytes(32).toString("hex"));

const der = createPublicKey(publicKey).export({ type: "spki", format: "der" });

console.log("Generated:");
console.log("- license_private_key.pem   (PKCS#8, mode 0600 — never printed, never committed)");
console.log("- license_public_key.pem");
console.log("- license_hash_secret.txt   (all previously issued licence keys are now unrecognisable)");
console.log("");
console.log("New public key SPKI SHA-256:");
console.log("  " + createHash("sha256").update(der).digest("hex"));
console.log("");
console.log("NEXT STEPS ARE MANDATORY — the system is inconsistent until all are done:");
console.log("  1. paste the new public key into src-tauri/src/license/rsa_public_key.rs");
console.log("  2. supabase.cmd secrets set LICENSE_PRIVATE_KEY_PEM / LICENSE_KEY_HASH_SECRET");
console.log("  3. rebuild and verify the embedded fingerprint matches the value above");
console.log("  4. re-issue every outstanding licence");
