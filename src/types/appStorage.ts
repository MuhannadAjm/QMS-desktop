export interface AppStorageStatus {
  storage_dir: string;
  storage_initialized: boolean;
  database_initialized: boolean;
  uploads_initialized: boolean;
  migrations_applied: string[];
  settings_file_exists: boolean;
  license_file_exists: boolean;
}
