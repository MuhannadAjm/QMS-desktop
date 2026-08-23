# Roles & Permissions (RBAC)

Authoritative reference for how QMS Desktop decides what a user may do.
Supersedes every earlier description of role-based access in `docs/reports/`,
which describe the hard-coded role guards this replaced.

---

## 1. The model

Four tables, added by migration `010_rbac.sql`:

| Table | Holds |
|---|---|
| `roles` | 5 seeded system roles, plus any custom roles created in the product |
| `permissions` | The fixed registry of 53 capability keys |
| `role_permissions` | The template: which keys a role grants by default |
| `user_permission_overrides` | Per-user exceptions, `ALLOW` or `DENY` |

`users.role_id` points at the assigned role. The legacy `users.role` string is
still written alongside it for backward compatibility, but **nothing reads it for
authorization any more**.

A permission key is `<module>.<action>` — `capa.edit`, `backup.restore`,
`audits.finding_manage`. Modules and actions are not a matrix: only the actions a
module actually has exist as keys, so there is no `capa.delete` implying a
capability the product does not have.

### Resolution order

`permissions::effective_permissions(conn, user_id)` is the single source of
truth. It returns an empty set — no permissions at all — if **any** of these hold:

1. the user is inactive, or
2. the user has no role, or
3. the assigned role is inactive.

Otherwise it starts from the role template and applies overrides:

```
DENY  >  ALLOW  >  role template
```

A stored override never resurrects access through an inactive role: the
short-circuit above happens first. Deactivating a role therefore removes access
for everyone holding it, immediately and without editing their overrides — and
reactivating it restores exactly the current template, not a snapshot of what it
was when the role was switched off.

### Roles are never deleted

Roles are referenced by user accounts and by the activity history, so deleting
one would orphan records and falsify the audit trail. `is_active` is the only
lever. `role_key` is derived once from the name and is then immutable, so
renaming a role cannot detach its users or break anything referencing it.

---

## 2. Enforcement

Authorization happens in Rust, in the command layer, on every call:

```rust
permissions::require_permission(current_user_id, "capa.edit")?;
permissions::require_any_permission(current_user_id, &["capa.create", "capa.edit"])?;
```

There is no other authorization mechanism. The pre-RBAC helpers
(`require_admin`, `require_admin_or_quality_manager`, and the rest) have been
deleted, not deprecated, so a new command cannot accidentally reach for one.

**The UI is not a security boundary.** `usePermissionStore` hides controls the
user cannot use, and that is all it does. It fails closed — a failed load yields
an empty set — but bypassing it changes nothing, because the command re-checks.

---

## 3. The lockout invariant

It must never become impossible to administer the system.

```rust
pub const CONTROL_PERMISSIONS: [&str; 2] = ["users.manage", "roles.manage"];
```

A *control path* is an active user, on an active role, whose **effective**
permissions include both keys. `assert_control_path_retained` refuses any change
that would leave zero such users, and every one of the seven commands that can
change authority calls it **inside its transaction**, on the resulting state:

| Command | Vector it closes |
|---|---|
| `set_user_status` | deactivating the last administrator |
| `update_user` | moving them to a weaker role |
| `set_user_role` | the same, from the RBAC screen |
| `set_user_override` | denying `users.manage` or `roles.manage` to them |
| `reset_user_overrides` | clearing an ALLOW that was their only route |
| `set_role_active` | deactivating the role that carried them |
| `set_role_permissions` | stripping a control key from that role |

Two properties matter and are tested:

- It is computed from **effective permissions**, never from the role name
  `"Admin"`. A custom role holding both keys is a valid control path, so an
  organisation can replace the built-in Admin role entirely.
- Holding only one of the two keys does not count. Partial control is not
  control.

---

## 4. Seeded templates

Migration `010` derives the templates from what the deleted role guards actually
allowed; `011_rbac_template_parity.sql` corrects the two places where the
derivation drifted.

| Role | Keys | Shape |
|---|---:|---|
| Admin | 53 | everything |
| Quality Manager | 47 | everything except user/role administration and backup create/restore |
| Auditor | 13 | read-only, plus `audits.finding_manage` and `reports.run` |
| Employee | 11 | read-only across the quality modules |
| Viewer | 11 | read-only, narrower module set |

The user directory (`users.view`) is Admin-only, matching the pre-RBAC guard. A
widening there would leak the directory the moment `list_users` moved to a
permission check, which is why `011` removes it from Quality Manager and Auditor.

These exact counts are asserted in `shipped_schema_tests` against the real
migration files, so any edit to `010` or `011` that changes a role's reach fails
the build rather than shipping as a silent privilege change.

---

## 5. Administration surfaces

**Roles & Permissions** (`/roles`, needs `roles.view`; editing needs
`roles.manage`) — role list with user and permission counts, create, rename
(custom roles only), activate/deactivate, and the permission template editor.

**Users → the shield action** (needs `users.view`; editing needs `users.manage`)
— one user's role, their per-user exceptions, their assignment eligibility, and a
summary of what those resolve to.

Both use `PermissionMatrix`, which groups the 53 keys by module in collapsible
sections. In user mode each key has three states — **Use Role Default**,
**Allow**, **Deny** — and the default option displays the value it currently
resolves to, so the outcome is visible without knowing the word "override".

The effective set shown is always `effective` from the backend, re-fetched after
every change. It is never recomputed in the browser: a UI that predicts authority
eventually disagrees with the engine that enforces it, and the disagreement looks
like a permissions bug.

### Eligibility is not permission

`users.can_be_capa_responsible` and `users.can_be_lead_auditor` decide who
appears in the CAPA responsible and lead auditor selectors. They are deliberately
separate from permissions: being *selectable to own* a record is not the same as
being *allowed to change* it. Migration `008` backfilled them from the legacy
role so existing dropdowns did not empty on upgrade.

---

## 6. Auditing

Every RBAC mutation writes to `activity_log`, and the writes that happen inside a
transaction commit atomically with the change they describe:

| Action | Written by |
|---|---|
| `ROLE_CREATED`, `ROLE_UPDATED` | `create_role`, `update_role` |
| `ROLE_ACTIVATED` / `ROLE_DEACTIVATED` | `set_role_active` |
| `ROLE_TEMPLATE_CHANGED` | `set_role_permissions` |
| `ROLE_CHANGED` | `set_user_role` |
| `PERMISSION_OVERRIDE` | `set_user_override`, `reset_user_overrides` |
| `ELIGIBILITY` | `set_user_eligibility` |

---

## 7. Test coverage

`src-tauri/src/permissions.rs` carries three test modules:

- `rbac_tests` — resolution order, the three empty-set conditions, and the
  control-path definition.
- `propagation_tests` — that template edits reach existing users, that explicit
  overrides survive template changes in both directions, and the six lockout
  vectors above, including that a second custom-role control path unblocks a
  change that would otherwise be refused.
- `shipped_schema_tests` — runs the **actual migration files** into a scratch
  database and asserts the registry size, the five template sizes, the resolved
  access boundaries, and the control path. The other two modules build their
  schema inline, which proves intent but cannot catch drift in the shipped SQL.

---

## 8. Known limitation

GUI-level validation of these screens has not been performed on the development
machine: Smart App Control is enforced (`VerifiedAndReputablePolicyState = 1`)
and blocks freshly built unsigned binaries. Disabling it is out of scope by
instruction, and code signing is deferred. The engine, the migrations, and the
lockout invariant are covered by the tests above and by a migration run against a
copy of a real production database; the rendered UI is not.
