import { invoke } from '@tauri-apps/api/core';
import type { RiskListItem, RiskAttachment, RiskActivityEntry } from '../types/risk';

export const riskService = {
  listRisks(currentUserId: number): Promise<RiskListItem[]> {
    return invoke('list_risks', { currentUserId });
  },

  getRisk(currentUserId: number, riskRecordId: number): Promise<RiskListItem> {
    return invoke('get_risk', { currentUserId, riskRecordId });
  },

  createRisk(
    currentUserId: number,
    title: string,
    description: string | null,
    category: string | null,
    process: string | null,
    source: string | null,
    whoMightBeAffected: string | null,
    severity: number,
    likelihood: number,
    mitigationPlan: string | null,
    recommendedActions: string | null,
    timeScale: string | null,
    ownerId: number,
    reviewDate: string | null,
  ): Promise<RiskListItem> {
    return invoke('create_risk', {
      currentUserId,
      title,
      description,
      category,
      process,
      source,
      whoMightBeAffected,
      severity,
      likelihood,
      mitigationPlan,
      recommendedActions,
      timeScale,
      ownerId,
      reviewDate,
    });
  },

  updateRisk(
    currentUserId: number,
    riskRecordId: number,
    title: string,
    description: string | null,
    category: string | null,
    process: string | null,
    source: string | null,
    whoMightBeAffected: string | null,
    severity: number,
    likelihood: number,
    mitigationPlan: string | null,
    recommendedActions: string | null,
    timeScale: string | null,
    ownerId: number,
    reviewDate: string | null,
  ): Promise<RiskListItem> {
    return invoke('update_risk', {
      currentUserId,
      riskRecordId,
      title,
      description,
      category,
      process,
      source,
      whoMightBeAffected,
      severity,
      likelihood,
      mitigationPlan,
      recommendedActions,
      timeScale,
      ownerId,
      reviewDate,
    });
  },

  setRiskStatus(currentUserId: number, riskRecordId: number, status: string): Promise<RiskListItem> {
    return invoke('set_risk_status', { currentUserId, riskRecordId, status });
  },

  getRiskActivity(currentUserId: number, riskRecordId: number): Promise<RiskActivityEntry[]> {
    return invoke('get_risk_activity', { currentUserId, riskRecordId });
  },

  attachRiskFile(
    currentUserId: number,
    riskRecordId: number,
    sourceFilePath: string,
    originalFileName: string,
    note: string | null,
  ): Promise<RiskAttachment> {
    return invoke('attach_risk_file', {
      currentUserId,
      riskRecordId,
      sourceFilePath,
      originalFileName,
      note,
    });
  },

  openRiskAttachment(currentUserId: number, attachmentId: number): Promise<void> {
    return invoke('open_risk_attachment', { currentUserId, attachmentId });
  },

  listRiskAttachments(currentUserId: number, riskRecordId: number): Promise<RiskAttachment[]> {
    return invoke('list_risk_attachments', { currentUserId, riskRecordId });
  },

  createNcFromRisk(currentUserId: number, riskRecordId: number): Promise<RiskListItem> {
    return invoke('create_nc_from_risk', { currentUserId, riskRecordId });
  },

  createCapaFromRisk(currentUserId: number, riskRecordId: number): Promise<RiskListItem> {
    return invoke('create_capa_from_risk', { currentUserId, riskRecordId });
  },
};
