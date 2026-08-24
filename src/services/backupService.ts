import { invoke } from '@tauri-apps/api/core';
import type { BackupStatus, BackupCandidate } from '../types/backup';

/**
 * Backup and restore.
 *
 * No function here sends a filesystem path. Where a location is needed the
 * BACKEND opens the native dialog, so the destination or source is one a person
 * chose during that call rather than a string the renderer supplied. The
 * previous version passed paths into privileged copy and overwrite commands,
 * which made them general-purpose write and replace primitives.
 */

export function getBackupStatus(currentUserId: number): Promise<BackupStatus> {
  return invoke('get_backup_status', { currentUserId });
}

/** Back up into the application's own backups folder. */
export function createLocalBackup(currentUserId: number): Promise<string> {
  return invoke('create_local_backup', { currentUserId });
}

/**
 * Back up to a folder the operator picks. The backend presents the picker.
 * Resolves to the created location, or null if the operator cancelled.
 */
export function createBackupToFolder(currentUserId: number): Promise<string | null> {
  return invoke('create_backup_to_folder', { currentUserId });
}

export function openBackupsFolder(currentUserId: number): Promise<void> {
  return invoke('open_backups_folder', { currentUserId });
}

/**
 * Let the operator pick a backup folder, and report what is in it.
 *
 * Read-only: nothing is replaced. The chosen folder stays in the backend so the
 * restore acts on exactly what was inspected. Null means the operator cancelled.
 */
export function pickAndInspectBackup(currentUserId: number): Promise<BackupCandidate | null> {
  return invoke('pick_and_inspect_backup', { currentUserId });
}

/** Restore the folder most recently accepted by pickAndInspectBackup. */
export function restorePendingBackup(
  currentUserId: number,
  preserveLicense: boolean,
): Promise<string> {
  return invoke('restore_pending_backup', { currentUserId, preserveLicense });
}

/** Restore one of the application's own listed backups, by folder name. */
export function restoreManagedBackup(
  currentUserId: number,
  backupName: string,
  preserveLicense: boolean,
): Promise<string> {
  return invoke('restore_managed_backup', { currentUserId, backupName, preserveLicense });
}

/** Delete one of the application's own backups, by folder name. */
export function deleteBackup(currentUserId: number, backupName: string): Promise<void> {
  return invoke('delete_backup', { currentUserId, backupName });
}
