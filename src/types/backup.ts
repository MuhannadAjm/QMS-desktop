export interface BackupEntry {
  name: string;
  full_path: string;
  size_bytes: number;
  created_at: string;
}

export interface BackupStatus {
  backups_dir: string;
  database_path: string;
  database_size_bytes: number;
  uploads_size_bytes: number;
  available_backups: BackupEntry[];
}

/**
 * What a candidate backup folder turned out to contain, shown before the live
 * data is replaced. Deliberately carries no filesystem path — the operator does
 * not need one to decide, and the renderer must not be able to act on one.
 */
export interface BackupCandidate {
  folder_name: string;
  schema_version: string;
  user_count: number;
  document_count: number;
  capa_count: number;
  risk_count: number;
  complaint_count: number;
  database_size_bytes: number;
  has_uploads: boolean;
  has_settings: boolean;
  has_license: boolean;
}
