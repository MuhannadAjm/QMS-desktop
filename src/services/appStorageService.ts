import { invoke } from '@tauri-apps/api/core';
import type { AppStorageStatus } from '../types/appStorage';

/**
 * Initialize AppData directories, placeholder files, SQLite database, and
 * run pending migrations.  Call once at app startup.
 */
export async function initializeAppStorage(): Promise<AppStorageStatus> {
  return invoke<AppStorageStatus>('initialize_app_storage');
}

/**
 * Return current storage status without modifying anything.
 * Safe to call from any page that needs to display system status.
 */
export async function getAppStorageStatus(): Promise<AppStorageStatus> {
  return invoke<AppStorageStatus>('get_app_storage_status');
}
