import { useState } from 'react';
import {
  BarChart3,
  FileText,
  CheckCircle2,
  ShieldAlert,
  MessageCircle,
  ClipboardCheck,
  AlertOctagon,
  Printer,
  Download,
  Filter,
  ChevronRight,
  ArrowLeft,
  FileX,
} from 'lucide-react';
import Card from '../components/ui/Card';
import { useAuthStore } from '../stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  getDocumentRegisterReport,
  getCapaReport,
  getRiskReport,
  getComplaintReport,
  getAuditReport,
  getNcReport,
} from '../services/reportService';
import type {
  ReportType,
  ReportFilters,
  DocumentReportRow,
  CapaReportRow,
  RiskReportRow,
  ComplaintReportRow,
  AuditReportRow,
  NcReportRow,
} from '../types/reports';
import { printReportTable } from '../services/printService';
import { exportReportCSV } from '../services/exportService';

type ReportRow =
  | DocumentReportRow
  | CapaReportRow
  | RiskReportRow
  | ComplaintReportRow
  | AuditReportRow
  | NcReportRow;

interface ReportDef {
  id: ReportType;
  label: string;
  description: string;
  icon: React.ReactNode;
  statusOptions: { value: string; label: string }[];
  /**
   * Permission that makes this report available. Complaints is separate from the
   * rest because complaint data is narrower than the other registers, which is
   * why reports.run_complaints exists as its own key.
   */
  perm: string;
  fileSlug: string;
}

const REPORTS: ReportDef[] = [
  {
    id: 'documents',
    label: 'Document Register',
    description: 'Controlled documents list with status and version',
    icon: <FileText size={20} />,
    statusOptions: [
      { value: 'CONTROLLED',    label: 'Controlled' },
      { value: 'UNDER PROCESS', label: 'Under Process' },
      { value: 'OBSOLETE',      label: 'Obsolete' },
    ],
    perm: 'reports.run',
    fileSlug: 'document-register-report',
  },
  {
    id: 'capas',
    label: 'CAPA Report',
    description: 'Corrective and preventive actions with status and due dates',
    icon: <CheckCircle2 size={20} />,
    statusOptions: [
      { value: 'OPEN',   label: 'Open' },
      { value: 'CLOSED', label: 'Closed' },
    ],
    perm: 'reports.run',
    fileSlug: 'capa-report',
  },
  {
    id: 'risks',
    label: 'Risk Report',
    description: 'Risk register with scores, levels, and mitigation status',
    icon: <ShieldAlert size={20} />,
    statusOptions: [
      { value: 'OPEN',   label: 'Open' },
      { value: 'CLOSED', label: 'Closed' },
    ],
    perm: 'reports.run',
    fileSlug: 'risk-report',
  },
  {
    id: 'complaints',
    label: 'Complaint Report',
    description: 'Customer complaints by status, priority, and customer',
    icon: <MessageCircle size={20} />,
    statusOptions: [
      { value: 'OPEN',   label: 'Open' },
      { value: 'CLOSED', label: 'Closed' },
    ],
    perm: 'reports.run_complaints',
    fileSlug: 'complaint-report',
  },
  {
    id: 'audits',
    label: 'Audit Report',
    description: 'Audit schedule and results with findings summary',
    icon: <ClipboardCheck size={20} />,
    statusOptions: [
      { value: 'OPEN',   label: 'Open' },
      { value: 'CLOSED', label: 'Closed' },
    ],
    perm: 'reports.run',
    fileSlug: 'audit-report',
  },
  {
    id: 'ncs',
    label: 'Non-Conformity Report',
    description: 'Non-conformities by source, severity, and status',
    icon: <AlertOctagon size={20} />,
    statusOptions: [
      { value: 'OPEN',      label: 'Open' },
      { value: 'IN_REVIEW', label: 'In Review' },
      { value: 'CLOSED',    label: 'Closed' },
    ],
    perm: 'reports.run',
    fileSlug: 'non-conformity-report',
  },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.split('T')[0];
}

function statusStyle(status: string): string {
  switch (status) {
    case 'OPEN':         return 'color:#1D4ED8';
    case 'CLOSED':       return 'color:#15803D';
    case 'IN_REVIEW':    return 'color:#92400E';
    case 'CONTROLLED':   return 'color:#15803D';
    case 'UNDER PROCESS':return 'color:#92400E';
    case 'OBSOLETE':     return 'color:#94A3B8';
    default:             return '';
  }
}

function buildFilterDescription(filters: ReportFilters): string {
  const parts: string[] = [];
  if (filters.status)   parts.push(`Status: ${filters.status}`);
  if (filters.dateFrom) parts.push(`From: ${filters.dateFrom}`);
  if (filters.dateTo)   parts.push(`To: ${filters.dateTo}`);
  return parts.length ? parts.join(' | ') : 'All records';
}

// ── Per-report column/row builders ───────────────────────────────────────────

function docHeaders() { return ['Doc Number','Title','Category','Version','Status','Owner','Effective Date']; }
function docRow(r: DocumentReportRow) { return [r.doc_number, r.title, r.category??'—', r.version, r.status, r.owner_name??'—', fmtDate(r.effective_date)]; }

function capaHeaders() { return ['CAPA #','Title','Type','Source','Priority','Status','Due Date','Responsible','Closed']; }
function capaRow(r: CapaReportRow) { return [r.capa_number, r.title, r.capa_type, r.source_type??'—', r.priority??'—', r.status, fmtDate(r.due_date), r.responsible_user_name??'—', fmtDate(r.closed_at)]; }

function riskHeaders() { return ['Risk #','Title','Category','Level','Score','Status','Responsible','Review Date']; }
function riskRow(r: RiskReportRow) { return [r.risk_number, r.title, r.category??'—', r.risk_level??'—', String(r.risk_score??'—'), r.status, r.responsible_user_name??'—', fmtDate(r.review_date)]; }

function complaintHeaders() { return ['Complaint #','Customer','Customer ID','Title','Category','Priority','Status','Received']; }
function complaintRow(r: ComplaintReportRow) { return [r.complaint_number, r.customer_name, r.customer_id, r.title, r.category??'—', r.priority??'—', r.status, fmtDate(r.received_date)]; }

function auditHeaders() { return ['Audit #','Title','Type','Department','Status','Planned','Actual','Auditor','Findings']; }
function auditRow(r: AuditReportRow) { return [r.audit_number, r.title, r.audit_type??'—', r.department??'—', r.status, fmtDate(r.planned_date), fmtDate(r.actual_date), r.lead_auditor_name??'—', String(r.findings_count)]; }

function ncHeaders() { return ['NC #','Title','Source','Severity','Status','Detected','Responsible','CAPA Linked']; }
function ncRow(r: NcReportRow) { return [r.nc_number, r.title, r.source??'—', r.severity, r.status, fmtDate(r.detected_date), r.responsible_user_name??'—', r.related_capa_id ? 'Yes' : 'No']; }

function getHeadersAndRows(type: ReportType, data: ReportRow[]): { headers: string[]; rows: string[][] } {
  switch (type) {
    case 'documents': return { headers: docHeaders(), rows: (data as DocumentReportRow[]).map(docRow) };
    case 'capas':     return { headers: capaHeaders(), rows: (data as CapaReportRow[]).map(capaRow) };
    case 'risks':     return { headers: riskHeaders(), rows: (data as RiskReportRow[]).map(riskRow) };
    case 'complaints':return { headers: complaintHeaders(), rows: (data as ComplaintReportRow[]).map(complaintRow) };
    case 'audits':    return { headers: auditHeaders(), rows: (data as AuditReportRow[]).map(auditRow) };
    case 'ncs':       return { headers: ncHeaders(), rows: (data as NcReportRow[]).map(ncRow) };
  }
}

export default function Reports() {
  const { user } = useAuthStore();
  const { companyName } = useSettingsStore();
  const can = usePermissionStore((s) => s.can);
  const currentUserId = user?.id ?? 0;

  const [selected, setSelected] = useState<ReportType | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({ status: '', dateFrom: '', dateTo: '' });
  const [data, setData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  const availableReports = REPORTS.filter(r => can(r.perm));

  const runReport = async () => {
    if (!selected) return;

    // Validate date range
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      setDateRangeError('"Created From" must be before "Created To".');
      return;
    }
    setDateRangeError(null);

    setLoading(true);
    setError(null);
    try {
      let rows: ReportRow[];
      switch (selected) {
        case 'documents': rows = await getDocumentRegisterReport(currentUserId, filters); break;
        case 'capas':     rows = await getCapaReport(currentUserId, filters); break;
        case 'risks':     rows = await getRiskReport(currentUserId, filters); break;
        case 'complaints':rows = await getComplaintReport(currentUserId, filters); break;
        case 'audits':    rows = await getAuditReport(currentUserId, filters); break;
        case 'ncs':       rows = await getNcReport(currentUserId, filters); break;
      }
      setData(rows);
      setRan(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!selected || !ran) return;
    if (data.length === 0) {
      alert('No data to print. Adjust filters or create records first.');
      return;
    }
    const def = REPORTS.find(r => r.id === selected)!;
    const { headers, rows } = getHeadersAndRows(selected, data);
    printReportTable(def.label, headers, rows, companyName, buildFilterDescription(filters));
  };

  const handleExportCSV = async () => {
    if (!selected || !ran) return;
    if (data.length === 0) {
      alert('No data to export. Adjust filters or create records first.');
      return;
    }
    const def = REPORTS.find(r => r.id === selected)!;
    const { headers, rows } = getHeadersAndRows(selected, data);
    await exportReportCSV(currentUserId, def.fileSlug, headers, rows);
  };

  const handleSelectReport = (id: ReportType) => {
    setSelected(id);
    setFilters({ status: '', dateFrom: '', dateTo: '' });
    setData([]);
    setRan(false);
    setError(null);
    setDateRangeError(null);
  };

  const handleBack = () => {
    setSelected(null);
    setData([]);
    setRan(false);
    setError(null);
    setDateRangeError(null);
  };

  const selectedDef = selected ? REPORTS.find(r => r.id === selected) : null;
  const hasData = ran && data.length > 0;

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <BarChart3 size={20} className="text-[#1E3A5F]" />
        <div>
          <h1 className="text-lg font-bold text-[#1E3A5F]">Reports</h1>
          <p className="text-xs text-[#64748B]">Generate, preview, print, and export QMS reports</p>
        </div>
      </div>

      {!selected ? (
        /* Report selection grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {availableReports.map(r => (
            <button
              key={r.id}
              onClick={() => handleSelectReport(r.id)}
              className="bg-white border border-[#E2E8F0] rounded-lg p-5 text-left hover:shadow-md hover:border-[#C7D7E8] transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#EBF2FA] text-[#1E3A5F] flex items-center justify-center shrink-0 group-hover:bg-[#1E3A5F] group-hover:text-white transition-colors">
                  {r.icon}
                </div>
                <ChevronRight size={16} className="text-[#64748B] mt-1 shrink-0 group-hover:text-[#1E3A5F]" />
              </div>
              <h3 className="text-sm font-semibold text-[#1A202C] mt-3">{r.label}</h3>
              <p className="text-xs text-[#64748B] mt-1">{r.description}</p>
            </button>
          ))}
          {availableReports.length === 0 && (
            <p className="text-sm text-[#64748B] col-span-3 py-8 text-center">
              No reports are available with your current permissions.
            </p>
          )}
        </div>
      ) : (
        /* Report view with filters + preview */
        <div className="space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#1E3A5F] transition-colors"
            >
              <ArrowLeft size={14} />
              All Reports
            </button>
            <span className="text-[#E2E8F0]">/</span>
            <div className="flex items-center gap-2 text-[#1E3A5F]">
              {selectedDef?.icon}
              <span className="text-sm font-semibold">{selectedDef?.label}</span>
            </div>
          </div>

          {/* Filter card */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Filter size={14} className="text-[#1E3A5F]" />
              <h2 className="text-sm font-semibold text-[#1A202C]">Filters</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">Status</label>
                <select
                  value={filters.status}
                  onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                >
                  <option value="">All Statuses</option>
                  {selectedDef?.statusOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {/* Date from */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">Created From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={e => {
                    setFilters(f => ({ ...f, dateFrom: e.target.value }));
                    setDateRangeError(null);
                  }}
                  className="w-full h-9 px-3 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                />
              </div>
              {/* Date to */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">Created To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={e => {
                    setFilters(f => ({ ...f, dateTo: e.target.value }));
                    setDateRangeError(null);
                  }}
                  className="w-full h-9 px-3 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                />
              </div>
            </div>

            {/* Date range validation error */}
            {dateRangeError && (
              <p className="mt-2 text-xs text-red-600">{dateRangeError}</p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <button
                onClick={runReport}
                disabled={loading}
                className="px-4 py-2 bg-[#1E3A5F] text-white text-sm font-medium rounded-md hover:bg-[#2E5080] transition-colors disabled:opacity-50"
              >
                {loading ? 'Generating…' : 'Generate Report'}
              </button>

              {ran && (
                <>
                  <button
                    onClick={handlePrint}
                    disabled={!hasData}
                    title={hasData ? 'Print or save as PDF' : 'No data to print'}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#1E3A5F] border border-[#E2E8F0] rounded-md hover:bg-[#F4F6F9] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Printer size={14} />
                    Print / Save as PDF
                  </button>
                  <button
                    onClick={handleExportCSV}
                    disabled={!hasData}
                    title={hasData ? 'Export filtered data to CSV' : 'No data to export'}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#1E3A5F] border border-[#E2E8F0] rounded-md hover:bg-[#F4F6F9] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download size={14} />
                    Export CSV
                  </button>
                </>
              )}
            </div>

            {ran && hasData && (
              <p className="mt-2 text-xs text-[#64748B]">
                Tip: Use <strong>Print → Save as PDF</strong> in the print dialog to save a PDF copy.
              </p>
            )}
          </Card>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Preview table */}
          {ran && !error && (
            <Card padding={false}>
              <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between">
                <p className="text-sm font-semibold text-[#1A202C]">
                  {selectedDef?.label}
                  {' '}
                  <span className="font-normal text-[#64748B]">
                    — {data.length} record{data.length !== 1 ? 's' : ''}
                  </span>
                </p>
                <p className="text-xs text-[#64748B]">{buildFilterDescription(filters)}</p>
              </div>

              {data.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#F1F5F9] flex items-center justify-center">
                    <FileX size={22} className="text-[#94A3B8]" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-[#1A202C]">No records found</p>
                    <p className="text-xs text-[#64748B] mt-1">Adjust filters or create records first</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <ReportPreviewTable type={selected} data={data} />
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline preview table ──────────────────────────────────────────────────────

function fmtD(iso: string | null | undefined) {
  return iso ? iso.split('T')[0] : '—';
}

function StatusCell({ status }: { status: string }) {
  const style = statusStyle(status);
  return <span style={{ fontSize: 11, fontWeight: 600, ...Object.fromEntries(style.split(';').filter(Boolean).map(s => { const [k,v] = s.split(':'); return [k.trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase()), v.trim()]; })) }}>{status}</span>;
}

function ReportPreviewTable({ type, data }: { type: ReportType; data: ReportRow[] }) {
  const th = 'px-3 py-2 text-left text-[11px] font-semibold text-[#64748B] uppercase tracking-wide border-b border-[#E2E8F0] bg-[#F8FAFC] whitespace-nowrap';
  const td = 'px-3 py-2 text-[12px] text-[#1A202C] border-b border-[#F1F5F9] max-w-[200px] truncate';

  switch (type) {
    case 'documents':
      return (
        <table className="w-full min-w-max">
          <thead><tr>
            {['Doc #','Title','Category','Version','Status','Owner','Effective Date'].map(h => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {(data as DocumentReportRow[]).map(r => (
              <tr key={r.id} className="hover:bg-[#F8FAFC]">
                <td className={td + ' font-mono'}>{r.doc_number}</td>
                <td className={td}>{r.title}</td>
                <td className={td}>{r.category ?? '—'}</td>
                <td className={td}>{r.version}</td>
                <td className={td}><StatusCell status={r.status} /></td>
                <td className={td}>{r.owner_name ?? '—'}</td>
                <td className={td}>{fmtD(r.effective_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'capas':
      return (
        <table className="w-full min-w-max">
          <thead><tr>
            {['CAPA #','Title','Type','Source','Priority','Status','Due Date','Responsible'].map(h => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {(data as CapaReportRow[]).map(r => (
              <tr key={r.id} className="hover:bg-[#F8FAFC]">
                <td className={td + ' font-mono'}>{r.capa_number}</td>
                <td className={td}>{r.title}</td>
                <td className={td}>{r.capa_type}</td>
                <td className={td}>{r.source_type ?? '—'}</td>
                <td className={td}>{r.priority ?? '—'}</td>
                <td className={td}><StatusCell status={r.status} /></td>
                <td className={td}>{fmtD(r.due_date)}</td>
                <td className={td}>{r.responsible_user_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'risks':
      return (
        <table className="w-full min-w-max">
          <thead><tr>
            {['Risk #','Title','Category','Level','Score','Status','Responsible'].map(h => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {(data as RiskReportRow[]).map(r => (
              <tr key={r.id} className="hover:bg-[#F8FAFC]">
                <td className={td + ' font-mono'}>{r.risk_number}</td>
                <td className={td}>{r.title}</td>
                <td className={td}>{r.category ?? '—'}</td>
                <td className={td}>{r.risk_level ?? '—'}</td>
                <td className={td}>{r.risk_score ?? '—'}</td>
                <td className={td}><StatusCell status={r.status} /></td>
                <td className={td}>{r.responsible_user_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'complaints':
      return (
        <table className="w-full min-w-max">
          <thead><tr>
            {['Complaint #','Customer','Customer ID','Title','Priority','Status','Received'].map(h => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {(data as ComplaintReportRow[]).map(r => (
              <tr key={r.id} className="hover:bg-[#F8FAFC]">
                <td className={td + ' font-mono'}>{r.complaint_number}</td>
                <td className={td}>{r.customer_name}</td>
                <td className={td}>{r.customer_id}</td>
                <td className={td}>{r.title}</td>
                <td className={td}>{r.priority ?? '—'}</td>
                <td className={td}><StatusCell status={r.status} /></td>
                <td className={td}>{fmtD(r.received_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'audits':
      return (
        <table className="w-full min-w-max">
          <thead><tr>
            {['Audit #','Title','Type','Department','Status','Planned','Actual','Auditor','Findings'].map(h => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {(data as AuditReportRow[]).map(r => (
              <tr key={r.id} className="hover:bg-[#F8FAFC]">
                <td className={td + ' font-mono'}>{r.audit_number}</td>
                <td className={td}>{r.title}</td>
                <td className={td}>{r.audit_type ?? '—'}</td>
                <td className={td}>{r.department ?? '—'}</td>
                <td className={td}><StatusCell status={r.status} /></td>
                <td className={td}>{fmtD(r.planned_date)}</td>
                <td className={td}>{fmtD(r.actual_date)}</td>
                <td className={td}>{r.lead_auditor_name ?? '—'}</td>
                <td className={td}>{r.findings_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'ncs':
      return (
        <table className="w-full min-w-max">
          <thead><tr>
            {['NC #','Title','Source','Severity','Status','Detected','Responsible','CAPA'].map(h => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {(data as NcReportRow[]).map(r => (
              <tr key={r.id} className="hover:bg-[#F8FAFC]">
                <td className={td + ' font-mono'}>{r.nc_number}</td>
                <td className={td}>{r.title}</td>
                <td className={td}>{r.source ?? '—'}</td>
                <td className={td}>{r.severity}</td>
                <td className={td}><StatusCell status={r.status} /></td>
                <td className={td}>{fmtD(r.detected_date)}</td>
                <td className={td}>{r.responsible_user_name ?? '—'}</td>
                <td className={td}>{r.related_capa_id ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}
