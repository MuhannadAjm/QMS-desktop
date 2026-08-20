# QMS Licensing — Key Custody

Status: **procedure defined and ready to execute. Encrypted backup NOT yet created.**

> ### ⛔ PRE-CUSTOMER OPERATIONAL GATE
>
> Creating the encrypted external backup is a **blocking prerequisite for first
> customer delivery**. It is deliberately *not* a blocker for continued
> development against the recovered baseline.
>
> Until it is done, the production signing key exists as a single unencrypted
> copy in the working tree plus one copy in the Supabase secret store, with no
> tested recovery path. Losing both means no licence can ever again be issued,
> renewed, or moved to another machine — for any customer, permanently.
>
> Deferred only because the passphrase and physical destination are owner
> decisions that cannot be made on the owner's behalf. Priority: **HIGH.**

---

## What must be protected

| Artifact | Location | Sensitivity |
|---|---|---|
| `license_private_key.pem` | repo root, gitignored | **Secret.** Signs every licence. |
| `license_hash_secret.txt` | repo root, gitignored | **Secret.** Peppers the licence-key hash. |
| `LICENSE_PRIVATE_KEY_PEM` | Supabase secret, `qms-licensing-prod` | Server-side copy of the private key. |
| `LICENSE_KEY_HASH_SECRET` | Supabase secret, `qms-licensing-prod` | Server-side copy of the hash pepper. |
| `license_public_key.pem` | repo root | Public. Safe to publish. |
| `rsa_public_key.rs` | `src-tauri/src/license/` | Public. Compiled into every build. |

## Production key identity

The live production key pair is identified by its **SPKI SHA-256 fingerprint**:

```
9f603a7b697b75f59d672027779fb8d8adc17aef8729938da0c71c64e1f02700
```

Any build whose embedded public key does not fingerprint to this value **cannot
verify any licence you issue**. Verify before shipping:

```bash
openssl pkey -in license_private_key.pem -pubout -outform DER | openssl dgst -sha256
openssl pkey -pubin -in license_public_key.pem  -outform DER | openssl dgst -sha256
```

Both must print the value above. To check a compiled binary, extract the PEM
between the `BEGIN PUBLIC KEY` / `END PUBLIC KEY` markers and fingerprint it the
same way.

### Retired keys — never reinstate

| Fingerprint | Status |
|---|---|
| `8780137f…4859b17da` | **Retired 2026-08-20.** Private half was exposed in a tooling transcript. Had signed zero production licences. |
| `5d029b8f…cf692be83` | Superseded. Embedded in the 15-Jun build only; never matched any issued licence. |

## Loss and leak consequences

**If the private key is lost** — no new licences can be issued, and no existing
licence can be re-issued or moved to another machine. Already-activated
installations keep working, because validation is local against the embedded
public key. Recovery requires generating a new pair, rebuilding, redistributing
the application, and re-issuing every outstanding licence.

**If the private key leaks** — anyone can mint licences that every deployed build
accepts. There is no revocation channel for a forged token, because tokens are
verified offline. Recovery is the same forced rotation as above.

**If the hash secret is lost or changed** — every row in `license_keys` stores
`SHA-256(key + ":" + LICENSE_KEY_HASH_SECRET)`. A different secret makes every
issued licence key permanently unrecognisable to `activate-license`. Note that
`generate-license-keys.cjs` overwrites this file; it is now guarded behind an
explicit flag for exactly this reason.

## Rules

1. Never commit key material. `.gitignore` covers `*.pem`, `license_hash_secret.txt`
   and `.env*`. Verified: no `.pem`, hash secret, or `.env.local` appears in any
   reachable commit.
2. Never print key material to a console, log, transcript, screenshot, or issue.
3. Never paste it into chat, a ticket, a document, or general-purpose cloud storage.
4. Rotation is owner-approved only and requires the full sequence in
   `supabase/README_LICENSE_SERVER.md` step 8.
5. The Supabase secret is set from a file that is deleted immediately afterwards,
   never from shell history.

## Backup procedure

Encrypt before the key ever leaves the working tree. Run from the repo root; you
will be prompted for a passphrase interactively so it never reaches shell history:

```bash
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
  -in license_private_key.pem -out qms-license-private-key.enc
```

Do the same for `license_hash_secret.txt`. Then:

- Store the two `.enc` files on **two** separate offline media (e.g. two encrypted
  USB keys kept in different physical locations), or in a dedicated password
  manager's secure-file store.
- Store the passphrase separately from the encrypted files. A passphrase kept
  beside the ciphertext is not a backup, it is a copy.
- Record the fingerprint `9f603a7b…e1f02700` alongside the backup so a future
  restorer can confirm they recovered the right key.

## Recovery procedure

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in qms-license-private-key.enc -out license_private_key.pem
```

Then verify before trusting it:

```bash
openssl pkey -in license_private_key.pem -pubout -outform DER | openssl dgst -sha256
# must print 9f603a7b697b75f59d672027779fb8d8adc17aef8729938da0c71c64e1f02700
```

If it does not match, the restored file is the wrong key — stop, do not set it as
`LICENSE_PRIVATE_KEY_PEM`, and do not rebuild.

Verify the backup is restorable **now**, not at the moment you need it: decrypt to
a scratch path, fingerprint it, delete the scratch copy.

## Outstanding

- [ ] Encrypted backup not yet created. Needs an owner decision on passphrase and
      physical destination; neither can be chosen on the owner's behalf.
- [ ] Restore drill not yet performed.
- [ ] Consider whether the Supabase secret should be treated as the primary copy
      with the local file removed from the working tree entirely, reducing the
      number of plaintext copies from two to one.
