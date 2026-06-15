# QMS Desktop — Architecture

## Product Overview

QMS Desktop is a standalone Windows desktop application for Quality Management System (QMS) operations, oriented toward ISO 9001 compliance. It runs on a single device with multiple local users sharing a local SQLite database.

---

## Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Desktop Shell | Tauri 2 | Lightweight Rust shell, native Windows installer, no Electron overhead |
| Frontend | React + TypeScript | Component-based UI, type safety, large ecosystem |
| UI Styling | Tailwind CSS + shadcn/ui | Consistent enterprise design system |
| Local Database | SQLite via rusqlite 0.32 (bundled) | Embedded, zero-install, ACID-compliant — all SQL via custom Rust Tauri commands; the JS tauri-plugin-sql API is not used for business queries |
| File Storage | OS AppData directory | Standard Windows pattern, no external services |
| Build / Bundling | Vite | Fast dev server, optimized production build |
| State Management | Zustand | Lightweight, module-scoped stores |
| Routing | React Router v6 | Client-side SPA routing within Tauri window |
| PDF Reports | @react-pdf/renderer | In-process PDF generation, no server dependency |
| Typography | Inter, Segoe UI fallback | Professional enterprise look |

---

## Application Architecture

```
QMS-Desktop/
├── src-tauri/               # Tauri Rust backend
│   ├── src/
│   │   ├── main.rs          # Tauri entry point
│   │   ├── lib.rs           # Builder: registers modules, commands, plugins
│   │   ├── storage/
│   │   │   └── mod.rs       # AppData path resolver and directory management
│   │   ├── db/
│   │   │   ├── mod.rs       # Database module public interface
│   │   │   ├── init.rs      # SQLite init, WAL/FK PRAGMAs, migration runner
│   │   │   └── sql/
│   │   │       ├── 001_initial_schema.sql  # All 13 QMS tables
│   │   │       └── 002_phase3_auth.sql     # department column + settings keys
│   │   └── commands/
│   │       ├── mod.rs          # Commands public interface
│   │       ├── storage.rs      # initialize_app_storage, get_app_storage_status
│   │       ├── auth.rs         # check_first_admin_exists, create_first_admin, login
│   │       ├── users.rs        # list_users, create_user, update_user, set_user_status, reset_user_password
│   │       ├── settings_cmd.rs # get_settings, update_setting
│   │       ├── files.rs        # File upload / storage commands (Phase 4+)
│   │       ├── backup.rs       # Backup and restore commands (Phase 8+)
│   │       └── license.rs      # License activation commands (Phase 9)
│   ├── tauri.conf.json      # Tauri configuration
│   ├── Cargo.toml
│   └── icons/
│
├── src/                     # React frontend (TypeScript)
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Root component, router setup
│   │
│   ├── components/          # Reusable UI components
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Topbar.tsx
│   │   ├── ui/
│   │   │   ├── StatCard.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── RiskBadge.tsx
│   │   │   ├── FilterBar.tsx
│   │   │   ├── SearchInput.tsx
│   │   │   ├── DetailsDrawer.tsx
│   │   │   ├── FormSection.tsx
│   │   │   ├── AttachmentUploader.tsx
│   │   │   ├── ActivityTimeline.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── PageHeader.tsx
│   │
│   ├── pages/               # Module pages
│   │   ├── Dashboard.tsx
│   │   ├── Settings.tsx
│   │   ├── Users.tsx
│   │   ├── Documents.tsx
│   │   ├── CAPA.tsx
│   │   ├── Risks.tsx
│   │   ├── Complaints.tsx
│   │   ├── Audits.tsx
│   │   ├── NonConformities.tsx
│   │   ├── Reports.tsx
│   │   ├── Backup.tsx
│   │   └── License.tsx
│   │
│   ├── db/                  # Database layer
│   │   ├── connection.ts    # SQLite connection initialization
│   │   └── migrations/      # SQL migration scripts (run in order)
│   │       ├── 001_initial_schema.sql
│   │       ├── 002_users.sql
│   │       └── ...
│   │
│   ├── repositories/        # Data access layer (raw SQL per module)
│   │   ├── capaRepository.ts
│   │   ├── riskRepository.ts
│   │   ├── complaintRepository.ts
│   │   ├── auditRepository.ts
│   │   ├── ncRepository.ts
│   │   ├── documentRepository.ts
│   │   └── userRepository.ts
│   │
│   ├── services/            # Business logic layer
│   │   ├── capaService.ts
│   │   ├── riskService.ts
│   │   ├── complaintService.ts
│   │   ├── auditService.ts
│   │   ├── ncService.ts
│   │   ├── documentService.ts
│   │   └── userService.ts
│   │
│   ├── hooks/               # React custom hooks
│   │   ├── useCapa.ts
│   │   ├── useRisks.ts
│   │   ├── useComplaints.ts
│   │   ├── useAudits.ts
│   │   ├── useNonConformities.ts
│   │   ├── useDocuments.ts
│   │   └── useUsers.ts
│   │
│   ├── types/               # TypeScript type definitions
│   │   ├── capa.ts
│   │   ├── risk.ts
│   │   ├── complaint.ts
│   │   ├── audit.ts
│   │   ├── nc.ts
│   │   ├── document.ts
│   │   ├── user.ts
│   │   └── common.ts
│   │
│   ├── stores/              # Zustand state stores
│   │   ├── authStore.ts
│   │   ├── settingsStore.ts
│   │   └── uiStore.ts
│   │
│   └── utils/               # Utility functions
│       ├── dateUtils.ts
│       ├── riskUtils.ts     # Risk score calculation
│       ├── exportUtils.ts   # PDF export helpers
│       └── validationUtils.ts
│
├── docs/
│   ├── phases/              # Per-phase planning notes
│   └── reports/             # Per-phase completion reports
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── ARCHITECTURE.md          # This file
├── CLAUDE_HANDOFF.md
├── CURRENT_PHASE.md
├── PHASE_PLAN.md
├── DEVELOPMENT_LOG.md
├── SECURITY_NOTES.md
├── DATABASE_SCHEMA.md
├── LICENSE_DESIGN.md
├── UI_GUIDELINES.md
└── RUNBOOK.md
```

---

## Local AppData Storage Layout

All user data lives under the OS AppData directory resolved by Tauri at runtime:

```
%APPDATA%\QMSDesktop\
├── data.db               # Main SQLite database
├── settings.json         # Application settings (company name, logo path, etc.)
├── license.json          # License token (Phase 9)
├── uploads/
│   ├── documents/        # Controlled document files
│   ├── capa/             # CAPA attachments
│   ├── risks/            # Risk attachments
│   ├── complaints/       # Complaint attachments
│   ├── audits/           # Audit attachments
│   └── nc/               # Non-Conformity attachments
└── backups/              # Manual backup archives (.zip)
```

---

## Module Data Relationships

```
Risk ──────────────┐
Audit ─────────────┼──► Non-Conformity ──► CAPA
Complaint ─────────┘         │               │
                             │               │
Risk ──────────────────────────────────────► CAPA  (direct)
Audit ─────────────────────────────────────► CAPA  (direct)
Complaint ─────────────────────────────────► CAPA  (direct)

Documents ──► linked to CAPA, Risk, Complaint, Audit, NC
```

### Key rules
- A Risk, Audit, or Complaint can optionally create a Non-Conformity.
- A Non-Conformity can generate a CAPA (with user confirmation; cancellable).
- Direct CAPA creation is also available from Risk, Audit, Complaint, and NC.
- Documents can be linked to any module record.

---

## Authentication and Roles (Phase 3 COMPLETE)

- Local user accounts stored in SQLite (no external auth).
- Passwords hashed with **Argon2id** (`argon2` crate v0.5, default parameters) via Rust backend (`password.rs`).
- Roles: **Admin**, **QualityManager**, **Auditor**, **Employee**, **Viewer**.
- Session kept in memory (Zustand `authStore`); cleared on logout or app close.
- First-launch wizard creates the first Admin account (required before login).
- Login by email address (lowercased, stored as `username` field for UNIQUE constraint).

---

## Deployment Model

- Single Windows machine, single SQLite file.
- Installed via a Tauri-generated Windows `.msi` or `.exe` installer.
- No network required for operation.
- Future multi-device mode: separate version, out of scope for v1.

---

## Constraints

| Rule | Detail |
|---|---|
| No external database | SQLite only; embedded in AppData |
| No cloud sync | All data stays on the device |
| No external APIs | No live calls to any remote service |
| No Docker / server | Pure desktop install |
| Single device v1 | Multi-device is a future version |
