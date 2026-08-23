export type DocumentStatus = 'UNDER PROCESS' | 'CONTROLLED' | 'OBSOLETE';

export type DocumentType =
  | 'Policy'
  | 'Procedure'
  | 'Work Instruction'
  | 'Form'
  | 'Manual'
  | 'Record'
  | 'Specification'
  | 'Other';

export const DOCUMENT_TYPES: DocumentType[] = [
  'Policy',
  'Procedure',
  'Work Instruction',
  'Form',
  'Manual',
  'Record',
  'Specification',
  'Other',
];

export const DOCUMENT_STATUSES: DocumentStatus[] = [
  'UNDER PROCESS',
  'CONTROLLED',
  'OBSOLETE',
];

export interface DocumentListItem {
  id: number;
  doc_number: string;
  title: string;
  category: string;
  status: string;
  version: string;
  revision_date: string | null;
  effective_date: string | null;
  owner_id: number | null;
  owner_name: string | null;
  file_path: string | null;
  original_file_name: string | null;
  description: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  /**
   * System-generated at approval. Null until the document is approved.
   *
   * Distinct from effective_date, which older records used for a hand-typed
   * "approval date" before this column was populated — the UI falls back to it
   * so historical documents keep showing the date they were filed with.
   */
  approval_date: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  rejected_at: string | null;
  rejected_by: number | null;
  rejected_by_name: string | null;
  rejection_reason: string | null;
}

/** What the viewer needs to decide how to present a document's file. */
export interface DocumentFileInfo {
  document_id: number;
  original_file_name: string;
  extension: string;
  previewable: boolean;
  size_bytes: number;
  exists_on_disk: boolean;
}

export interface DocumentRevision {
  id: number;
  document_id: number;
  version: string;
  change_summary: string | null;
  file_path: string | null;
  original_file_name: string | null;
  revised_by: number | null;
  revised_by_name: string | null;
  revised_at: string;
}

export interface ActivityEntry {
  id: number;
  action: string;
  description: string | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_at: string;
}

export interface UserMinimal {
  id: number;
  name: string;
  role: string;
}
