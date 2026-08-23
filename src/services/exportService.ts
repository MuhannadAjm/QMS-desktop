import { invoke } from '@tauri-apps/api/core';
import type { DocumentListItem } from '../types/document';
import type { CapaListItem } from '../types/capa';
import type { RiskListItem } from '../types/risk';
import type { ComplaintListItem } from '../types/complaint';
import type { AuditListItem } from '../types/audit';
import type { NcListItem } from '../types/nonConformity';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function moduleFilename(module: string, format: 'csv' | 'json'): string {
  return `${module}-register-${today()}.${format}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.split('T')[0];
}

function escapeCSV(value: string): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildDocumentCSV(docs: DocumentListItem[]): string {
  const headers = [
    'Doc Number', 'Title', 'Document Type', 'Version', 'Status',
    'Owner', 'Approval Date', 'Last Revised', 'Description', 'Created',
  ];
  const rows = docs.map(d => [
    d.doc_number,
    d.title,
    d.category,
    d.version,
    d.status,
    d.owner_name ?? '',
    fmtDate(d.effective_date),
    fmtDate(d.revision_date),
    d.description ?? '',
    fmtDate(d.created_at),
  ].map(escapeCSV).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

/** Registers the backend recognises; each maps to a permission it enforces. */
export type ExportKind =
  | 'documents' | 'capa' | 'risks' | 'complaints' | 'audits' | 'nc' | 'report';

/**
 * Hand the content to the backend, which presents the save dialog and writes to
 * whatever the user picks.
 *
 * The renderer deliberately does NOT choose or even see a destination before the
 * write. The previous version opened the dialog here and passed the resulting
 * path to a generic write command — safe in the intended flow, but it meant the
 * backend was trusting a path from the renderer, and anything able to call that
 * command could write anywhere. Now the only thing crossing the boundary is the
 * text and a suggested file name.
 *
 * Resolves to the chosen path, or null if the user cancelled.
 */
async function saveFile(
  currentUserId: number,
  kind: ExportKind,
  content: string,
  defaultName: string,
  ext: 'csv' | 'json',
): Promise<string | null> {
  return invoke<string | null>('export_text_file', {
    currentUserId,
    kind,
    suggestedName: defaultName,
    extension: ext,
    content,
  });
}

export async function exportDocumentsCSV(currentUserId: number, docs: DocumentListItem[]): Promise<string | null> {
  const content = buildDocumentCSV(docs);
  return saveFile(currentUserId, 'documents', content, moduleFilename('documents', 'csv'), 'csv');
}

export async function exportDocumentsJSON(currentUserId: number, docs: DocumentListItem[]): Promise<string | null> {
  const exportData = docs.map(d => ({
    doc_number: d.doc_number,
    title: d.title,
    document_type: d.category,
    version: d.version,
    status: d.status,
    owner: d.owner_name ?? null,
    approval_date: fmtDate(d.effective_date) || null,
    last_revised: fmtDate(d.revision_date) || null,
    description: d.description ?? null,
    created: fmtDate(d.created_at),
  }));
  const content = JSON.stringify(exportData, null, 2);
  return saveFile(currentUserId, 'documents', content, moduleFilename('documents', 'json'), 'json');
}

// ── CAPA Export ───────────────────────────────────────────────────────────────

function buildCapaCSV(capas: CapaListItem[]): string {
  const headers = [
    'CAPA Number', 'Title', 'Type', 'Source', 'Priority', 'Status',
    'Responsible', 'Due Date', 'Root Cause', 'Action Plan',
    'Effectiveness Check', 'Closed At', 'Created By', 'Created',
  ];
  const rows = capas.map(c => [
    c.capa_number,
    c.title,
    c.capa_type,
    c.source_type ?? '',
    c.priority ?? '',
    c.status,
    c.responsible_user_name ?? '',
    fmtDate(c.due_date),
    c.root_cause ?? '',
    c.action_plan ?? '',
    c.effectiveness_check ?? '',
    fmtDate(c.closed_at),
    c.created_by_name ?? '',
    fmtDate(c.created_at),
  ].map(escapeCSV).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

export async function exportCapasCSV(currentUserId: number, capas: CapaListItem[]): Promise<string | null> {
  const content = buildCapaCSV(capas);
  return saveFile(currentUserId, 'capa', content, moduleFilename('capa', 'csv'), 'csv');
}

export async function exportCapasJSON(currentUserId: number, capas: CapaListItem[]): Promise<string | null> {
  const exportData = capas.map(c => ({
    capa_number: c.capa_number,
    title: c.title,
    type: c.capa_type,
    source: c.source_type ?? null,
    priority: c.priority ?? null,
    status: c.status,
    responsible: c.responsible_user_name ?? null,
    due_date: fmtDate(c.due_date) || null,
    root_cause: c.root_cause ?? null,
    action_plan: c.action_plan ?? null,
    effectiveness_check: c.effectiveness_check ?? null,
    closed_at: fmtDate(c.closed_at) || null,
    created_by: c.created_by_name ?? null,
    created: fmtDate(c.created_at),
  }));
  const content = JSON.stringify(exportData, null, 2);
  return saveFile(currentUserId, 'capa', content, moduleFilename('capa', 'json'), 'json');
}

// ── Risk Export ───────────────────────────────────────────────────────────────

function buildRiskCSV(risks: RiskListItem[]): string {
  const headers = [
    'Risk Number', 'Hazard Description', 'Category', 'Process', 'Source',
    'Who Might Be Affected', 'Severity', 'Likelihood', 'Risk Score', 'Risk Level',
    'Status', 'Responsible', 'Review Date', 'Closed At', 'Created By', 'Created',
  ];
  const rows = risks.map(r => [
    r.risk_number,
    r.title,
    r.category ?? '',
    r.process ?? '',
    r.source ?? '',
    r.who_might_be_affected ?? '',
    String(r.severity),
    String(r.likelihood),
    String(r.risk_score),
    r.risk_level ?? '',
    r.status,
    r.responsible_user_name ?? '',
    fmtDate(r.review_date),
    fmtDate(r.closed_at),
    r.created_by_name ?? '',
    fmtDate(r.created_at),
  ].map(escapeCSV).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

export async function exportRisksCSV(currentUserId: number, risks: RiskListItem[]): Promise<string | null> {
  const content = buildRiskCSV(risks);
  return saveFile(currentUserId, 'risks', content, moduleFilename('risks', 'csv'), 'csv');
}

export async function exportRisksJSON(currentUserId: number, risks: RiskListItem[]): Promise<string | null> {
  const exportData = risks.map(r => ({
    risk_number: r.risk_number,
    hazard_description: r.title,
    category: r.category ?? null,
    process: r.process ?? null,
    source: r.source ?? null,
    who_might_be_affected: r.who_might_be_affected ?? null,
    severity: r.severity,
    likelihood: r.likelihood,
    risk_score: r.risk_score,
    risk_level: r.risk_level ?? null,
    status: r.status,
    responsible: r.responsible_user_name ?? null,
    review_date: fmtDate(r.review_date) || null,
    closed_at: fmtDate(r.closed_at) || null,
    created_by: r.created_by_name ?? null,
    created: fmtDate(r.created_at),
  }));
  const content = JSON.stringify(exportData, null, 2);
  return saveFile(currentUserId, 'risks', content, moduleFilename('risks', 'json'), 'json');
}

// ── Complaint Export ──────────────────────────────────────────────────────────

function buildComplaintCSV(complaints: ComplaintListItem[]): string {
  const headers = [
    'Complaint Number', 'Customer Name', 'Customer ID', 'Title', 'Category',
    'Received Date', 'Priority', 'Status', 'Issued By', 'Root Cause',
    'Resolution', 'Closed At', 'Created By', 'Created',
  ];
  const rows = complaints.map(c => [
    c.complaint_number,
    c.customer_name,
    c.customer_id,
    c.title,
    c.category ?? '',
    fmtDate(c.received_date),
    c.priority ?? '',
    c.status,
    c.issued_by_name ?? '',
    c.root_cause ?? '',
    c.resolution ?? '',
    fmtDate(c.closed_at),
    c.created_by_name ?? '',
    fmtDate(c.created_at),
  ].map(escapeCSV).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

export async function exportComplaintsCSV(currentUserId: number, complaints: ComplaintListItem[]): Promise<string | null> {
  const content = buildComplaintCSV(complaints);
  return saveFile(currentUserId, 'complaints', content, moduleFilename('complaints', 'csv'), 'csv');
}

export async function exportComplaintsJSON(currentUserId: number, complaints: ComplaintListItem[]): Promise<string | null> {
  const exportData = complaints.map(c => ({
    complaint_number: c.complaint_number,
    customer_name: c.customer_name,
    customer_id: c.customer_id,
    title: c.title,
    category: c.category ?? null,
    received_date: fmtDate(c.received_date),
    priority: c.priority ?? null,
    status: c.status,
    issued_by: c.issued_by_name ?? null,
    root_cause: c.root_cause ?? null,
    resolution: c.resolution ?? null,
    closed_at: fmtDate(c.closed_at) || null,
    created_by: c.created_by_name ?? null,
    created: fmtDate(c.created_at),
  }));
  const content = JSON.stringify(exportData, null, 2);
  return saveFile(currentUserId, 'complaints', content, moduleFilename('complaints', 'json'), 'json');
}

// ── Audit Export ──────────────────────────────────────────────────────────────

function buildAuditCSV(audits: AuditListItem[]): string {
  const headers = [
    'Audit Number', 'Title', 'Audit Type', 'Department', 'Standard',
    'Planned Date', 'Audit Date', 'Status', 'Lead Auditor', 'Auditee',
    'Findings', 'Scope', 'Closed At', 'Created By', 'Created',
  ];
  const rows = audits.map(a => [
    a.audit_number,
    a.title,
    a.audit_type ?? '',
    a.department ?? '',
    a.standard ?? '',
    fmtDate(a.planned_date),
    fmtDate(a.actual_date),
    a.status,
    a.lead_auditor_name ?? '',
    a.auditee ?? '',
    String(a.findings_count),
    a.scope ?? '',
    fmtDate(a.closed_at),
    a.created_by_name ?? '',
    fmtDate(a.created_at),
  ].map(escapeCSV).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

export async function exportAuditsCSV(currentUserId: number, audits: AuditListItem[]): Promise<string | null> {
  const content = buildAuditCSV(audits);
  return saveFile(currentUserId, 'audits', content, moduleFilename('audits', 'csv'), 'csv');
}

export async function exportAuditsJSON(currentUserId: number, audits: AuditListItem[]): Promise<string | null> {
  const exportData = audits.map(a => ({
    audit_number: a.audit_number,
    title: a.title,
    audit_type: a.audit_type ?? null,
    department: a.department ?? null,
    standard: a.standard ?? null,
    planned_date: fmtDate(a.planned_date) || null,
    audit_date: fmtDate(a.actual_date) || null,
    status: a.status,
    lead_auditor: a.lead_auditor_name ?? null,
    auditee: a.auditee ?? null,
    findings_count: a.findings_count,
    scope: a.scope ?? null,
    closed_at: fmtDate(a.closed_at) || null,
    created_by: a.created_by_name ?? null,
    created: fmtDate(a.created_at),
  }));
  const content = JSON.stringify(exportData, null, 2);
  return saveFile(currentUserId, 'audits', content, moduleFilename('audits', 'json'), 'json');
}

// ── Non-Conformity Export ─────────────────────────────────────────────────────

function buildNcCSV(ncs: NcListItem[]): string {
  const headers = [
    'NC Number', 'Title', 'Severity', 'Source', 'Status',
    'Detected Date', 'Responsible', 'Containment Action',
    'Related CAPA', 'Closed At', 'Created By', 'Created',
  ];
  const rows = ncs.map(n => [
    n.nc_number,
    n.title,
    n.severity,
    n.source_type ?? '',
    n.status,
    fmtDate(n.detected_date),
    n.responsible_user_name ?? '',
    n.containment_action ?? '',
    n.related_capa_number ?? '',
    fmtDate(n.closed_at),
    n.created_by_name ?? '',
    fmtDate(n.created_at),
  ].map(escapeCSV).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

export async function exportNcsCSV(currentUserId: number, ncs: NcListItem[]): Promise<string | null> {
  const content = buildNcCSV(ncs);
  return saveFile(currentUserId, 'nc', content, moduleFilename('non-conformities', 'csv'), 'csv');
}

// ── Generic report CSV export (used by Reports page) ─────────────────────────
// slug: pre-defined filename slug per report type, e.g. "capa-report", "risk-report"

export async function exportReportCSV(
  currentUserId: number,
  slug: string,
  headers: string[],
  rows: string[][],
): Promise<string | null> {
  const filename = `${slug}-${today()}.csv`;
  const csvRows = [headers, ...rows].map(r => r.map(escapeCSV).join(','));
  const content = csvRows.join('\r\n');
  return saveFile(currentUserId, 'report', content, filename, 'csv');
}

export async function exportNcsJSON(currentUserId: number, ncs: NcListItem[]): Promise<string | null> {
  const exportData = ncs.map(n => ({
    nc_number: n.nc_number,
    title: n.title,
    severity: n.severity,
    source_type: n.source_type ?? null,
    status: n.status,
    detected_date: fmtDate(n.detected_date) || null,
    responsible: n.responsible_user_name ?? null,
    containment_action: n.containment_action ?? null,
    related_capa: n.related_capa_number ?? null,
    closed_at: fmtDate(n.closed_at) || null,
    created_by: n.created_by_name ?? null,
    created: fmtDate(n.created_at),
  }));
  const content = JSON.stringify(exportData, null, 2);
  return saveFile(currentUserId, 'nc', content, moduleFilename('non-conformities', 'json'), 'json');
}
