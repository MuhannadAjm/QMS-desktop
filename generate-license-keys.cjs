const { generateKeyPairSync, randomBytes } = require("crypto");
const fs = require("fs");

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

fs.writeFileSync("license_private_key.pem", privateKey);
fs.writeFileSync("license_public_key.pem", publicKey);
fs.writeFileSync("license_hash_secret.txt", randomBytes(32).toString("hex"));

console.log("Generated:");
console.log("- license_private_key.pem");
console.log("- license_public_key.pem");
console.log("- license_hash_secret.txt");
