# Current Phase

| Field | Value |
|---|---|
| Phase | **Product Improvements — Stage 3: Master Data & Dynamic Forms — COMPLETE** |
| Status | **Lookup values are administrator-managed; complaint customer is a real reference** |
| Date | 2026-08-23 |
| Checkpoint tag | `improvement-checkpoint-master-data-forms` |
| Previous baseline | `improvement-checkpoint-pre-master-data-ui` (= `improvement-checkpoint-rbac`) |
| Next Stage | Stage 4 — Documents. **Not started.** |

## What this stage did

Stage 1 built the master-data schema and the Rust commands. Nothing in the product
reached them: `adminService.ts` had eleven wrappers and zero call sites, the Risk
form read a hard-coded array, and the Complaint form had two unrelated free-text
customer boxes.

- **Master Data page** (`/master-data`) — Risk Sources and Customers tabs. Add,
  rename/edit, reorder, activate/deactivate, search. Gated on `masterdata.view`
  to see and `masterdata.manage` to change.
- **Risk source is dynamic** — loaded from the master; `types/risk.ts`
  `RISK_SOURCES` deleted rather than left as a second, diverging list. A risk
  whose recorded source is no longer offered keeps it, marked so.
- **Complaint customer selector** — searchable by name or code, with the customer
  code derived read-only. The backend takes the snapshot from the master record
  and ignores client-supplied text, so a code that disagrees with the chosen
  customer is unrepresentable rather than merely discouraged.
- **Customer code became editable**, safely: unique, case-insensitive, and it does
  not rewrite the details stored on existing complaints.
- **Migration 012** links existing complaints to a master record only on an exact
  business-code match. No fuzzy name matching; unlinked complaints stay readable.
- **Lookup authorization split** — choosing a value needs the relevant business
  capability, not master-data rights. Administering it still needs
  `masterdata.manage`.

**Authoritative reference: `docs/MASTER_DATA.md`.**

## Previously requested form requirements — verified

| Requirement | State |
|---|---|
| CAPA Type fixed enum (CORRECTIVE / PREVENTIVE / CORRECTION) | Already done — TS union + Rust validation |
| Root Cause Method free text | Already done — `<input>` with a `<datalist>` of suggestions |
| Responsible Person via candidate/eligibility API | Already done — `list_capa_responsible_candidates` |
| Lead Auditor via candidate/eligibility API | Already done — `list_lead_auditor_candidates` |
| ISO wording `ISO 9001`, not year-specific | Already done — UI and Rust defaults both `ISO 9001`; the `001` schema default is documented as superseded |
| Risk Source from Master Data | **Done this stage** — was the only one outstanding |

## Validation performed

- **79 Rust library tests**, 0 warnings. 20 new, asserted against the real
  migration files rather than a restated schema.
- **Migrations applied to a copy of the owner's live database** (at migration
  007): 008 → 012 applied cleanly, every pre-existing row count unchanged,
  `integrity_check` ok, zero foreign-key violations, idempotent on re-run. The
  original database was never written to.
- **UI validated** in a browser against a temporary mock IPC layer (removed
  afterwards): the full Risk Source flow including the rename/snapshot invariant,
  the full Customer flow including uniqueness, and the Complaint selector
  including code auto-resolution and inactive-customer handling.
- Two defects found by that validation and fixed: inverted activate/deactivate
  notices, and a User form that was unreachable at short viewport heights.

## Deferred (recorded, not passed)

1. Windows production code signing
2. Signed-build GUI activation / offline-reopen acceptance
3. Encrypted external RSA key backup — **pre-customer gate**
4. Real second-Auth-user negative authorization test
5. Supabase Pro-only "Leaked Password Protection" advisor warning
6. **End-to-end validation in a packaged build.** Smart App Control is enforced
   (`VerifiedAndReputablePolicyState = 1`) and blocks freshly built unsigned
   binaries; disabling it is out of scope by instruction. It now intermittently
   blocks freshly built **test** binaries too — `cargo test` sometimes needs
   several attempts, or a content change, before Windows lets the executable run.
7. **`write_text_file` in `files.rs` lacks user authorization and path
   sandboxing.** Untouched by instruction in Stages 2 and 3. **First priority for
   Documents Stage 4.**
