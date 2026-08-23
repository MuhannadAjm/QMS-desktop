import { invoke } from '@tauri-apps/api/core';

/**
 * Administration / master-data service.
 *
 * All QMS master data lives in the local SQLite database. Nothing here talks to
 * the licensing backend — that is a separate concern and stays isolated.
 */

// ── Risk sources ──────────────────────────────────────────────────────────────

export interface RiskSource {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  /** Risks currently referencing this source by name — drives the deactivate warning. */
  usage_count: number;
}

/** Active sources, for the Risk create/edit form. */
export async function listRiskSources(currentUserId: number): Promise<RiskSource[]> {
  return invoke<RiskSource[]>('list_risk_sources', { currentUserId });
}

/** Every source including deactivated ones — Administration screen only. */
export async function listAllRiskSources(currentUserId: number): Promise<RiskSource[]> {
  return invoke<RiskSource[]>('list_all_risk_sources', { currentUserId });
}

export async function createRiskSource(currentUserId: number, name: string): Promise<number> {
  return invoke<number>('create_risk_source', { currentUserId, name });
}

/** Returns how many existing risks were re-pointed to the new name. */
export async function renameRiskSource(
  currentUserId: number,
  id: number,
  newName: string,
): Promise<number> {
  return invoke<number>('rename_risk_source', { currentUserId, id, newName });
}

export async function setRiskSourceActive(
  currentUserId: number,
  id: number,
  isActive: boolean,
): Promise<void> {
  return invoke<void>('set_risk_source_active', { currentUserId, id, isActive });
}

export async function reorderRiskSources(
  currentUserId: number,
  orderedIds: number[],
): Promise<void> {
  return invoke<void>('reorder_risk_sources', { currentUserId, orderedIds });
}

// ── Customers ─────────────────────────────────────────────────────────────────

export interface CustomerOption {
  id: number;
  customer_code: string;
  customer_name: string;
}

export interface Customer extends CustomerOption {
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  complaint_count: number;
  created_at: string;
  updated_at: string;
}

/** Active customers, for the Complaint customer selector. */
export async function listCustomerOptions(currentUserId: number): Promise<CustomerOption[]> {
  return invoke<CustomerOption[]>('list_customer_options', { currentUserId });
}

export async function listCustomers(
  currentUserId: number,
  search?: string,
  includeInactive = true,
): Promise<Customer[]> {
  return invoke<Customer[]>('list_customers', { currentUserId, search, includeInactive });
}

export async function createCustomer(
  currentUserId: number,
  customerCode: string,
  customerName: string,
  contactEmail?: string,
  contactPhone?: string,
  notes?: string,
): Promise<number> {
  return invoke<number>('create_customer', {
    currentUserId, customerCode, customerName, contactEmail, contactPhone, notes,
  });
}

/** customer_code is intentionally not updatable — it identifies historical complaints. */
export async function updateCustomer(
  currentUserId: number,
  id: number,
  customerName: string,
  contactEmail?: string,
  contactPhone?: string,
  notes?: string,
): Promise<void> {
  return invoke<void>('update_customer', {
    currentUserId, id, customerName, contactEmail, contactPhone, notes,
  });
}

export async function setCustomerActive(
  currentUserId: number,
  id: number,
  isActive: boolean,
): Promise<void> {
  return invoke<void>('set_customer_active', { currentUserId, id, isActive });
}

// ── Assignment eligibility ──────────────────────────────────

export async function setUserEligibility(
  currentUserId: number,
  id: number,
  canBeCapaResponsible: boolean,
  canBeLeadAuditor: boolean,
): Promise<void> {
  return invoke<void>('set_user_eligibility', {
    currentUserId, id, canBeCapaResponsible, canBeLeadAuditor,
  });
}

// ── Assignment candidates (context-aware, privacy-minimal) ───────────────────

/** Only what a selector needs: stable id + display name. No email, role, or permissions. */
export interface AssignmentCandidate {
  id: number;
  name: string;
}

/**
 * Users eligible to be a CAPA responsible person.
 *
 * Authorized by CAPA business capability (create/edit/assign) - NOT by user
 * administration rights. A read-only user is correctly denied, so callers must
 * only request this when actually opening a create/edit form, never during a
 * page load, or read-only users would see a spurious error.
 */
export async function listCapaResponsibleCandidates(currentUserId: number): Promise<AssignmentCandidate[]> {
  return invoke<AssignmentCandidate[]>("list_capa_responsible_candidates", { currentUserId });
}

/** Users eligible to be an audit lead auditor. Authorized by audit create/edit/assign. */
export async function listLeadAuditorCandidates(currentUserId: number): Promise<AssignmentCandidate[]> {
  return invoke<AssignmentCandidate[]>("list_lead_auditor_candidates", { currentUserId });
}

export type OwnerModule = 'risks' | 'complaints' | 'nc' | 'documents';

/**
 * Active users who may own, or be responsible for, a record in the given module.
 *
 * These are NOT curated by an eligibility flag — unlike CAPA responsible person
 * and lead auditor — because the product makes no such distinction for risk
 * owners, complaint handlers, NC owners or document owners. Every active user is
 * offered.
 *
 * Authorized by business permission on that module, never by user administration
 * rights, so request it only when opening a form that needs it. A read-only
 * viewer is correctly refused.
 */
export async function listRecordOwnerCandidates(
  currentUserId: number,
  module: OwnerModule,
): Promise<AssignmentCandidate[]> {
  return invoke<AssignmentCandidate[]>('list_record_owner_candidates', { currentUserId, module });
}
