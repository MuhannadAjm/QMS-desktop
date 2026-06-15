import { invoke } from '@tauri-apps/api/core';
import type { SettingEntry, SettingsMap } from '../types/settings';

export async function getSettings(): Promise<SettingsMap> {
  const entries = await invoke<SettingEntry[]>('get_settings');
  const map: SettingsMap = {};
  for (const e of entries) {
    map[e.key] = e.value;
  }
  return map;
}

export async function updateSetting(currentUserId: number, key: string, value: string): Promise<void> {
  return invoke('update_setting', { currentUserId, key, value });
}

export async function saveSettings(currentUserId: number, changes: SettingsMap): Promise<void> {
  for (const [key, value] of Object.entries(changes)) {
    await updateSetting(currentUserId, key, value);
  }
}
