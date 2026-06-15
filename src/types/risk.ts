export interface RiskListItem {
  id: number;
  risk_number: string;
  title: string;
  description: string | null;
  category: string | null;
  process: string | null;
  source: string | null;
  who_might_be_affected: string | null;
  severity: number;
  likelihood: number;
  risk_score: number;
  risk_level: string | null;
  status: string;
  mitigation_plan: string | null;
  recommended_actions: string | null;
  time_scale: string | null;
  residual_severity: number | null;
  residual_likelihood: number | null;
  residual_score: number | null;
  responsible_user_id: number | null;
  responsible_user_name: string | null;
  review_date: string | null;
  closed_at: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  // Cross-module links (Phase 8B)
  related_nc_id: number | null;
  related_nc_number: string | null;
  related_capa_id: number | null;
  related_capa_number: string | null;
}

export interface RiskAttachment {
  id: number;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

export interface RiskActivityEntry {
  id: number;
  action: string;
  description: string | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_at: string;
}

export const RISK_CATEGORIES = [
  'Quality', 'Safety', 'Environmental', 'Financial',
  'Operational', 'Regulatory', 'Reputational', 'Other',
];

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export const RISK_SOURCES = [
  'Internal Audit', 'Customer Feedback', 'Process Review',
  'Management Review', 'Supplier Assessment', 'Incident', 'Other',
];

export function computeRiskLevel(score: number): string {
  if (score >= 20) return 'CRITICAL';
  if (score >= 10) return 'HIGH';
  if (score >= 5)  return 'MEDIUM';
  return 'LOW';
}

export function riskLevelBadgeClass(level: string | null): string {
  switch (level) {
    case 'LOW':      return 'bg-green-100 text-green-800';
    case 'MEDIUM':   return 'bg-yellow-100 text-yellow-800';
    case 'HIGH':     return 'bg-orange-100 text-orange-800';
    case 'CRITICAL': return 'bg-red-100 text-red-800';
    default:         return 'bg-gray-100 text-gray-700';
  }
}

export function riskScoreCellClass(score: number): string {
  if (score >= 20) return 'bg-red-500 text-white';
  if (score >= 10) return 'bg-orange-400 text-white';
  if (score >= 5)  return 'bg-yellow-300 text-gray-900';
  return 'bg-green-300 text-gray-900';
}
