import { invoke } from '@tauri-apps/api/core';
import type { CapaListItem, CAPAAttachment, CapaActivityEntry } from '../types/capa';

export function listCapas(currentUserId: number): Promise<CapaListItem[]> {
  return invoke('list_capas', { currentUserId });
}

export function getCapa(currentUserId: number, capaRecordId: number): Promise<CapaListItem> {
  return invoke('get_capa', { currentUserId, capaRecordId });
}

export function createCapa(
  currentUserId: number,
  title: string,
  capaType: string,
  sourceType: string | null,
  sourceId: number | null,
  rootCause: string,
  rootCauseMethod: string | null,
  actionPlan: string,
  dueDate: string,
  responsibleUserId: number,
  description: string | null,
  priority: string,
): Promise<CapaListItem> {
  return invoke('create_capa', {
    currentUserId,
    title,
    capaType,
    sourceType,
    sourceId,
    rootCause,
    rootCauseMethod,
    actionPlan,
    dueDate,
    responsibleUserId,
    description,
    priority,
  });
}

export function updateCapa(
  currentUserId: number,
  capaRecordId: number,
  title: string,
  capaType: string,
  sourceType: string | null,
  sourceId: number | null,
  rootCause: string,
  rootCauseMethod: string | null,
  actionPlan: string,
  dueDate: string,
  responsibleUserId: number,
  description: string | null,
  priority: string,
  effectivenessCheck: string | null,
): Promise<CapaListItem> {
  return invoke('update_capa', {
    currentUserId,
    capaRecordId,
    title,
    capaType,
    sourceType,
    sourceId,
    rootCause,
    rootCauseMethod,
    actionPlan,
    dueDate,
    responsibleUserId,
    description,
    priority,
    effectivenessCheck,
  });
}

export function setCapaStatus(
  currentUserId: number,
  capaRecordId: number,
  status: string,
  effectivenessCheck: string | null,
): Promise<CapaListItem> {
  return invoke('set_capa_status', { currentUserId, capaRecordId, status, effectivenessCheck });
}

export function getCapaActivity(
  currentUserId: number,
  capaRecordId: number,
): Promise<CapaActivityEntry[]> {
  return invoke('get_capa_activity', { currentUserId, capaRecordId });
}

export function attachCapaFile(
  currentUserId: number,
  capaRecordId: number,
  sourceFilePath: string,
  originalFileName: string,
  note: string | null,
): Promise<CAPAAttachment> {
  return invoke('attach_capa_file', {
    currentUserId,
    capaRecordId,
    sourceFilePath,
    originalFileName,
    note,
  });
}

export function openCapaAttachment(currentUserId: number, attachmentId: number): Promise<void> {
  return invoke('open_capa_attachment', { currentUserId, attachmentId });
}

export function listCapaAttachments(
  currentUserId: number,
  capaRecordId: number,
): Promise<CAPAAttachment[]> {
  return invoke('list_capa_attachments', { currentUserId, capaRecordId });
}
