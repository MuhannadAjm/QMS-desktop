# Current Phase

| Field | Value |
|---|---|
| Phase | **Product Improvements — Stage 5: Security Hardening & Regression — COMPLETE** |
| Status | **Hardened development baseline** |
| Date | 2026-08-24 |
| Checkpoint tag | `improvement-checkpoint-security-regression` |
| Previous baseline | `improvement-checkpoint-pre-security-hardening` (= `improvement-checkpoint-documents`) |
| Next Stage | None scheduled. Owner's next feature phase starts from this baseline. |

## What this stage did

- **Backup and restore no longer accept a path from the renderer.** Create wrote
  the database, licence and every attachment anywhere writable; restore
  overwrote the live database after checking only that a file named `data.db`
  existed. Both now take a name or use a backend-opened dialog, and restore
  validates the candidate as a real, intact, correctly-versioned QMS database
  before anything is touched.
- **The other five modules' file commands** now use the same canonicalise-and-
  contain model Documents already had.
- **Document approval is Admin-only by default** (migration 013). The key is
  unchanged and still grantable to any role; only the shipped template changed.
- **Printing was fixed.** It had never worked.
- **Full regression** across all twelve routes, every module form, and the IPC
  boundary for Admin, Quality Manager and Viewer.

**Authoritative reference: `docs/FILE_SECURITY.md`.**

## Built-in role matrix after migration 013

| Role | Permissions | `documents.approve` |
|---|---:|---|
| Admin | 53 | yes |
| Quality Manager | 46 (was 47) | **no** |
| Auditor | 13 | no |
| Employee | 11 | no |
| Viewer | 11 | no |

Reviewed for anomalies: no non-Admin role holds user management, role
management, backup create/restore, or any destructive capability.

Non-blocking policy observations, unchanged and reported rather than altered:
Quality Manager holds `masterdata.manage` and `settings.manage`; Auditor,
Employee and Viewer hold `backup.view` (the backup list and sizes, no contents).

## Validation performed

- **114 Rust library tests**, 0 warnings.
- **Migrations against a copy of the owner's live database**: 001→013 clean,
  every business row count unchanged, `documents.approve` reduced to Admin only,
  templates 53/46/13/11/11, `integrity_check` ok, zero FK violations. The
  original database was never written to.
- **IPC boundary proven per role.** Quality Manager is denied approve/reject by
  name while keeping document view, edit, attachment and print. Viewer is denied
  every write, backup, approval, attachment, print and external-open.
- **UI regression**: all twelve routes render; CAPA enum and free-text root
  cause, dynamic risk source, complaint customer selector with read-only code,
  `ISO 9001` default, lead auditor candidates, document approve/reject, backup
  create/restore/delete, and modal scrolling on every dialog.

## Deferred — documented, NOT complete

1. Windows production code signing
2. Packaged signed GUI end-to-end validation
3. **PDF pixel rendering inside the packaged WebView.** The harness pane never
   fires `requestAnimationFrame`, which pdfjs's canvas loop needs; isolated
   conclusively in Stage 4, and the same bytes rasterised correctly through
   pdfjs's non-rAF path. Environmental, not a defect.
4. Encrypted external RSA key backup — **pre-customer gate**
5. Supabase plan-gated "Leaked Password Protection" advisor warning
6. Second real Supabase non-admin Auth user test

## Known remaining surface (reported, not changed)

- Licensing writes `license.json` before validating the result. Out of scope by
  instruction.
- `copy_dir_recursive` has no symlink/junction guard or depth cap. Only reachable
  with backend-derived directories today.
- `BackupEntry.full_path` is still returned for display; no command acts on it.
