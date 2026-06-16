# QMS Desktop — Admin Quick Start Guide

## Version 1.0.0

---

## Overview

This guide is for the first administrator setting up QMS Desktop after installation and license activation.

---

## Step 1 — First Admin Setup

The first time the app runs (after license activation), you will see the **First Admin Setup** screen.

1. Enter a **Username**
   - Must start with a letter (e.g., `admin`, `john_doe`, `qualitymanager`)
   - Only letters, digits, and underscores allowed
   - Maximum 64 characters
   - **Cannot be changed after creation — choose carefully**
2. Enter your **Full Name** (displayed in the app)
3. Enter your **Email** (optional)
4. Enter a **Password**
   - Minimum 8 characters
   - Must contain at least one uppercase letter and one digit
5. Confirm your password
6. Click **Create Admin Account**

You are now logged in as the first administrator.

---

## Step 2 — Company Settings

1. Navigate to **Tools → Settings** in the menu bar
2. Enter your **Company Name** — this appears in reports and print headers
3. Upload a **Company Logo** (optional — appears in reports)
4. Set your preferred **Date Format**
5. Click **Save Settings**

Settings can be updated at any time by an Admin or Quality Manager.

---

## Step 3 — Create Users

Navigate to **Users** in the sidebar (Admin only).

### Create a new user

1. Click **New User**
2. Enter:
   - **Username** (required, immutable — same rules as Admin username)
   - **Full Name** (required)
   - **Email** (optional)
   - **Role** (see role table below)
   - **Department** (optional)
   - **Password** (temporary — user can change via profile)
3. Click **Create User**

### User roles

| Role | Access |
|---|---|
| **Admin** | Full access — all modules, users, settings, backup, license |
| **Quality Manager** | Create/edit all QMS records, run reports, manage settings |
| **Auditor** | Create/edit audits and findings; view all modules; create NCs from findings |
| **Employee** | Create/edit CAPAs, Risks, Complaints, Documents; view only for Audits, NCs |
| **Viewer** | View Documents, Dashboard, Reports only — no write access |

### Edit a user

1. Click on a user in the Users list
2. Click **Edit**
3. Update Name, Email, Role, or Department
4. Click **Save**

**Note:** Username cannot be changed after creation by anyone, including Admin.

### Deactivate a user

1. Click on the user in the Users list
2. Click **Deactivate**
3. The user can no longer log in or perform any actions
4. All their historical records remain intact

### Reset a user password

1. Click on the user in the Users list
2. Click **Reset Password**
3. Enter a new temporary password
4. The user can then change it from their profile (Edit Profile → Change Password)

---

## Step 4 — Understand Username Login

All users log in with their **username** (not email):

- The login screen has a **Username** field and a **Password** field
- Usernames are case-insensitive (entering `Admin` is the same as `admin`)
- The username is shown in the Topbar as `@username`

**Users can manage their own profile:**
- Click their name/avatar in the top-right corner
- **Edit Profile** — update Full Name, Department, Email
- **Change Password** — requires current password; new password must meet strength requirements
- **Log Out** — available from the profile dropdown and the sidebar footer

---

## Step 5 — Module Overview

| Module | Where | Who Can Create/Edit |
|---|---|---|
| Dashboard | Sidebar | All (read-only KPIs) |
| Documents | Sidebar | Admin, Quality Manager |
| CAPA | Sidebar | Admin, Quality Manager |
| Risks | Sidebar | Admin, Quality Manager |
| Complaints | Sidebar | Admin, Quality Manager |
| Audits | Sidebar | Admin, Quality Manager |
| Non-Conformities | Sidebar | Admin, Quality Manager |
| Reports | Sidebar | Admin, Quality Manager, Auditor |
| Backup & Restore | Sidebar | Admin only |
| Users | Sidebar | Admin only |
| Settings | Tools menu | Admin, Quality Manager |
| License | Tools menu | Admin (view/activate) |

---

## Step 6 — Cross-Module Workflows

QMS Desktop supports linked records across modules:

| Flow | How |
|---|---|
| Risk → Non-Conformity | From a Risk record → "Create NC from this Risk" |
| Risk → CAPA | From a Risk record → "Create CAPA from this Risk" |
| Complaint → Non-Conformity | From a Complaint record → "Create NC from this Complaint" |
| Complaint → CAPA | From a Complaint record → "Create CAPA from this Complaint" |
| Audit Finding → Non-Conformity | From an Audit Finding → "Create NC from Finding" |
| Non-Conformity → CAPA | From an NC record → "Create CAPA from this NC" |

All links are preserved in the record history and visible in the "Links" tab of each record's details.

---

## Step 7 — Reports

Navigate to **Reports** in the sidebar.

1. Select a report from the available report cards
2. Apply date range and status filters as needed
3. Click **Generate Report**
4. Use **Print** to open the print dialog (Save as PDF is available)
5. Use **Export CSV** to download the report data as a spreadsheet

**Report availability by role:**
- Document Register: all roles
- CAPA, Risk, Audit, NC Reports: Admin, Quality Manager, Auditor
- Complaint Report: Admin, Quality Manager

---

## Step 8 — Backup Strategy

Create your first backup after setup:

1. Navigate to **Backup & Restore**
2. Click **Create Backup Now**
3. Set a regular backup schedule (see `BACKUP_RESTORE_GUIDE.md`)

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `F11` | Toggle fullscreen |
| `Ctrl+R` | Reload app |
| `Ctrl++` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Reset zoom |

---

## Getting Help

- **Help → Help** — in-app getting started guide and module overview
- **Help → Support** — shows support contact and copies support info to clipboard
- **Help → About** — shows app version and license details

---

*QMS Desktop v1.0.0 — © 2026 QMS Desktop. All rights reserved.*
