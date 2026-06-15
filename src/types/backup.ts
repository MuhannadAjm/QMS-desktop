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
