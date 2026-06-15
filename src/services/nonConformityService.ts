import { invoke } from '@tauri-apps/api/core';
import type { NcListItem, NcAttachment, NcActivityEntry } from '../types/nonConformity';

export function listNonConformities(currentUserId: number): Promise<NcListItem[]> {
  return invoke('list_non_conformities', { currentUserId });
}

export function getNonConformity(currentUserId: number, ncId: number): Promise<NcListItem> {
  return invoke('get_non_conformity', { currentUserId, ncId });
}

export function createNonConformity(
  currentUserId: number,
  title: string,
  severity: string,
  sourceType: string,
  description: string | null,
  sourceId: number | null,
  detectedDate: string | null,
  responsibleUserId: number | null,
  containmentAction: string | null,
): Promise<NcListItem> {
  return invoke('create_non_conformity', {
    currentUserId,
    title,
    severity,
    sourceType,
    description,
    sourceId,
    detectedDate,
    responsibleUserId,
    containmentAction,
  });
}

export function updateNonConformity(
  currentUserId: number,
  ncId: number,
  title: string,
  severity: string,
  sourceType: string,
  description: string | null,
  detectedDate: string | null,
  responsibleUserId: number | null,
  containmentAction: string | null,
): Promise<NcListItem> {
  return invoke('update_non_conformity', {
    currentUserId,
    ncId,
    title,
    severity,
    sourceType,
    description,
    detectedDate,
    responsibleUserId,
    containmentAction,
  });
}

export function setNonConformityStatus(
  currentUserId: number,
  ncId: number,
  status: string,
): Promise<NcListItem> {
  return invoke('set_non_conformity_status', { currentUserId, ncId, status });
}

export function createCapaFromNonConformity(
  currentUserId: number,
  ncId: number,
): Promise<NcListItem> {
  return invoke('create_capa_from_non_conformity', { currentUserId, ncId });
}

export function attachNcFile(
  currentUserId: number,
  ncRecordId: number,
  sourceFilePath: string,
  originalFileName: string,
  note: string | null,
): Promise<NcAttachment> {
  return invoke('attach_nc_file', {
    currentUserId,
    ncRecordId,
    sourceFilePath,
    originalFileName,
    note,
  });
}

export function openNcAttachment(currentUserId: number, attachmentId: number): Promise<void> {
  return invoke('open_nc_attachment', { currentUserId, attachmentId });
}

export function listNcAttachments(
  currentUserId: number,
  ncRecordId: number,
): Promise<NcAttachment[]> {
  return invoke('list_nc_attachments', { currentUserId, ncRecordId });
}

export function getNonConformityActivity(
  currentUserId: number,
  ncRecordId: number,
): Promise<NcActivityEntry[]> {
  return invoke('get_non_conformity_activity', { currentUserId, ncRecordId });
}
