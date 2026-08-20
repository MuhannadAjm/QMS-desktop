// RSA-2048 Public Key — QMS Desktop License Verification
//
// This is the PRODUCTION key.
// The matching PRIVATE KEY lives ONLY in the Supabase Edge Function environment
// variable LICENSE_PRIVATE_KEY_PEM and NEVER in this binary.
//
// The public key is safe to embed — it can only verify signatures, not create them.
//
// Key format: SPKI (SubjectPublicKeyInfo) PEM — RSA-2048.
//
// ROTATED 2026-08-20. The previous key pair
// (SPKI SHA-256 8780137fd16b15f7d13cf8b32ed07aa5713934722c69807b09ac3724859b17da)
// was retired because its private half was exposed in a tooling transcript. It
// had signed zero production licences, so the rotation invalidated nothing.
//
// Current key SPKI SHA-256:
//   9f603a7b697b75f59d672027779fb8d8adc17aef8729938da0c71c64e1f02700
//
// Verify a built binary carries this key before shipping — see
// supabase/README_LICENSE_SERVER.md step 8. DO NOT regenerate as a setup step.

pub const LICENSE_PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqWGyH1dXqehfPvtjSnt9
bNrk2NJr6tG9gQm/kGtVQ4F5133BRsW2ECS/guRYV3JbJzeQQ6QhkJozQnsQyWNj
hA4DrMezZKFOe21mnZdpjTlDhhytrZT6Yd6h6HZ07FfADdJpsxLUojeAR+fhxIv6
lg9QsGuo/h2tW77Mldhkg75YRR7ryQQ/aHHj0YtfiF9EpoV7EU0fIFMfA3PDasDP
NndunnmW159F3+zv4S7dx9UjmL9eZeNQ2Nk0aLCjZpu5UWBiqb/X5Na6YkO7AdM3
95UCpJMtYmj+hcaCIr/qms1Lw5//GF0FC6W6FMmof80qWinqRyeUj9RP8mGz9T6A
FwIDAQAB
-----END PUBLIC KEY-----";
