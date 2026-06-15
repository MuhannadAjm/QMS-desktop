import { invoke } from '@tauri-apps/api/core';

export async function openLocalDocumentFile(
  userId: number,
  documentId: number,
): Promise<void> {
  await invoke<void>('open_document_file', {
    currentUserId: userId,
    documentId,
  });
}
