export interface DocumentReportRow {
  id: number;
  doc_number: string;
  title: string;
  category: string | null;
  version: string;
  status: string;
  owner_name: string | null;
  effective_date: string | null;
  revision_date: string | null;
  created_at: string;
}

export interface CapaReportRow {
  id: number;
  capa_number: string;
  title: string;
  capa_type: string;
  source_type: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  responsible_user_name: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface RiskReportRow {
  id: number;
  risk_number: string;
  title: string;
  category: string | null;
  risk_level: string | null;
  risk_score: number | null;
  status: string;
  responsible_user_name: string | null;
  review_date: string | null;
  created_at: string;
}

export interface ComplaintReportRow {
  id: number;
  complaint_number: string;
  customer_name: string;
  customer_id: string;
  title: string;
  category: string | null;
  priority: string | null;
  status: string;
  received_date: string;
  created_at: string;
}

export interface AuditReportRow {
  id: number;
  audit_number: string;
  title: string;
  audit_type: string | null;
  department: string | null;
  status: string;
  planned_date: string | null;
  actual_date: string | null;
  lead_auditor_name: string | null;
  findings_count: number;
  created_at: string;
}

export interface NcReportRow {
  id: number;
  nc_number: string;
  title: string;
  source: string | null;
  severity: string;
  status: string;
  detected_date: string | null;
  responsible_user_name: string | null;
  related_capa_id: number | null;
  created_at: string;
}

export type ReportType =
  | 'documents'
  | 'capas'
  | 'risks'
  | 'complaints'
  | 'audits'
  | 'ncs';

export interface ReportFilters {
  status: string;
  dateFrom: string;
  dateTo: string;
  responsibleUserId?: number | null;
}
