import { invoke } from '@tauri-apps/api/core';
import type { BackupStatus } from '../types/backup';

export function getBackupStatus(currentUserId: number): Promise<BackupStatus> {
  return invoke('get_backup_status', { currentUserId });
}

export function createLocalBackup(
  currentUserId: number,
  destinationPath?: string,
): Promise<string> {
  return invoke('create_local_backup', {
    currentUserId,
    destinationPath: destinationPath ?? null,
  });
}

export function openBackupsFolder(currentUserId: number): Promise<void> {
  return invoke('open_backups_folder', { currentUserId });
}

export function validateBackupPath(
  currentUserId: number,
  backupPath: string,
): Promise<string> {
  return invoke('validate_backup_path', { currentUserId, backupPath });
}

export function restoreLocalBackup(
  currentUserId: number,
  backupPath: string,
  preserveLicense: boolean,
): Promise<string> {
  return invoke('restore_local_backup', { currentUserId, backupPath, preserveLicense });
}

export function validateImportBackup(
  currentUserId: number,
  backupPath: string,
): Promise<string> {
  return invoke('validate_import_backup', { currentUserId, backupPath });
}

export function deleteBackup(
  currentUserId: number,
  backupPath: string,
): Promise<void> {
  return invoke('delete_backup', { currentUserId, backupPath });
}
