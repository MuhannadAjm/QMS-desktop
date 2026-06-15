# QMS Desktop — UI Guidelines

## Design Philosophy

QMS Desktop must feel like a **professional enterprise desktop application** — not a demo,
prototype, or consumer web app. The interface is used during audits, inspections, and
quality reviews, so it must convey authority, clarity, and reliability.

Reference points:
- **Airtable** — data table layout and record organization
- **Linear** — clean spacing, tight typography, neutral colors
- **Notion** — simplicity, readable content areas
- **Jira** — workflow seriousness, status management
- **Monday.com** — clear status badges
- **Enterprise admin dashboards** — KPI cards, structured reports

---

## Color System

### Primary Palette

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#1E3A5F` | Sidebar, primary buttons, accent borders |
| `primary-light` | `#2E5080` | Hover states on primary elements |
| `primary-subtle` | `#EBF2FA` | Active sidebar item background |

### Neutral Palette

| Token | Hex | Usage |
|---|---|---|
| `bg-app` | `#F4F6F9` | Application background |
| `bg-card` | `#FFFFFF` | Card and panel backgrounds |
| `bg-sidebar` | `#1E3A5F` | Sidebar background |
| `border` | `#E2E8F0` | Dividers, card borders |
| `text-primary` | `#1A202C` | Main body text |
| `text-secondary` | `#64748B` | Labels, metadata, placeholders |
| `text-on-primary` | `#FFFFFF` | Text on navy backgrounds |

### Status Colors

| Status | Background | Text | Usage |
|---|---|---|---|
| OPEN | `#DBEAFE` | `#1D4ED8` | CAPA, NC, Audit, Complaint open |
| CLOSED | `#DCFCE7` | `#15803D` | Any record closed |
| OVERDUE | `#FEE2E2` | `#DC2626` | Past target date and still open |
| IN PROGRESS | `#FEF9C3` | `#92400E` | Intermediate workflow states |
| UNDER PROCESS | `#FEF9C3` | `#92400E` | Document in draft/review |
| CONTROLLED | `#DCFCE7` | `#15803D` | Document approved and in force |
| OBSOLETE | `#F1F5F9` | `#94A3B8` | Document obsolete / archived |

### Risk Level Colors

| Level | Background | Text |
|---|---|---|
| LOW | `#DCFCE7` | `#15803D` |
| MEDIUM | `#FEF9C3` | `#92400E` |
| HIGH | `#FEE2E2` | `#DC2626` |
| CRITICAL | `#450A0A` | `#FCA5A5` |

---

## Typography

```css
font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
```

| Role | Size | Weight | Usage |
|---|---|---|---|
| Page title | 20px | 600 | Module page headers |
| Section title | 16px | 600 | Card headers, section labels |
| Body | 14px | 400 | Table rows, form labels, content |
| Small / meta | 12px | 400 | Timestamps, helper text |
| Badge | 11px | 500 | Status badges |

Line-height: 1.5 for body text. Letter-spacing: normal.

---

## Layout

### AppLayout
- Full-height flex row: `Sidebar (240px fixed) + Main area (flex-1)`
- Main area: `Topbar (56px) + Content area (scrollable)`
- Content padding: `24px`
- Max content width: none (full width, let tables breathe)

### Sidebar
- Dark navy background (`#1E3A5F`)
- White text and icons
- Active item: lighter navy background (`#2E5080`) with left white border `3px`
- Company logo / name at the top
- Navigation groups with subtle section labels
- User avatar / name at the bottom

### Topbar
- White background, `1px` bottom border
- Page breadcrumb on the left
- Global search, notifications placeholder, user menu on the right
- Height: `56px`

### Content Area
- Soft gray background (`#F4F6F9`)
- White cards with `border-radius: 8px`, `box-shadow: 0 1px 3px rgba(0,0,0,0.08)`
- Consistent `16px` or `24px` gap between cards

---

## Core Components

### PageHeader
```
[Module Icon] Page Title                    [Primary Action Button]
              Subtitle / description
```

### StatCard (Dashboard KPI)
```
┌─────────────────────────────┐
│  [Icon]     Label           │
│             Value (large)   │
│             Trend or badge  │
└─────────────────────────────┘
```
- White card, navy icon, large numeric value
- Clickable → navigates to filtered module view

### DataTable
- Compact rows (`40px` height)
- Column headers: `12px`, uppercase, `#64748B`, `1px` bottom border
- Row hover: `#F8FAFC` background
- Zebra striping: optional, use sparingly
- Sticky header on scroll
- Inline status badge in status column
- Last column: action icons (view, edit, delete)

### StatusBadge
```
┌──────────────┐
│  ● OPEN      │   rounded-full, colored background
└──────────────┘
```
- `px-2 py-0.5`, `border-radius: 9999px`
- Color based on status (see Status Colors above)

### DetailsDrawer
- Slides in from the right: `480px` wide
- Overlay backdrop (semi-transparent) covers main content
- Header: record number + title + close button
- Body: tabbed sections (Details / Activity / Attachments / Linked Records)
- Footer: primary action button (Edit / Close / Generate CAPA)

### FormSection
- White card with `16px` padding
- Section label at the top (`14px`, `600` weight, `#1A202C`)
- Fields in a 2-column grid on wide screens, 1-column on narrow
- Labels above inputs (not inline)
- Input: `height: 36px`, `border: 1px solid #E2E8F0`, `border-radius: 6px`
- Focus ring: `2px solid #1E3A5F`

### FilterBar
- Horizontal row of filter chips + search input
- Chips: rounded, gray background, close button when active
- Placed above the DataTable, below the PageHeader

### AttachmentUploader
- Drag-and-drop zone with dashed border
- List of uploaded files below (name, size, delete button)
- Max file size: 20MB (enforced in Tauri backend)

### ConfirmDialog
- Centered modal, `400px` max width
- Title (action), description (consequences), Cancel + Confirm buttons
- Destructive actions: Confirm button is red

### EmptyState
- Centered in the content area
- Illustration (simple icon), message, optional CTA button
- Used when a module has no records yet

---

## Spacing Scale

Use multiples of `4px`:
`4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64`

---

## Icons

Use a single consistent icon library (Lucide React recommended — already tree-shaken,
consistent stroke width, MIT licensed). Do not mix multiple icon libraries.

---

## Interaction Patterns

- **Single-click** on a table row → opens DetailsDrawer
- **Double-click** or **Edit button** → opens edit form (inline or modal)
- **Create** → modal form or dedicated create page
- **Delete** → always requires ConfirmDialog
- **Status change** → inline dropdown in drawer or table row badge (with confirmation for
  CLOSED status)
- **Loading states** → skeleton placeholders, never spinner-only on full pages
- **Error states** → inline error messages under form fields, toast for system errors

---

## Do Not

- Do not use neon, gaming, or overly colorful styles.
- Do not use gradients on data surfaces.
- Do not use playful rounded corners (keep `6px`–`8px`, never pill-shaped cards).
- Do not mix font families.
- Do not use dark mode in v1 (planned later).
- Do not reproduce the Airtable grid verbatim.
- Do not use old Windows-style forms (no grey form backgrounds, no beveled borders).
- Do not use emojis in the application UI.
- Do not use animations heavier than `150ms` transitions on UI elements.
