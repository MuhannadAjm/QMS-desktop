# Current Phase

| Field | Value |
|---|---|
| Phase | **Product Improvements — Stage 4: Secure Document Control — COMPLETE** |
| Status | **Arbitrary-write primitive removed; documents viewed, controlled and approved in-app** |
| Date | 2026-08-23 |
| Checkpoint tag | `improvement-checkpoint-documents` |
| Previous baseline | `improvement-checkpoint-pre-documents` (= `improvement-checkpoint-master-data-forms`) |
| Next Stage | None scheduled. |

## What this stage did

- **Removed `write_text_file`**, the one unauthenticated arbitrary-file-write
  command. Replaced by `export_text_file`, which opens the save dialog in Rust so
  the renderer never supplies a destination at all.
- **In-app PDF viewer**. Bytes are fetched by document id over IPC and rendered
  with pdfjs — no `file://`, no asset protocol, no custom scheme. Page navigation,
  zoom, fit width, print, close, open externally.
- **Attachment lifecycle**: attach, replace and remove for drafts; all three
  refused once a document is controlled or has ever been approved. This closes the
  owner's report that attached files could not be deleted.
- **Approve / Reject** with a system-generated approval date, the approver's
  stable id, and a mandatory rejection reason.
- **Path safety**: `resolve_managed_file` canonicalises both sides and compares
  resolved ancestry rather than string prefixes.

**Authoritative reference: `docs/DOCUMENT_CONTROL.md`.**

## The reason Approval Date was blank

`create_document` and `update_document` accepted an `approval_date` argument and
bound it into the **`effective_date`** column, so the form's "Approval Date" was a
free-text field that never touched `documents.approval_date`. The parameter is
gone from both commands; the date is now written only by `approve_document`, from
the database clock. Existing `effective_date` values are preserved and still
displayed for older records.

No migration was required — migration 008 had already added all five approval
columns.

## Validation performed

- **99 Rust library tests**, 0 warnings (16 new: 5 path-safety, 4 export-guard,
  11 document-control), asserted against the real migration files.
- **Migrations against a copy of the owner's live database** (at 007): 008→012
  applied cleanly, every count unchanged, **both documents and all three revisions
  readable**, `integrity_check` ok, zero FK violations. Original never written to.
- **UI validated** against a temporary mock IPC layer: approve, reject with
  mandatory reason, attachment removal with confirmation, controlled-document
  protection, and permission gating proven at the IPC boundary — a read-only user
  sees only Preview and is denied print, open-external, remove and approve by name.

## Deferred (recorded, not passed)

1. Windows production code signing
2. Signed-build GUI activation / offline-reopen acceptance
3. Encrypted external RSA key backup — **pre-customer gate**
4. Real second-Auth-user negative authorization test
5. Supabase Pro-only "Leaked Password Protection" advisor warning
6. **PDF pixel rendering is unproven.** The validation harness's browser pane never
   fires `requestAnimationFrame`, which pdfjs's canvas loop depends on. Isolated
   conclusively: `setTimeout` fires, rAF does not, and a font-free PDF hangs
   identically. The same bytes rasterised correctly through pdfjs's non-rAF path
   (8521 dark pixels), so delivery, parsing and rasterisation are proven — only the
   frame-driven scheduling could not be exercised. Smart App Control still blocks
   the packaged binary, so this needs a signed build to close.
7. **Backup path containment.** `restore_local_backup` and `create_local_backup`
   accept frontend absolute paths with no containment check, and the
   `validate_backup_path` / `validate_import_backup` helpers that implement exactly
   that check are never called by them. Restore overwrites the live database.
   Pre-existing; the highest-value remaining hardening target.
8. **Five other modules' file commands** (CAPA, risks, complaints, audits, NC) do
   not yet use `resolve_managed_file` / `validate_import_source`. Not currently
   exploitable — every writer generates the filename — but without defence in
   depth. Pre-existing.
9. **Approval rights.** Quality Manager holds `documents.approve` as shipped,
   because migration 010 grants it everything except four keys. Left unchanged
   deliberately; narrowing it is a privilege decision for the owner. See
   `docs/DOCUMENT_CONTROL.md` §7.
