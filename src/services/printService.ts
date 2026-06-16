import type { DocumentListItem } from '../types/document';
import type { CapaListItem } from '../types/capa';
import type { RiskListItem } from '../types/risk';
import type { ComplaintListItem } from '../types/complaint';
import type { AuditListItem } from '../types/audit';
import type { NcListItem } from '../types/nonConformity';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.split('T')[0];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusStyle(status: string): string {
  switch (status) {
    case 'CONTROLLED':   return 'color:#15803D;font-weight:600';
    case 'UNDER PROCESS': return 'color:#92400E;font-weight:600';
    case 'OBSOLETE':     return 'color:#94A3B8;font-weight:600';
    default:             return '';
  }
}

export function printDocumentRegister(
  docs: DocumentListItem[],
  companyName: string,
): void {
  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const rows = docs.map(d => `
    <tr>
      <td class="mono">${escapeHtml(d.doc_number)}</td>
      <td>${escapeHtml(d.title)}</td>
      <td>${escapeHtml(d.category)}</td>
      <td>${escapeHtml(d.version)}</td>
      <td style="${statusStyle(d.status)}">${escapeHtml(d.status)}</td>
      <td>${escapeHtml(d.owner_name ?? '—')}</td>
      <td>${escapeHtml(fmtDate(d.effective_date))}</td>
    </tr>
  `).join('');

  const printHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Document Register</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, 'Segoe UI', sans-serif;
    font-size: 10pt;
    color: #1A202C;
    padding: 16mm 20mm;
  }
  .header { margin-bottom: 14px; border-bottom: 2px solid #1E3A5F; padding-bottom: 10px; }
  .company { font-size: 15pt; font-weight: 700; color: #1E3A5F; }
  .report-title { font-size: 11pt; color: #64748B; margin-top: 2px; }
  .meta { font-size: 8pt; color: #94A3B8; margin-top: 10px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    background: #1E3A5F;
    color: #fff;
    text-align: left;
    padding: 6px 8px;
    font-size: 8pt;
    font-weight: 600;
    white-space: nowrap;
  }
  tbody td {
    padding: 5px 8px;
    font-size: 9pt;
    border-bottom: 1px solid #E2E8F0;
    vertical-align: top;
  }
  tbody tr:nth-child(even) td { background: #F8FAFC; }
  .mono { font-family: 'Courier New', monospace; font-weight: 700; font-size: 8.5pt; }
  .footer {
    margin-top: 14px;
    font-size: 7.5pt;
    color: #94A3B8;
    text-align: center;
    border-top: 1px solid #E2E8F0;
    padding-top: 8px;
  }
  @media print {
    body { padding: 0; }
    thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="company">${escapeHtml(companyName || 'QMS Desktop')}</div>
    <div class="report-title">Document Register</div>
  </div>
  <div class="meta">
    Printed: ${printDate} &nbsp;&nbsp;|&nbsp;&nbsp; Total: ${docs.length} document${docs.length !== 1 ? 's' : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Doc Number</th>
        <th>Title</th>
        <th>Type</th>
        <th>Version</th>
        <th>Status</th>
        <th>Owner</th>
        <th>Approval Date</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    QMS Desktop &mdash; Confidential &mdash; ${escapeHtml(companyName || 'QMS Desktop')}
  </div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

  const docWin = window.open('', '_blank', 'width=960,height=720,menubar=no,toolbar=no');
  if (!docWin) return;
  docWin.document.write(printHtml);
  docWin.document.close();
}

// ── CAPA Print Register ───────────────────────────────────────────────────────

function capaStatusStyle(status: string, isOverdue: boolean): string {
  if (isOverdue) return 'color:#DC2626;font-weight:600';
  switch (status) {
    case 'CLOSED': return 'color:#15803D;font-weight:600';
    case 'OPEN':   return 'color:#92400E;font-weight:600';
    default:       return '';
  }
}

function priorityStyle(p: string): string {
  switch (p) {
    case 'CRITICAL': return 'color:#DC2626;font-weight:600';
    case 'HIGH':     return 'color:#EA580C;font-weight:600';
    case 'MEDIUM':   return 'color:#D97706;font-weight:600';
    default:         return 'color:#64748B';
  }
}

export function printCapaRegister(capas: CapaListItem[], companyName: string): void {
  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const rows = capas.map(c => {
    const statusLabel = c.is_overdue && c.status === 'OPEN' ? 'OPEN (OVERDUE)' : c.status;
    return `
    <tr>
      <td class="mono">${escapeHtml(c.capa_number)}</td>
      <td>${escapeHtml(c.title)}</td>
      <td>${escapeHtml(c.capa_type)}</td>
      <td>${escapeHtml(c.source_type ?? '—')}</td>
      <td style="${priorityStyle(c.priority ?? '')}">${escapeHtml(c.priority ?? '—')}</td>
      <td>${escapeHtml(c.responsible_user_name ?? '—')}</td>
      <td>${escapeHtml(fmtDate(c.due_date))}</td>
      <td style="${capaStatusStyle(c.status, c.is_overdue)}">${escapeHtml(statusLabel)}</td>
    </tr>
  `;
  }).join('');

  const printHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>CAPA Register</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, 'Segoe UI', sans-serif;
    font-size: 10pt;
    color: #1A202C;
    padding: 16mm 20mm;
  }
  .header { margin-bottom: 14px; border-bottom: 2px solid #1E3A5F; padding-bottom: 10px; }
  .company { font-size: 15pt; font-weight: 700; color: #1E3A5F; }
  .report-title { font-size: 11pt; color: #64748B; margin-top: 2px; }
  .meta { font-size: 8pt; color: #94A3B8; margin-top: 10px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    background: #1E3A5F;
    color: #fff;
    text-align: left;
    padding: 6px 8px;
    font-size: 8pt;
    font-weight: 600;
    white-space: nowrap;
  }
  tbody td {
    padding: 5px 8px;
    font-size: 9pt;
    border-bottom: 1px solid #E2E8F0;
    vertical-align: top;
  }
  tbody tr:nth-child(even) td { background: #F8FAFC; }
  .mono { font-family: 'Courier New', monospace; font-weight: 700; font-size: 8.5pt; }
  .footer {
    margin-top: 14px;
    font-size: 7.5pt;
    color: #94A3B8;
    text-align: center;
    border-top: 1px solid #E2E8F0;
    padding-top: 8px;
  }
  @media print {
    body { padding: 0; }
    thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="company">${escapeHtml(companyName || 'QMS Desktop')}</div>
    <div class="report-title">CAPA Register</div>
  </div>
  <div class="meta">
    Printed: ${printDate} &nbsp;&nbsp;|&nbsp;&nbsp; Total: ${capas.length} CAPA${capas.length !== 1 ? 's' : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>CAPA Number</th>
        <th>Title</th>
        <th>Type</th>
        <th>Source</th>
        <th>Priority</th>
        <th>Responsible</th>
        <th>Due Date</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    QMS Desktop &mdash; Confidential &mdash; ${escapeHtml(companyName || 'QMS Desktop')}
  </div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

  const capaWin = window.open('', '_blank', 'width=960,height=720,menubar=no,toolbar=no');
  if (!capaWin) return;
  capaWin.document.write(printHtml);
  capaWin.document.close();
}

// ── Risk Print Register ───────────────────────────────────────────────────────

function riskLevelStyle(level: string | null): string {
  switch (level) {
    case 'CRITICAL': return 'color:#DC2626;font-weight:600';
    case 'HIGH':     return 'color:#EA580C;font-weight:600';
    case 'MEDIUM':   return 'color:#D97706;font-weight:600';
    case 'LOW':      return 'color:#15803D;font-weight:600';
    default:         return '';
  }
}

export function printRiskRegister(risks: RiskListItem[], companyName: string): void {
  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const rows = risks.map(r => `
    <tr>
      <td class="mono">${escapeHtml(r.risk_number)}</td>
      <td>${escapeHtml(r.title)}</td>
      <td>${escapeHtml(r.category ?? '—')}</td>
      <td>${escapeHtml(r.responsible_user_name ?? '—')}</td>
      <td style="text-align:center">${r.severity}</td>
      <td style="text-align:center">${r.likelihood}</td>
      <td style="text-align:center;font-weight:700">${r.risk_score}</td>
      <td style="${riskLevelStyle(r.risk_level)}">${escapeHtml(r.risk_level ?? '—')}</td>
      <td>${escapeHtml(r.status)}</td>
    </tr>
  `).join('');

  const riskHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Risk Register</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Segoe UI', sans-serif; font-size: 10pt; color: #1A202C; padding: 16mm 20mm; }
  .header { margin-bottom: 14px; border-bottom: 2px solid #1E3A5F; padding-bottom: 10px; }
  .company { font-size: 15pt; font-weight: 700; color: #1E3A5F; }
  .report-title { font-size: 11pt; color: #64748B; margin-top: 2px; }
  .meta { font-size: 8pt; color: #94A3B8; margin-top: 10px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #1E3A5F; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; font-weight: 600; white-space: nowrap; }
  tbody td { padding: 5px 8px; font-size: 9pt; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #F8FAFC; }
  .mono { font-family: 'Courier New', monospace; font-weight: 700; font-size: 8.5pt; }
  .footer { margin-top: 14px; font-size: 7.5pt; color: #94A3B8; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 8px; }
  @media print {
    body { padding: 0; }
    thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="company">${escapeHtml(companyName || 'QMS Desktop')}</div>
    <div class="report-title">Risk Register</div>
  </div>
  <div class="meta">
    Printed: ${printDate} &nbsp;&nbsp;|&nbsp;&nbsp; Total: ${risks.length} risk${risks.length !== 1 ? 's' : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Risk Number</th>
        <th>Hazard Description</th>
        <th>Category</th>
        <th>Responsible</th>
        <th>Sev.</th>
        <th>Like.</th>
        <th>Score</th>
        <th>Level</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    QMS Desktop &mdash; Confidential &mdash; ${escapeHtml(companyName || 'QMS Desktop')}
  </div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

  const riskWin = window.open('', '_blank', 'width=960,height=720,menubar=no,toolbar=no');
  if (!riskWin) return;
  riskWin.document.write(riskHtml);
  riskWin.document.close();
}

// ── Complaint Print Register ──────────────────────────────────────────────────

function complaintPriorityStyle(p: string | null): string {
  switch (p) {
    case 'HIGH':   return 'color:#DC2626;font-weight:600';
    case 'MEDIUM': return 'color:#D97706;font-weight:600';
    case 'LOW':    return 'color:#15803D;font-weight:600';
    default:       return '';
  }
}

export function printComplaintRegister(complaints: ComplaintListItem[], companyName: string): void {
  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const rows = complaints.map(c => `
    <tr>
      <td class="mono">${escapeHtml(c.complaint_number)}</td>
      <td>${escapeHtml(c.customer_name)}</td>
      <td>${escapeHtml(c.customer_id)}</td>
      <td>${escapeHtml(c.title)}</td>
      <td>${escapeHtml(fmtDate(c.received_date))}</td>
      <td style="${complaintPriorityStyle(c.priority ?? null)}">${escapeHtml(c.priority ?? '—')}</td>
      <td>${escapeHtml(c.issued_by_name ?? '—')}</td>
      <td>${escapeHtml(c.status)}</td>
    </tr>
  `).join('');

  const complaintHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Complaint Register</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Segoe UI', sans-serif; font-size: 10pt; color: #1A202C; padding: 16mm 20mm; }
  .header { margin-bottom: 14px; border-bottom: 2px solid #1E3A5F; padding-bottom: 10px; }
  .company { font-size: 15pt; font-weight: 700; color: #1E3A5F; }
  .report-title { font-size: 11pt; color: #64748B; margin-top: 2px; }
  .meta { font-size: 8pt; color: #94A3B8; margin-top: 10px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #1E3A5F; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; font-weight: 600; white-space: nowrap; }
  tbody td { padding: 5px 8px; font-size: 9pt; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #F8FAFC; }
  .mono { font-family: 'Courier New', monospace; font-weight: 700; font-size: 8.5pt; }
  .footer { margin-top: 14px; font-size: 7.5pt; color: #94A3B8; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 8px; }
  @media print {
    body { padding: 0; }
    thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="company">${escapeHtml(companyName || 'QMS Desktop')}</div>
    <div class="report-title">Complaint Register</div>
  </div>
  <div class="meta">
    Printed: ${printDate} &nbsp;&nbsp;|&nbsp;&nbsp; Total: ${complaints.length} complaint${complaints.length !== 1 ? 's' : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Complaint No.</th>
        <th>Customer Name</th>
        <th>Customer ID</th>
        <th>Title</th>
        <th>Received Date</th>
        <th>Priority</th>
        <th>Issued By</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    QMS Desktop &mdash; Confidential &mdash; ${escapeHtml(companyName || 'QMS Desktop')}
  </div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

  const complaintWin = window.open('', '_blank', 'width=960,height=720,menubar=no,toolbar=no');
  if (!complaintWin) return;
  complaintWin.document.write(complaintHtml);
  complaintWin.document.close();
}

// ── Audit Print Register ──────────────────────────────────────────────────────

function auditSeverityBadge(count: number): string {
  if (count === 0) return 'color:#94A3B8';
  return 'color:#DC2626;font-weight:600';
}

export function printAuditRegister(audits: AuditListItem[], companyName: string): void {
  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const rows = audits.map(a => `
    <tr>
      <td class="mono">${escapeHtml(a.audit_number)}</td>
      <td>${escapeHtml(a.title)}</td>
      <td>${escapeHtml(a.audit_type ?? '—')}</td>
      <td>${escapeHtml(a.department ?? '—')}</td>
      <td>${escapeHtml(a.lead_auditor_name ?? '—')}</td>
      <td>${escapeHtml(fmtDate(a.actual_date))}</td>
      <td style="${auditSeverityBadge(a.findings_count)}">${a.findings_count}</td>
      <td>${escapeHtml(a.status)}</td>
    </tr>
  `).join('');

  const auditHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Audit Register</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Segoe UI', sans-serif; font-size: 10pt; color: #1A202C; padding: 16mm 20mm; }
  .header { margin-bottom: 14px; border-bottom: 2px solid #1E3A5F; padding-bottom: 10px; }
  .company { font-size: 15pt; font-weight: 700; color: #1E3A5F; }
  .report-title { font-size: 11pt; color: #64748B; margin-top: 2px; }
  .meta { font-size: 8pt; color: #94A3B8; margin-top: 10px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #1E3A5F; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; font-weight: 600; white-space: nowrap; }
  tbody td { padding: 5px 8px; font-size: 9pt; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #F8FAFC; }
  .mono { font-family: 'Courier New', monospace; font-weight: 700; font-size: 8.5pt; }
  .footer { margin-top: 14px; font-size: 7.5pt; color: #94A3B8; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 8px; }
  @media print {
    body { padding: 0; }
    thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="company">${escapeHtml(companyName || 'QMS Desktop')}</div>
    <div class="report-title">Audit Register</div>
  </div>
  <div class="meta">
    Printed: ${printDate} &nbsp;&nbsp;|&nbsp;&nbsp; Total: ${audits.length} audit${audits.length !== 1 ? 's' : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Audit Number</th>
        <th>Title</th>
        <th>Type</th>
        <th>Department</th>
        <th>Lead Auditor</th>
        <th>Audit Date</th>
        <th>Findings</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    QMS Desktop &mdash; Confidential &mdash; ${escapeHtml(companyName || 'QMS Desktop')}
  </div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

  const auditWin = window.open('', '_blank', 'width=960,height=720,menubar=no,toolbar=no');
  if (!auditWin) return;
  auditWin.document.write(auditHtml);
  auditWin.document.close();
}

// ── Non-Conformity Print Register ─────────────────────────────────────────────

function ncSeverityStyle(sev: string): string {
  switch (sev) {
    case 'CRITICAL': return 'color:#DC2626;font-weight:600';
    case 'HIGH':     return 'color:#EA580C;font-weight:600';
    case 'MEDIUM':   return 'color:#D97706;font-weight:600';
    case 'LOW':      return 'color:#15803D;font-weight:600';
    default:         return '';
  }
}

// ── Generic report table print (used by Reports page) ────────────────────────
// Uses DOM injection + window.print() so it works reliably in Tauri WebView2
// without requiring window.open (which can be blocked by the WebView sandbox).

export function printReportTable(
  title: string,
  headers: string[],
  rows: string[][],
  companyName: string,
  filterDescription: string,
): void {
  if (rows.length === 0) return;

  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const thCells = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const tbRows = rows.map(r =>
    `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
  ).join('');

  const printContent = `
    <div class="qpr-header">
      <div class="qpr-company">${escapeHtml(companyName || 'QMS Desktop')}</div>
      <div class="qpr-title">${escapeHtml(title)}</div>
    </div>
    <div class="qpr-meta">
      Generated: ${printDate}&nbsp;&nbsp;|&nbsp;&nbsp;${escapeHtml(filterDescription)}&nbsp;&nbsp;|&nbsp;&nbsp;${rows.length} record${rows.length !== 1 ? 's' : ''}
    </div>
    <table class="qpr-table">
      <thead><tr>${thCells}</tr></thead>
      <tbody>${tbRows}</tbody>
    </table>
    <div class="qpr-footer">
      QMS Desktop &mdash; Confidential &mdash; ${escapeHtml(companyName || 'QMS Desktop')}
    </div>
  `;

  // Inject print-only stylesheet
  const styleEl = document.createElement('style');
  styleEl.id = 'qms-report-print-style';
  styleEl.textContent = `
    @media screen { #qms-report-print-area { display: none !important; } }
    @media print {
      body > *:not(#qms-report-print-area) { display: none !important; }
      #qms-report-print-area { display: block !important; font-family: Arial, 'Segoe UI', sans-serif; color: #1A202C; }
      .qpr-header { border-bottom: 2px solid #1E3A5F; padding-bottom: 10px; margin-bottom: 14px; }
      .qpr-company { font-size: 15pt; font-weight: 700; color: #1E3A5F; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .qpr-title { font-size: 11pt; color: #64748B; margin-top: 2px; }
      .qpr-meta { font-size: 8pt; color: #94A3B8; margin-bottom: 14px; }
      .qpr-table { width: 100%; border-collapse: collapse; }
      .qpr-table thead th { background: #1E3A5F; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; font-weight: 600; white-space: nowrap; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .qpr-table tbody td { padding: 5px 8px; font-size: 9pt; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
      .qpr-table tbody tr:nth-child(even) td { background: #F8FAFC; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .qpr-footer { margin-top: 14px; font-size: 7.5pt; color: #94A3B8; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 8px; }
    }
  `;
  document.head.appendChild(styleEl);

  // Inject print content area
  const printDiv = document.createElement('div');
  printDiv.id = 'qms-report-print-area';
  printDiv.innerHTML = printContent;
  document.body.appendChild(printDiv);

  window.print();

  // Clean up after print dialog closes
  setTimeout(() => {
    printDiv.remove();
    styleEl.remove();
  }, 500);
}

export function printNcRegister(ncs: NcListItem[], companyName: string): void {
  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const rows = ncs.map(n => `
    <tr>
      <td class="mono">${escapeHtml(n.nc_number)}</td>
      <td>${escapeHtml(n.title)}</td>
      <td style="${ncSeverityStyle(n.severity)}">${escapeHtml(n.severity)}</td>
      <td>${escapeHtml(n.source_type ?? '—')}</td>
      <td>${escapeHtml(n.responsible_user_name ?? '—')}</td>
      <td>${escapeHtml(fmtDate(n.detected_date))}</td>
      <td>${escapeHtml(n.related_capa_number ?? '—')}</td>
      <td>${escapeHtml(n.status)}</td>
    </tr>
  `).join('');

  const ncHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Non-Conformity Register</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Segoe UI', sans-serif; font-size: 10pt; color: #1A202C; padding: 16mm 20mm; }
  .header { margin-bottom: 14px; border-bottom: 2px solid #1E3A5F; padding-bottom: 10px; }
  .company { font-size: 15pt; font-weight: 700; color: #1E3A5F; }
  .report-title { font-size: 11pt; color: #64748B; margin-top: 2px; }
  .meta { font-size: 8pt; color: #94A3B8; margin-top: 10px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #1E3A5F; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; font-weight: 600; white-space: nowrap; }
  tbody td { padding: 5px 8px; font-size: 9pt; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #F8FAFC; }
  .mono { font-family: 'Courier New', monospace; font-weight: 700; font-size: 8.5pt; }
  .footer { margin-top: 14px; font-size: 7.5pt; color: #94A3B8; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 8px; }
  @media print {
    body { padding: 0; }
    thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="company">${escapeHtml(companyName || 'QMS Desktop')}</div>
    <div class="report-title">Non-Conformity Register</div>
  </div>
  <div class="meta">
    Printed: ${printDate} &nbsp;&nbsp;|&nbsp;&nbsp; Total: ${ncs.length} non-conformit${ncs.length !== 1 ? 'ies' : 'y'}
  </div>
  <table>
    <thead>
      <tr>
        <th>NC Number</th>
        <th>Title</th>
        <th>Severity</th>
        <th>Source</th>
        <th>Responsible</th>
        <th>Detected Date</th>
        <th>Related CAPA</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    QMS Desktop &mdash; Confidential &mdash; ${escapeHtml(companyName || 'QMS Desktop')}
  </div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

  const ncWin = window.open('', '_blank', 'width=960,height=720,menubar=no,toolbar=no');
  if (!ncWin) return;
  ncWin.document.write(ncHtml);
  ncWin.document.close();
}
