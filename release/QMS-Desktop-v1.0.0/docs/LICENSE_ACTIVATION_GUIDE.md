# QMS Desktop — License Activation Guide

## Version 1.0.0

---

## Overview

QMS Desktop requires a valid license before the application can be used. Activation binds the license to your specific machine using a hardware fingerprint. After activation, the app works fully offline.

---

## What You Need

- Your **license key** (format: `QMS-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX`)
- An **internet connection** (required for the initial activation only)

---

## Activating Your License

1. Launch QMS Desktop
2. The **License Activation** screen appears automatically if no valid license is present
3. Paste or type your license key in the **License Key** field
4. Click **Activate Online**
5. The app contacts the license server to verify the key and bind it to your machine
6. On success, the license badge in the top bar turns green and the app proceeds to login

**Your license key is sent securely over HTTPS and is never stored on disk.** Only the signed license token (which cannot be used to extract the key) is saved locally.

---

## After Activation

- The app works fully offline after activation
- Your hardware fingerprint is displayed on the License page (Help → Tools → License, or navigate to License from the Tools menu)
- Periodic re-validation may occur in the background when the app is online

---

## Internet Connection Not Available

If you cannot connect to the internet at activation time:
- The activation will fail with: *"Cannot reach the license server. Check your internet connection and try again."*
- The license page remains open
- Try again when internet access is available
- Once activated, the app does not require internet for normal use

---

## Activation Limit

Each license key has a maximum number of active devices. If the limit is reached, you will see:

> *"This license has reached its maximum number of active devices."*

To resolve:
1. Contact support at `support@qmsdesktop.com`
2. Provide your license key and the machine you wish to deactivate
3. Support will free an activation slot so you can activate on the new machine

---

## Viewing License Details

After activation, you can view your license details from:
- **Top bar badge** — colored indicator (green = valid, amber = expiring/grace, red = invalid)
- **Tools menu → License** — full details page with status, customer name, plan, expiry date

The License page shows:
- License status (Active, Expiring Soon, Grace Period, Expired, etc.)
- Customer name
- Plan name
- Expiry date (or "Never" for perpetual licenses)
- Hardware fingerprint (shortened — for support reference)

---

## Updating or Replacing a License Key

To replace your license key (e.g., after a plan upgrade):

1. Navigate to **Tools → License**
2. On the Active license card, click **Update License Key**
3. Enter the new license key
4. Click **Activate**
5. If activation succeeds, the new license replaces the old one
6. If activation fails, the existing license remains active — no data loss

---

## Offline Use After Activation

After successful activation:
- The app validates the license locally using the stored signed token
- No internet connection is needed for day-to-day use
- If the license has an expiry date, a grace period allows continued offline use for a number of days after expiry before re-validation is required
- When internet is available, the app may re-validate in the background to extend the grace window

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| "Invalid license key" | Check for typos. The key format is `QMS-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX` (uppercase, hyphens). |
| "Cannot reach the license server" | Check your internet connection. Try again. If behind a proxy or firewall, ensure `https://ojomsgphjljypxodbxyu.supabase.co` is reachable. |
| "License has reached its maximum number of active devices" | Contact support to deactivate an old machine. |
| "License is not valid for this machine" | The license is bound to a different machine's hardware. Contact support. |
| App shows license invalid after reinstall | AppData (including license.json) is preserved across reinstalls. If the license shows invalid, re-run activation from Tools → License. |
| License badge missing | The badge is hidden until after the first license check on startup. If it remains missing after login, open Tools → License to check status. |

---

## Support

**Email:** `support@qmsdesktop.com`

When contacting support, include:
- Your license key (last 4 characters only — never the full key in unsecured email)
- Your QMS Desktop version (shown in Help → About)
- The error message you see
- Your operating system version

---

*QMS Desktop v1.0.0 — © 2026 QMS Desktop. All rights reserved.*
