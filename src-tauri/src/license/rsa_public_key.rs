// RSA-2048 Public Key — QMS Desktop License Verification
//
// This is the PRODUCTION key.
// The matching PRIVATE KEY lives in the Supabase Edge Function environment variable
// LICENSE_PRIVATE_KEY_PEM and NEVER in this binary.
//
// The public key is safe to embed — it can only verify signatures, not create them.
//
// Key format: SPKI (SubjectPublicKeyInfo) PEM — RSA-2048.

pub const LICENSE_PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwR825cZFYj8Q+5IvlWWd
drgv1TyvhzkkKcRsRgvSNM45khwSD30Da5YHOuMfMOnlnpI4F+A0d21MsKybMfrc
J3t7Wo1CxH21TUZYODAbRjAIPzF/uzAfnkKxJz+tUiQ+2dLNO8ZvVdKVphMAd4Xd
qjANVyzTmbFTq38eRPHI2pTNRcHLLIsuD9YwxT/8wCaauSKd8u0B7ExTVRjCrZRz
GWJ8VuSseRdpQMtaXKhWHKlEKouS0ERNIvuGUf1qTiiwomDnqDrZfQSMO4P6rZL9
XpQxIq2ecPcfML3coFORZGTBjllSyW77Kr+RQ8Cuts+TaDSD42ul1zvZMWTzo58h
IwIDAQAB
-----END PUBLIC KEY-----";
