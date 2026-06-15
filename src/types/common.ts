export type RecordStatus = 'OPEN' | 'CLOSED' | 'OVERDUE';
export type DocumentStatus = 'UNDER PROCESS' | 'CONTROLLED' | 'OBSOLETE';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type UserRole = 'Admin' | 'QualityManager' | 'Auditor' | 'Employee' | 'Viewer';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CAPAType = 'CORRECTIVE' | 'PREVENTIVE';
export type NCSource = 'Audit' | 'Complaint' | 'Risk' | 'Internal';
export type AuditType = 'Internal' | 'External' | 'Supplier';
export type FindingType = 'NC' | 'OFI' | 'Observation' | 'Positive';
export type RootCauseMethod = '5-Why' | 'Fishbone' | 'Fault Tree' | 'Other';

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface FilterState {
  search: string;
  status?: string;
  [key: string]: string | undefined;
}

export interface ActivityEntry {
  id: number;
  action: string;
  description: string;
  performedBy: string;
  performedAt: string;
}
