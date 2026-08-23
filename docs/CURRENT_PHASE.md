# Current Phase

| Field | Value |
|---|---|
| Phase | **Product Improvements — Stage 2: RBAC — COMPLETE** |
| Status | **Roles and permissions are the only authorization system** |
| Date | 2026-08-23 |
| Checkpoint tag | `improvement-checkpoint-rbac` |
| Previous baseline | `improvement-checkpoint-pre-rbac` |
| Next Stage | Stage 3 — form and UX fixes. **Stage 4 (Documents) not started.** |

## What this stage did

The app previously decided authority from a role *name* — five hard-coded
strings, checked in 99 places in Rust and again, separately, in the UI. Roles are
now data, and a permission is the only thing anyone checks.

- **Schema** (migrations `010`, `011`): `roles`, `permissions`,
  `role_permissions`, `user_permission_overrides`, and `users.role_id`. 53
  permission keys, 5 seeded system roles whose templates were derived from what
  the old guards actually allowed.
- **Engine** (`permissions.rs`): one resolver, `DENY > ALLOW > role template`,
  returning an empty set for an inactive user, an inactive role, or no role.
- **Enforcement**: every command now calls `require_permission` /
  `require_any_permission`. The legacy guards were **deleted**, not deprecated,
  so a new command cannot reach for one.
- **Lockout invariant**: it cannot become impossible to administer the system.
  Computed from effective permissions, never from the name "Admin", so a custom
  role can replace the built-in one. All seven authority-changing commands assert
  it inside their transaction.
- **Administration UI**: a Roles & Permissions page and a per-user permissions
  modal, sharing a 53-key matrix grouped by module. User mode has three states —
  Use Role Default / Allow / Deny — with the default showing what it resolves to.
- **UI authorization**: nav entries, report availability, and the create/edit
  affordances on ten pages now follow effective permissions. This was a real
  defect once roles became editable: a user on a custom role matched none of the
  hard-coded lists and would have seen an empty sidebar regardless of what the
  role granted.

**Authoritative reference: `docs/RBAC.md`.**

## Validation performed

- 59 Rust library tests, including `shipped_schema_tests`, which runs the real
  migration files rather than a restatement of them. Verified as a tripwire: a
  deliberate one-key widening of the Viewer template failed the run.
- Migrations applied to a **copy of a real production database** sitting at
  migration 007. All four applied cleanly; every pre-existing row count was
  unchanged; `role_id`, eligibility, and `risks.source_id` all backfilled
  correctly; `integrity_check` ok with zero foreign-key violations; re-running
  the migrations was a no-op.
- `cargo check` clean with zero warnings; `tsc` + `vite build` clean; the full
  Tauri release build produces MSI and NSIS bundles.

## Deferred (recorded, not passed)

1. Windows production code signing
2. Signed-build GUI activation / offline-reopen acceptance
3. Encrypted external RSA key backup — **pre-customer gate**
4. Real second-Auth-user negative authorization test
5. Supabase Pro-only "Leaked Password Protection" advisor warning
6. **End-to-end validation in a packaged build.** Smart App Control is enforced
   on the build machine (`VerifiedAndReputablePolicyState = 1`) and blocks
   freshly built unsigned binaries; disabling it is out of scope by instruction.
   The RBAC screens *were* validated in a browser against a temporary mock IPC
   layer (see `docs/RBAC.md` §8), so the rendering and state logic are proven.
   What is not proven is the real IPC boundary: argument casing between
   TypeScript and Rust on the new commands, and writes persisting. First thing
   to exercise once a signed build can run.
7. `write_text_file` in `files.rs` — first priority for Documents Stage 4, and
   deliberately untouched here.
