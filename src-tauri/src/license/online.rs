//! Deciding what an online validation attempt actually means.
//!
//! The product is offline-capable. A valid locally signed token keeps working
//! with no network at all, so the client must never confuse
//!
//!     AUTHORITATIVE LICENCE DENIAL   — the server says this installation may
//!                                      not run: revoked, deactivated, unknown
//!                                      activation, wrong machine
//!
//! with
//!
//!     TECHNICAL VALIDATION FAILURE   — we could not get an answer: offline,
//!                                      DNS, timeout, 5xx, proxy, garbage body
//!
//! Getting that distinction wrong is harmful in both directions. Treat a denial
//! as technical and a revoked licence runs forever; treat an outage as a denial
//! and every paying customer is locked out the moment Supabase has a bad minute.
//!
//! Everything in this module is pure. `decide_online_outcome` takes the result
//! of the HTTP call as data and returns the decision, so every branch of the
//! deployed server contract is testable with no network and no filesystem.
//!
//! ## The contract this is written against
//!
//! `supabase/functions/validate-license/index.ts`, read line by line:
//!
//! | status | body                                                   | meaning |
//! |--------|--------------------------------------------------------|---------|
//! | 200    | the full signed token                                  | valid   |
//! | 400    | `{"error":"license_id, activation_id, and hardware_fingerprint are required"}` | our bug |
//! | 403    | `{"error":"Activation is deactivated"}` / `superseded` | denial  |
//! | 403    | `{"error":"Hardware mismatch"}`                        | denial  |
//! | 403    | `{"error":"License is revoked"}` / `suspended` / `expired` | denial |
//! | 403    | `{"error":"License has expired"}`                      | denial  |
//! | 404    | `{"error":"Activation record not found"}`              | ambiguous |
//! | 404    | `{"error":"License not found"}`                        | ambiguous |
//! | 500    | `{"error":"Internal server error"}`                    | outage  |
//!
//! Only 403 is authoritative. The two 404s fold "no such row" together with "the
//! query failed", so an infrastructure fault produces them — see the reasoning
//! at the 403 arm of `decide_online_outcome`.
//!
//! Two shapes must not be confused. The FUNCTION answers `{"error": "..."}`.
//! The Supabase PLATFORM answers `{"code": "...", "message": "..."}` — that is
//! what a missing, renamed or cold-starting function returns, and what the edge
//! emits for its own gateway failures. A platform 404 means "the function is not
//! there", which is a deployment problem, never a statement about this customer's
//! licence. So a denial requires a 403 carrying the function's own shape.

use crate::license::token::LicenseToken;

/// Why the server refused. Carried so the customer gets a message that matches
/// what actually happened rather than a generic failure.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DenialReason {
    LicenseRevoked,
    LicenseSuspended,
    LicenseExpired,
    ActivationDeactivated,
    ActivationNotFound,
    LicenseNotFound,
    HardwareMismatch,
    /// A 403 in the function's own shape whose message this build does not
    /// recognise. Still a denial: the endpoint uses 403 only to refuse. Being
    /// forward-compatible matters more than enumerating today's strings.
    Other,
}

impl DenialReason {
    /// What the customer is told. Plain, actionable, and never blames the
    /// network — by the time this is reached the network demonstrably worked.
    pub fn customer_message(&self) -> &'static str {
        match self {
            DenialReason::LicenseRevoked =>
                "This license has been revoked by the vendor and can no longer be used on this computer. Contact your supplier for a new license key.",
            DenialReason::LicenseSuspended =>
                "This license has been suspended by the vendor. Contact your supplier to restore it.",
            DenialReason::LicenseExpired =>
                "This license has expired. Contact your supplier to renew it.",
            DenialReason::ActivationDeactivated =>
                "This computer's activation has been released by the vendor. Activate again with a valid license key to continue.",
            DenialReason::ActivationNotFound =>
                "This computer is no longer registered against the license. Activate again with a valid license key to continue.",
            DenialReason::LicenseNotFound =>
                "The license this installation was activated with no longer exists. Contact your supplier.",
            DenialReason::HardwareMismatch =>
                "This license is registered to a different computer. Contact your supplier to move it.",
            DenialReason::Other =>
                "The license server refused this installation. Contact your supplier.",
        }
    }

    /// The local state a denial resolves to. Revocation, suspension and an
    /// unknown refusal are `Revoked`; the others map onto the states the product
    /// already has so the licence screen keeps saying the right thing.
    pub fn resulting_state(&self) -> crate::license::LicenseState {
        use crate::license::LicenseState as S;
        match self {
            DenialReason::LicenseExpired => S::Expired,
            DenialReason::HardwareMismatch => S::HardwareMismatch,
            DenialReason::LicenseRevoked
            | DenialReason::LicenseSuspended
            | DenialReason::ActivationDeactivated
            | DenialReason::ActivationNotFound
            | DenialReason::LicenseNotFound
            | DenialReason::Other => S::Revoked,
        }
    }

    /// Read a reason back out of a stored quarantine record. Unknown codes —
    /// a record written by a newer build, or a hand-edited one — resolve to
    /// `Other`, which still denies. Defaulting the other way would turn an
    /// unrecognised code into a free licence.
    pub fn from_code(code: &str) -> DenialReason {
        match code {
            "LICENSE_REVOKED"        => DenialReason::LicenseRevoked,
            "LICENSE_SUSPENDED"      => DenialReason::LicenseSuspended,
            "LICENSE_EXPIRED"        => DenialReason::LicenseExpired,
            "ACTIVATION_DEACTIVATED" => DenialReason::ActivationDeactivated,
            "ACTIVATION_NOT_FOUND"   => DenialReason::ActivationNotFound,
            "LICENSE_NOT_FOUND"      => DenialReason::LicenseNotFound,
            "HARDWARE_MISMATCH"      => DenialReason::HardwareMismatch,
            _                        => DenialReason::Other,
        }
    }

    /// Stable identifier written into the quarantine record, so support can read
    /// why a machine was locked out without decoding prose.
    pub fn as_code(&self) -> &'static str {
        match self {
            DenialReason::LicenseRevoked        => "LICENSE_REVOKED",
            DenialReason::LicenseSuspended      => "LICENSE_SUSPENDED",
            DenialReason::LicenseExpired        => "LICENSE_EXPIRED",
            DenialReason::ActivationDeactivated => "ACTIVATION_DEACTIVATED",
            DenialReason::ActivationNotFound    => "ACTIVATION_NOT_FOUND",
            DenialReason::LicenseNotFound       => "LICENSE_NOT_FOUND",
            DenialReason::HardwareMismatch      => "HARDWARE_MISMATCH",
            DenialReason::Other                 => "SERVER_DENIED",
        }
    }
}

/// What the client already knows from its own token, and needs in order to judge
/// one particular server answer honestly.
///
/// `validate-license` refuses the instant `expires_at` passes:
///
/// ```text
/// if (license.expires_at && new Date(license.expires_at) < new Date())
///   return json({ error: "License has expired" }, 403);
/// ```
///
/// — yet twenty lines later the same handler signs `grace_until = expires_at +
/// GRACE_DAYS` (14) into the token it issues, and `validation::validate_token`
/// deliberately honours it. So the backend refuses on day zero the very grant it
/// signed through day fourteen. Quarantining on that 403 would give an ONLINE
/// machine no grace at all where an OFFLINE one gets a fortnight — inverting the
/// product's offline-capable promise, during exactly the renewal window the
/// grace period exists to cover.
#[derive(Debug, Clone, Default)]
pub struct LocalGrace {
    /// `grace_until` from the token currently on disk, if it has one.
    pub grace_until: Option<String>,
    /// Today's date, `YYYY-MM-DD`, from the same clock `validate_token` uses for
    /// expiry and grace, so the two layers cannot disagree about the same day.
    pub today: String,
}

impl LocalGrace {
    /// Same comparison `validate_token` uses, so the two cannot disagree.
    fn still_open(&self) -> bool {
        match (&self.grace_until, self.today.as_str()) {
            (Some(g), today) if !g.is_empty() && !today.is_empty() => {
                g.split('T').next().unwrap_or(g.as_str()) > today
            }
            _ => false,
        }
    }
}

/// What the HTTP layer managed to obtain. Deliberately just data, so the whole
/// decision below can be exercised without a socket.
#[derive(Debug, Clone)]
pub enum TransportOutcome {
    /// No usable response: offline, DNS failure, timeout, TLS error, connection
    /// reset. The string is the human-readable cause, for display only.
    Unreachable(String),
    /// The server answered. Whether that answer is good news is decided here.
    Responded { status: u16, body: String },
}

/// The decision, expressed without performing it.
#[derive(Debug, Clone)]
pub enum OnlineDecision {
    /// A fresh, well-formed server-issued token. Persist it and re-validate.
    AdoptToken(Box<LicenseToken>),
    /// Authoritative denial. Quarantine the local token and report this state.
    Quarantine {
        reason: DenialReason,
        /// The server's own words, kept for the support log.
        server_message: String,
    },
    /// Change nothing. The local token stands on its own signature, exactly as
    /// it does when the machine has never been online.
    KeepLocal { note: String },
}

/// Body shape check: the function's own errors are `{"error": "..."}`.
/// The platform's are `{"code": "...", "message": "..."}`. Requiring the former,
/// and explicitly rejecting anything carrying `code`, is what stops a missing
/// deployment or an edge gateway error from being read as a revocation.
fn function_error_message(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    if !v.is_object() {
        return None;
    }
    if v.get("code").is_some() {
        return None; // platform / gateway shape, not a licensing decision
    }
    v.get("error")?.as_str().map(|s| s.to_string())
}

/// Map the server's own error text onto a reason. Matching is case-insensitive
/// and substring-based because the endpoint interpolates the database status
/// (`License is ${status.toLowerCase()}`), so the exact wording varies with the
/// row. An unrecognised 403/404 is still a denial — see `DenialReason::Other`.
fn reason_from_message(msg: &str) -> DenialReason {
    let m = msg.to_ascii_lowercase();
    if m.contains("hardware mismatch") {
        DenialReason::HardwareMismatch
    } else if m.contains("activation record not found") {
        DenialReason::ActivationNotFound
    } else if m.contains("license not found") {
        DenialReason::LicenseNotFound
    } else if m.contains("activation is deactivated") || m.contains("activation is superseded") {
        DenialReason::ActivationDeactivated
    } else if m.contains("revoked") {
        DenialReason::LicenseRevoked
    } else if m.contains("suspended") {
        DenialReason::LicenseSuspended
    } else if m.contains("expired") {
        DenialReason::LicenseExpired
    } else {
        DenialReason::Other
    }
}

/// The whole client-side policy, in one pure function.
pub fn decide_online_outcome(outcome: TransportOutcome, grace: &LocalGrace) -> OnlineDecision {
    let (status, body) = match outcome {
        // Requirement: a connectivity failure must never cost a customer their
        // licence. This is the offline path and it changes nothing.
        TransportOutcome::Unreachable(cause) => {
            return OnlineDecision::KeepLocal { note: cause };
        }
        TransportOutcome::Responded { status, body } => (status, body),
    };

    if status == 200 {
        // Fail safe on a malformed 200: grant no new authority, and equally take
        // none away. A body we cannot parse is not evidence of anything.
        return match serde_json::from_str::<LicenseToken>(&body) {
            Ok(token) => OnlineDecision::AdoptToken(Box::new(token)),
            Err(_) => OnlineDecision::KeepLocal {
                note: "The license server returned an unreadable response. Your existing license is unchanged.".to_string(),
            },
        };
    }

    // 403 is the only code that carries a licensing decision, and only when the
    // refusal arrives in the function's own error shape.
    //
    // Why not 404 as well. validate-license answers 404 from two places, and
    // both fold "no such row" together with "the query failed":
    //
    //     const { data: activation, error: actErr } = await supabase...single();
    //     if (actErr || !activation) return json({ error: "Activation record not found" }, 404);
    //
    // A PostgREST error, a privilege regression or a transient database fault
    // therefore produces a 404 in the function's own shape, indistinguishable
    // from a genuine miss. That is not hypothetical here: migration
    // 20260820170000 documents a real incident in which every licensing query
    // failed on missing table grants. Had 404 been authoritative, every
    // installation in the field would have quarantined itself.
    //
    // And there is nothing to lose by declining it. Licence and activation rows
    // are never deleted — service_role holds no DELETE grant on any licensing
    // table (20260820170000, re-asserted by 20260905010000), and license_keys is
    // referenced ON DELETE RESTRICT — so "not found" has no legitimate cause.
    // Ending a licence is done by setting its status, which answers 403.
    //
    // Every 403 arrives only AFTER its row has been read successfully, so a
    // database failure cannot manufacture one.
    if status == 403 {
        if let Some(msg) = function_error_message(&body) {
            let reason = reason_from_message(&msg);

            // The one denial the client may decline, and only while the vendor's
            // OWN signed grace window is still open. See `LocalGrace`. Once
            // grace has run out this falls through and quarantines normally.
            if reason == DenialReason::LicenseExpired && grace.still_open() {
                return OnlineDecision::KeepLocal {
                    note: format!(
                        "the license server reports it expired, and the signed grace period still applies — server said: {}",
                        msg
                    ),
                };
            }

            return OnlineDecision::Quarantine {
                reason,
                server_message: msg,
            };
        }
        return OnlineDecision::KeepLocal {
            note: "The license server returned 403 without a licensing decision. Your existing license is unchanged.".to_string(),
        };
    }

    // Everything else — 400 (we sent a bad request), 401/5xx, gateway codes —
    // is our problem or the platform's, never the customer's licence.
    OnlineDecision::KeepLocal {
        note: format!(
            "The license server could not be checked (HTTP {}). Your existing license is unchanged.",
            status
        ),
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// A 200 body exactly as validate-license emits it: the token payload plus a
    /// signature. Kept faithful to `LicenseTokenPayload` in _shared/rsa.ts.
    fn server_token_body() -> String {
        r#"{
          "license_id":"2808d856-7645-40ac-a887-f0a8254df416",
          "activation_id":"5b08b8bf-be28-4c99-a131-84e73c72170f",
          "customer_name":"ZZ-TEST","plan":"trial","max_activations":1,
          "hardware_fingerprint":"aa11bb22","issued_at":"2026-09-01T00:00:00Z",
          "activated_at":"2026-09-01T00:00:00Z","expires_at":null,
          "last_validated_at":"2026-09-05T00:00:00Z",
          "next_validation_due_at":"2026-10-05T00:00:00Z","grace_until":null,
          "features":["capa"],"license_key_last4":"WXYZ","status":"active",
          "signature":"c2lnbmF0dXJl"
        }"#
        .to_string()
    }

    fn responded(status: u16, body: &str) -> OnlineDecision {
        // No local grace: the default is the ordinary case, and it keeps every
        // pre-existing expectation in this module unchanged.
        decide_online_outcome(
            TransportOutcome::Responded { status, body: body.to_string() },
            &LocalGrace::default(),
        )
    }

    fn unreachable_outcome(cause: &str) -> OnlineDecision {
        decide_online_outcome(
            TransportOutcome::Unreachable(cause.to_string()),
            &LocalGrace::default(),
        )
    }

    fn denial_reason(d: &OnlineDecision) -> DenialReason {
        match d {
            OnlineDecision::Quarantine { reason, .. } => *reason,
            other => panic!("expected Quarantine, got {:?}", other),
        }
    }

    // ── Technical failure must never invalidate ───────────────────────────────

    #[test]
    fn offline_keeps_the_local_license() {
        let d = unreachable_outcome("Cannot reach the license server");
        assert!(matches!(d, OnlineDecision::KeepLocal { .. }));
    }

    #[test]
    fn timeout_keeps_the_local_license() {
        let d = unreachable_outcome("Connection timeout");
        assert!(matches!(d, OnlineDecision::KeepLocal { .. }));
    }

    #[test]
    fn server_500_keeps_the_local_license() {
        let d = responded(500, r#"{"error":"Internal server error"}"#);
        assert!(
            matches!(d, OnlineDecision::KeepLocal { .. }),
            "a backend outage must not cost a paying customer their licence"
        );
    }

    #[test]
    fn gateway_5xx_and_html_keep_the_local_license() {
        for (status, body) in [
            (502u16, "<html><body>Bad Gateway</body></html>"),
            (503, r#"{"message":"Service Unavailable"}"#),
            (504, ""),
            (546, r#"{"code":"BOOT_ERROR","message":"Worker failed to boot"}"#),
        ] {
            assert!(
                matches!(responded(status, body), OnlineDecision::KeepLocal { .. }),
                "HTTP {} must be treated as technical, not authoritative",
                status
            );
        }
    }

    /// 400 means this client sent a malformed request. That is our defect, and
    /// punishing the customer for it would be the worst possible response.
    #[test]
    fn bad_request_is_our_bug_not_a_denial() {
        let d = responded(
            400,
            r#"{"error":"license_id, activation_id, and hardware_fingerprint are required"}"#,
        );
        assert!(matches!(d, OnlineDecision::KeepLocal { .. }));
    }

    /// The critical false-positive guard: a 404 from the PLATFORM means the
    /// function is missing or renamed. It must never read as a revocation.
    #[test]
    fn platform_404_for_a_missing_function_is_not_a_denial() {
        let d = responded(
            404,
            r#"{"code":"NOT_FOUND","message":"Requested function was not found"}"#,
        );
        assert!(
            matches!(d, OnlineDecision::KeepLocal { .. }),
            "a deployment problem must not revoke every customer in the field"
        );
    }

    #[test]
    fn platform_401_is_not_a_denial() {
        let d = responded(
            401,
            r#"{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}"#,
        );
        assert!(matches!(d, OnlineDecision::KeepLocal { .. }));
    }

    #[test]
    fn forbidden_without_the_function_error_shape_is_not_a_denial() {
        // e.g. a corporate proxy or WAF answering 403 with its own page
        let d = responded(403, "<html>Blocked by policy</html>");
        assert!(matches!(d, OnlineDecision::KeepLocal { .. }));
    }

    // ── Authoritative denial must invalidate ──────────────────────────────────

    #[test]
    fn revoked_license_is_an_authoritative_denial() {
        let d = responded(403, r#"{"error":"License is revoked"}"#);
        assert_eq!(denial_reason(&d), DenialReason::LicenseRevoked);
        assert_eq!(
            DenialReason::LicenseRevoked.resulting_state(),
            crate::license::LicenseState::Revoked
        );
    }

    #[test]
    fn deactivated_activation_is_an_authoritative_denial() {
        let d = responded(403, r#"{"error":"Activation is deactivated"}"#);
        assert_eq!(denial_reason(&d), DenialReason::ActivationDeactivated);
    }

    #[test]
    fn superseded_activation_is_an_authoritative_denial() {
        let d = responded(403, r#"{"error":"Activation is superseded"}"#);
        assert_eq!(denial_reason(&d), DenialReason::ActivationDeactivated);
    }

    #[test]
    fn suspended_and_expired_licenses_are_denials_with_their_own_states() {
        assert_eq!(
            denial_reason(&responded(403, r#"{"error":"License is suspended"}"#)),
            DenialReason::LicenseSuspended
        );
        assert_eq!(
            denial_reason(&responded(403, r#"{"error":"License is expired"}"#)),
            DenialReason::LicenseExpired
        );
        assert_eq!(
            denial_reason(&responded(403, r#"{"error":"License has expired"}"#)),
            DenialReason::LicenseExpired
        );
        assert_eq!(
            DenialReason::LicenseExpired.resulting_state(),
            crate::license::LicenseState::Expired
        );
    }

    // ── The grace period the backend signs but does not honour ────────────────

    fn responded_with_grace(
        status: u16,
        body: &str,
        grace_until: Option<&str>,
        today: &str,
    ) -> OnlineDecision {
        decide_online_outcome(
            TransportOutcome::Responded { status, body: body.to_string() },
            &LocalGrace {
                grace_until: grace_until.map(|s| s.to_string()),
                today: today.to_string(),
            },
        )
    }

    /// The regression this guard exists for. validate-license refuses the moment
    /// `expires_at` passes, but signs `grace_until = expires_at + 14 days` into
    /// the token, and validate_token honours it. Without this, an ONLINE machine
    /// would get zero grace where an OFFLINE one gets a fortnight — locking out
    /// every dated licence on the first launch after expiry, during exactly the
    /// renewal window grace exists to cover.
    #[test]
    fn an_expiry_403_inside_the_signed_grace_period_keeps_the_local_license() {
        for body in [
            r#"{"error":"License has expired"}"#,
            r#"{"error":"License is expired"}"#,
        ] {
            let d = responded_with_grace(403, body, Some("2026-09-18T00:00:00Z"), "2026-09-05");
            assert!(
                matches!(d, OnlineDecision::KeepLocal { .. }),
                "{} inside grace must not quarantine",
                body
            );
        }
    }

    /// Once grace has actually run out, the same answer is authoritative.
    #[test]
    fn an_expiry_403_after_grace_has_run_out_quarantines() {
        let d = responded_with_grace(
            403,
            r#"{"error":"License has expired"}"#,
            Some("2026-09-01T00:00:00Z"),
            "2026-09-05",
        );
        assert_eq!(denial_reason(&d), DenialReason::LicenseExpired);
    }

    /// A licence with no grace window at all gets none.
    #[test]
    fn an_expiry_403_with_no_grace_window_quarantines() {
        let d = responded_with_grace(403, r#"{"error":"License has expired"}"#, None, "2026-09-05");
        assert_eq!(denial_reason(&d), DenialReason::LicenseExpired);
    }

    /// Grace is an expiry concept only. It must never soften a revocation — that
    /// would hand a revoked licence another fortnight of use.
    #[test]
    fn an_open_grace_window_does_not_soften_any_other_denial() {
        for (body, expected) in [
            (r#"{"error":"License is revoked"}"#, DenialReason::LicenseRevoked),
            (r#"{"error":"License is suspended"}"#, DenialReason::LicenseSuspended),
            (r#"{"error":"Activation is deactivated"}"#, DenialReason::ActivationDeactivated),
            (r#"{"error":"Hardware mismatch"}"#, DenialReason::HardwareMismatch),
            (r#"{"error":"Something new"}"#, DenialReason::Other),
        ] {
            let d = responded_with_grace(403, body, Some("2099-01-01T00:00:00Z"), "2026-09-05");
            assert_eq!(denial_reason(&d), expected, "grace must not soften {}", body);
        }
    }

    /// The grace comparison must match `validate_token`'s exactly, or the two
    /// layers would disagree about the same day. Both use `grace_date > today`,
    /// so the last day of grace is exclusive.
    #[test]
    fn the_grace_boundary_matches_local_validation() {
        // grace_until == today: local validation would NOT return Active, so the
        // denial must stand.
        let d = responded_with_grace(
            403,
            r#"{"error":"License has expired"}"#,
            Some("2026-09-05T00:00:00Z"),
            "2026-09-05",
        );
        assert_eq!(denial_reason(&d), DenialReason::LicenseExpired);
    }

    #[test]
    fn hardware_mismatch_is_a_denial_and_keeps_its_own_state() {
        let d = responded(403, r#"{"error":"Hardware mismatch"}"#);
        assert_eq!(denial_reason(&d), DenialReason::HardwareMismatch);
        assert_eq!(
            DenialReason::HardwareMismatch.resulting_state(),
            crate::license::LicenseState::HardwareMismatch
        );
    }

    /// The endpoint's own 404s fold "no such row" together with "the query
    /// failed" (`if (actErr || !activation)`), so a privilege regression or a
    /// database fault produces one in the function's own shape. Migration
    /// 20260820170000 records exactly such an incident. Treating 404 as
    /// authoritative would have quarantined every installation in the field.
    ///
    /// Nothing is lost by declining it: no licensing table grants DELETE to any
    /// role, so "not found" has no legitimate cause, and ending a licence sets a
    /// status — which answers 403.
    #[test]
    fn the_endpoints_own_404s_are_infrastructure_not_revocation() {
        for body in [
            r#"{"error":"Activation record not found"}"#,
            r#"{"error":"License not found"}"#,
        ] {
            assert!(
                matches!(responded(404, body), OnlineDecision::KeepLocal { .. }),
                "404 {:?} must not revoke — a failed query is indistinguishable from a missing row",
                body
            );
        }
    }

    /// Those reasons remain part of the vocabulary so a quarantine record
    /// written by a different build still reads back as a denial rather than
    /// falling open.
    #[test]
    fn not_found_reasons_still_deny_when_read_from_a_stored_record() {
        for r in [DenialReason::ActivationNotFound, DenialReason::LicenseNotFound] {
            assert_eq!(DenialReason::from_code(r.as_code()), r);
            assert_ne!(r.resulting_state(), crate::license::LicenseState::Active);
        }
    }

    /// Forward compatibility: if the backend adds a refusal this build has never
    /// seen, it is still a refusal. Falling back to "keep local" there would let
    /// a future revocation reason be ignored by every deployed client.
    #[test]
    fn an_unrecognised_403_in_the_function_shape_is_still_a_denial() {
        let d = responded(403, r#"{"error":"License seat quota exceeded"}"#);
        assert_eq!(denial_reason(&d), DenialReason::Other);
        assert_eq!(
            DenialReason::Other.resulting_state(),
            crate::license::LicenseState::Revoked
        );
    }

    // ── Success ───────────────────────────────────────────────────────────────

    #[test]
    fn a_valid_signed_token_is_adopted() {
        match responded(200, &server_token_body()) {
            OnlineDecision::AdoptToken(t) => {
                assert_eq!(t.status, "active");
                assert_eq!(t.plan, "trial");
                assert_eq!(
                    t.activation_id.as_deref(),
                    Some("5b08b8bf-be28-4c99-a131-84e73c72170f")
                );
            }
            other => panic!("expected AdoptToken, got {:?}", other),
        }
    }

    /// Fail safe in the direction that grants nothing: an unparseable 200 must
    /// not be adopted as a token, and must not be read as a revocation either.
    #[test]
    fn a_malformed_200_grants_no_authority_and_takes_none_away() {
        for body in [
            "not json at all",
            "{}",
            r#"{"error":"unexpected"}"#,
            r#"{"license_id":"only-this-field"}"#,
            "",
        ] {
            let d = responded(200, body);
            assert!(
                matches!(d, OnlineDecision::KeepLocal { .. }),
                "malformed 200 body {:?} must be inert",
                body
            );
        }
    }

    /// Bodies captured verbatim from the DEPLOYED backend
    /// (ojomsgphjljypxodbxyu, 2026-09-05), so this is the real contract rather
    /// than a reading of the source. Probe 1 used the project's own disposable
    /// E2E record, retired by migration 20260820180000; the rest used unknown
    /// ids and malformed bodies. All read-only.
    ///
    /// If a future backend change alters any of these shapes, this test fails
    /// and the classifier is corrected before a build ships — rather than the
    /// field discovering it as a mass lockout or a revocation that never lands.
    #[test]
    fn the_live_backend_contract_is_classified_as_expected() {
        // A genuine authoritative denial from production.
        assert_eq!(
            denial_reason(&responded(403, r#"{"error":"Activation is deactivated"}"#)),
            DenialReason::ActivationDeactivated
        );

        // The endpoint's own 404 — indistinguishable from a failed query.
        for body in [
            r#"{"error":"Activation record not found"}"#,
            r#"{"error":"License not found"}"#,
        ] {
            assert!(matches!(responded(404, body), OnlineDecision::KeepLocal { .. }));
        }

        // Our own bad request, and a backend fault.
        assert!(matches!(
            responded(
                400,
                r#"{"error":"license_id, activation_id, and hardware_fingerprint are required"}"#
            ),
            OnlineDecision::KeepLocal { .. }
        ));
        assert!(matches!(
            responded(500, r#"{"error":"Internal server error"}"#),
            OnlineDecision::KeepLocal { .. }
        ));

        // The platform shape, which must never be read as a licensing decision.
        assert!(matches!(
            responded(404, r#"{"code":"NOT_FOUND","message":"Requested function was not found"}"#),
            OnlineDecision::KeepLocal { .. }
        ));
    }

    /// Every reason must survive the round trip through the stored quarantine
    /// record, and an unknown code must still deny rather than fall open.
    #[test]
    fn reason_codes_round_trip_and_unknown_codes_still_deny() {
        for r in [
            DenialReason::LicenseRevoked,
            DenialReason::LicenseSuspended,
            DenialReason::LicenseExpired,
            DenialReason::ActivationDeactivated,
            DenialReason::ActivationNotFound,
            DenialReason::LicenseNotFound,
            DenialReason::HardwareMismatch,
            DenialReason::Other,
        ] {
            assert_eq!(DenialReason::from_code(r.as_code()), r);
        }
        assert_eq!(
            DenialReason::from_code("SOMETHING_A_FUTURE_BUILD_WROTE"),
            DenialReason::Other
        );
        assert_eq!(DenialReason::from_code(""), DenialReason::Other);
        assert_ne!(
            DenialReason::from_code("").resulting_state(),
            crate::license::LicenseState::Active
        );
    }

    /// Every denial must produce customer-facing text, and none of it may blame
    /// the network — the network provably worked to get here.
    #[test]
    fn denial_messages_are_present_and_never_blame_connectivity() {
        for r in [
            DenialReason::LicenseRevoked,
            DenialReason::LicenseSuspended,
            DenialReason::LicenseExpired,
            DenialReason::ActivationDeactivated,
            DenialReason::ActivationNotFound,
            DenialReason::LicenseNotFound,
            DenialReason::HardwareMismatch,
            DenialReason::Other,
        ] {
            let m = r.customer_message().to_ascii_lowercase();
            assert!(!m.is_empty());
            assert!(!m.contains("internet"), "{:?} blames connectivity", r);
            assert!(!m.contains("offline"), "{:?} blames connectivity", r);
            assert!(!r.as_code().is_empty());
        }
    }
}
