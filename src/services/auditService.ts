import { invoke } from '@tauri-apps/api/core';
import type {
  AuditListItem,
  AuditFinding,
  AuditAttachment,
  AuditActivityEntry,
} from '../types/audit';

export function listAudits(currentUserId: number): Promise<AuditListItem[]> {
  return invoke('list_audits', { currentUserId });
}

export function getAudit(currentUserId: number, auditRecordId: number): Promise<AuditListItem> {
  return invoke('get_audit', { currentUserId, auditRecordId });
}

export function createAudit(
  currentUserId: number,
  title: string,
  auditType: string,
  department: string,
  auditorUserId: number,
  auditDate: string,
  scope: string | null,
  standard: string | null,
  plannedDate: string | null,
  auditee: string | null,
  summary: string | null,
): Promise<AuditListItem> {
  return invoke('create_audit', {
    currentUserId,
    title,
    auditType,
    department,
    auditorUserId,
    auditDate,
    scope,
    standard,
    plannedDate,
    auditee,
    summary,
  });
}

export function updateAudit(
  currentUserId: number,
  auditRecordId: number,
  title: string,
  auditType: string,
  department: string,
  auditorUserId: number,
  auditDate: string,
  scope: string | null,
  standard: string | null,
  plannedDate: string | null,
  auditee: string | null,
  summary: string | null,
): Promise<AuditListItem> {
  return invoke('update_audit', {
    currentUserId,
    auditRecordId,
    title,
    auditType,
    department,
    auditorUserId,
    auditDate,
    scope,
    standard,
    plannedDate,
    auditee,
    summary,
  });
}

export function setAuditStatus(
  currentUserId: number,
  auditRecordId: number,
  status: string,
): Promise<AuditListItem> {
  return invoke('set_audit_status', { currentUserId, auditRecordId, status });
}

export function listAuditFindings(
  currentUserId: number,
  auditRecordId: number,
): Promise<AuditFinding[]> {
  return invoke('list_audit_findings', { currentUserId, auditRecordId });
}

export function addAuditFinding(
  currentUserId: number,
  auditRecordId: number,
  findingType: string,
  description: string,
  severity: string,
  clauseRef: string | null,
  evidence: string | null,
  recommendedAction: string | null,
): Promise<AuditFinding> {
  return invoke('add_audit_finding', {
    currentUserId,
    auditRecordId,
    findingType,
    description,
    severity,
    clauseRef,
    evidence,
    recommendedAction,
  });
}

export function updateAuditFinding(
  currentUserId: number,
  findingId: number,
  findingType: string,
  description: string,
  severity: string,
  clauseRef: string | null,
  evidence: string | null,
  recommendedAction: string | null,
): Promise<AuditFinding> {
  return invoke('update_audit_finding', {
    currentUserId,
    findingId,
    findingType,
    description,
    severity,
    clauseRef,
    evidence,
    recommendedAction,
  });
}

export function createNcFromAuditFinding(
  currentUserId: number,
  findingId: number,
): Promise<AuditFinding> {
  return invoke('create_nc_from_audit_finding', { currentUserId, findingId });
}

export function attachAuditFile(
  currentUserId: number,
  auditRecordId: number,
  sourceFilePath: string,
  originalFileName: string,
  note: string | null,
): Promise<AuditAttachment> {
  return invoke('attach_audit_file', {
    currentUserId,
    auditRecordId,
    sourceFilePath,
    originalFileName,
    note,
  });
}

export function openAuditAttachment(currentUserId: number, attachmentId: number): Promise<void> {
  return invoke('open_audit_attachment', { currentUserId, attachmentId });
}

export function listAuditAttachments(
  currentUserId: number,
  auditRecordId: number,
): Promise<AuditAttachment[]> {
  return invoke('list_audit_attachments', { currentUserId, auditRecordId });
}

export function getAuditActivity(
  currentUserId: number,
  auditRecordId: number,
): Promise<AuditActivityEntry[]> {
  return invoke('get_audit_activity', { currentUserId, auditRecordId });
}
