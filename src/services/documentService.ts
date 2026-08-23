import { invoke } from '@tauri-apps/api/core';
import type { DocumentListItem, DocumentRevision, ActivityEntry } from '../types/document';

export async function listDocuments(currentUserId: number): Promise<DocumentListItem[]> {
  return invoke<DocumentListItem[]>('list_documents', { currentUserId });
}

export async function getDocument(currentUserId: number, documentId: number): Promise<DocumentListItem> {
  return invoke<DocumentListItem>('get_document', { currentUserId, documentId });
}

export async function createDocument(
  currentUserId: number,
  title: string,
  documentType: string,
  version: string,
  ownerUserId: number | null,
  approvalDate: string | null,
  description: string | null,
): Promise<DocumentListItem> {
  return invoke<DocumentListItem>('create_document', {
    currentUserId, title, documentType, version, ownerUserId, approvalDate, description,
  });
}

export async function updateDocument(
  currentUserId: number,
  documentId: number,
  title: string,
  documentType: string,
  version: string,
  ownerUserId: number | null,
  approvalDate: string | null,
  description: string | null,
): Promise<DocumentListItem> {
  return invoke<DocumentListItem>('update_document', {
    currentUserId, documentId, title, documentType, version, ownerUserId, approvalDate, description,
  });
}

export async function setDocumentStatus(
  currentUserId: number,
  documentId: number,
  status: string,
): Promise<DocumentListItem> {
  return invoke<DocumentListItem>('set_document_status', { currentUserId, documentId, status });
}

export async function attachDocumentFile(
  currentUserId: number,
  documentId: number,
  sourcePath: string,
  originalFileName: string,
  changeSummary: string | null,
): Promise<DocumentListItem> {
  return invoke<DocumentListItem>('attach_document_file', {
    currentUserId, documentId, sourcePath, originalFileName, changeSummary,
  });
}

export async function listDocumentRevisions(
  currentUserId: number,
  documentId: number,
): Promise<DocumentRevision[]> {
  return invoke<DocumentRevision[]>('list_document_revisions', { currentUserId, documentId });
}

export async function getDocumentActivity(
  currentUserId: number,
  documentId: number,
): Promise<ActivityEntry[]> {
  return invoke<ActivityEntry[]>('get_document_activity', { currentUserId, documentId });
}

export async function openDocumentFile(currentUserId: number, documentId: number): Promise<void> {
  return invoke('open_document_file', { currentUserId, documentId });
}

