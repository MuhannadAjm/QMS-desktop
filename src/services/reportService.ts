import { invoke } from '@tauri-apps/api/core';
import type {
  DocumentReportRow,
  CapaReportRow,
  RiskReportRow,
  ComplaintReportRow,
  AuditReportRow,
  NcReportRow,
  ReportFilters,
} from '../types/reports';

export function getDocumentRegisterReport(
  currentUserId: number,
  filters: ReportFilters,
): Promise<DocumentReportRow[]> {
  return invoke('get_document_register_report', {
    currentUserId,
    status:   filters.status   || null,
    dateFrom: filters.dateFrom || null,
    dateTo:   filters.dateTo   || null,
  });
}

export function getCapaReport(
  currentUserId: number,
  filters: ReportFilters,
): Promise<CapaReportRow[]> {
  return invoke('get_capa_report', {
    currentUserId,
    status:            filters.status   || null,
    dateFrom:          filters.dateFrom || null,
    dateTo:            filters.dateTo   || null,
    responsibleUserId: filters.responsibleUserId ?? null,
  });
}

export function getRiskReport(
  currentUserId: number,
  filters: ReportFilters,
): Promise<RiskReportRow[]> {
  return invoke('get_risk_report', {
    currentUserId,
    status:   filters.status   || null,
    dateFrom: filters.dateFrom || null,
    dateTo:   filters.dateTo   || null,
  });
}

export function getComplaintReport(
  currentUserId: number,
  filters: ReportFilters,
): Promise<ComplaintReportRow[]> {
  return invoke('get_complaint_report', {
    currentUserId,
    status:   filters.status   || null,
    dateFrom: filters.dateFrom || null,
    dateTo:   filters.dateTo   || null,
  });
}

export function getAuditReport(
  currentUserId: number,
  filters: ReportFilters,
): Promise<AuditReportRow[]> {
  return invoke('get_audit_report', {
    currentUserId,
    status:   filters.status   || null,
    dateFrom: filters.dateFrom || null,
    dateTo:   filters.dateTo   || null,
  });
}

export function getNcReport(
  currentUserId: number,
  filters: ReportFilters,
): Promise<NcReportRow[]> {
  return invoke('get_nc_report', {
    currentUserId,
    status:   filters.status   || null,
    dateFrom: filters.dateFrom || null,
    dateTo:   filters.dateTo   || null,
  });
}
