import { invoke } from '@tauri-apps/api/core';
import type {
  DashboardSummary,
  DashboardActivity,
  OverdueCapa,
  HighRiskItem,
  OpenNcItem,
} from '../types/dashboard';

export function getDashboardSummary(currentUserId: number): Promise<DashboardSummary> {
  return invoke('get_dashboard_summary', { currentUserId });
}

export function getDashboardRecentActivity(
  currentUserId: number,
  limit = 20,
): Promise<DashboardActivity[]> {
  return invoke('get_dashboard_recent_activity', { currentUserId, limit });
}

export function getDashboardOverdueCapas(
  currentUserId: number,
  limit = 10,
): Promise<OverdueCapa[]> {
  return invoke('get_dashboard_overdue_capas', { currentUserId, limit });
}

export function getDashboardHighRisks(
  currentUserId: number,
  limit = 10,
): Promise<HighRiskItem[]> {
  return invoke('get_dashboard_high_risks', { currentUserId, limit });
}

export function getDashboardOpenNcs(
  currentUserId: number,
  limit = 10,
): Promise<OpenNcItem[]> {
  return invoke('get_dashboard_open_ncs', { currentUserId, limit });
}
