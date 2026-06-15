export interface DashboardSummary {
  open_capas: number;
  overdue_capas: number;
  closed_capas: number;
  high_risks: number;
  open_risks: number;
  open_complaints: number;
  total_complaints: number;
  open_ncs: number;
  high_critical_ncs: number;
  open_audits: number;
  closed_audits: number;
  controlled_documents: number;
  obsolete_documents: number;
}

export interface DashboardActivity {
  id: number;
  module: string;
  record_id: number;
  action: string;
  description: string | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_at: string;
}

export interface OverdueCapa {
  id: number;
  capa_number: string;
  title: string;
  due_date: string | null;
  responsible_user_name: string | null;
  priority: string | null;
}

export interface HighRiskItem {
  id: number;
  risk_number: string;
  title: string;
  risk_level: string | null;
  risk_score: number | null;
  responsible_user_name: string | null;
}

export interface OpenNcItem {
  id: number;
  nc_number: string;
  title: string;
  severity: string;
  status: string;
  detected_date: string | null;
  responsible_user_name: string | null;
}
