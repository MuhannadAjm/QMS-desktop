import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, ChevronRight, X, AlertCircle, RefreshCw,
  Paperclip, ExternalLink, FileText, Activity, ClipboardList,
  Info, Clock, CheckSquare, AlignLeft,
} from 'lucide-react';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import ModuleToolbar from '../components/ui/ModuleToolbar';
import FilterBar from '../components/ui/FilterBar';
import {
  listCapas, getCapa, createCapa, updateCapa, setCapaStatus,
  getCapaActivity, attachCapaFile, openCapaAttachment, listCapaAttachments,
} from '../services/capaService';
import { listUsersMinimal } from '../services/documentService';
import { exportCapasCSV, exportCapasJSON } from '../services/exportService';
import { printCapaRegister } from '../services/printService';
import type { CapaListItem, CAPAAttachment, CapaActivityEntry } from '../types/capa';
import { CAPA_TYPES, SOURCE_TYPES, CAPA_PRIORITIES, ROOT_CAUSE_METHODS } from '../types/capa';
import type { UserMinimal } from '../types/document';

// ─── Types ────────────────────────────────────────────────────────────────────

type DrawerTab = 'details' | 'action' | 'attachments' | 'activity';

interface CapaForm {
  title: string;
  capa_type: string;
  source_type: string;
  source_id: string;
  root_cause: string;
  root_cause_method: string;
  action_plan: string;
  due_date: string;
  responsible_user_id: string;
  description: string;
  priority: string;
  effectiveness_check: string;
}

const EMPTY_FORM: CapaForm = {
  title: '',
  capa_type: 'CORRECTIVE',
  source_type: '',
  source_id: '',
  root_cause: '',
  root_cause_method: '',
  action_plan: '',
  due_date: '',
  responsible_user_id: '',
  description: '',
  priority: 'MEDIUM',
  effectiveness_check: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.split('T')[0];
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.split('T');
  return d.length >= 2 ? `${d[0]} ${d[1].slice(0, 5)}` : iso;
}

function fmtBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function priorityCls(p: string | null): string {
  switch (p) {
    case 'CRITICAL': return 'bg-[#FEE2E2] text-[#DC2626]';
    case 'HIGH':     return 'bg-[#FFEDD5] text-[#EA580C]';
    case 'MEDIUM':   return 'bg-[#FEF9C3] text-[#92400E]';
    default:         return 'bg-[#F1F5F9] text-[#64748B]';
  }
}

function typeCls(t: string): string {
  return t === 'PREVENTIVE'
    ? 'bg-[#F3E8FF] text-[#7C3AED]'
    : 'bg-[#DBEAFE] text-[#1D4ED8]';
}

// ─── ImportNoticeModal ────────────────────────────────────────────────────────

function ImportNoticeModal({ open: isOpen, onClose }: { open: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-[#EBF2FA] flex items-center justify-center shrink-0">
            <Info size={18} className="text-[#1E3A5F]" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-[#1E3A5F]">Import CAPAs</h2>
            <p className="text-[13px] text-[#64748B] mt-1">
              Bulk import is not yet available in this release.
            </p>
          </div>
        </div>
        <p className="text-[13px] text-[#475569] mb-5">
          When available, import will support CSV and JSON formats with a preview step
          before any records are written to the database.
          Use <strong>New CAPA</strong> to add records individually.
        </p>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ─── CloseCapaModal ───────────────────────────────────────────────────────────

function CloseCapaModal({
  open: isOpen,
  capa,
  effectivenessCheck,
  onChange,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  capa: CapaListItem | null;
  effectivenessCheck: string;
  onChange: (v: string) => void;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen || !capa) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-[#1E3A5F]">Close CAPA</h2>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E3A5F]">
            <X size={18} />
          </button>
        </div>
        <p className="text-[13px] text-[#475569] mb-4">
          You are closing <strong>{capa.capa_number}</strong>. An effectiveness check is required
          to confirm the corrective/preventive action was successful.
        </p>
        <div className="mb-4">
          <label className="block text-[12px] font-semibold text-[#64748B] mb-1.5 uppercase tracking-wide">
            Effectiveness Check <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            value={effectivenessCheck}
            onChange={e => onChange(e.target.value)}
            placeholder="Describe the result of the effectiveness check — was the action effective? Evidence?"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[13px] text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
          />
        </div>
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-[12px] mb-3">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} disabled={loading || !effectivenessCheck.trim()}>
            {loading ? 'Closing…' : 'Close CAPA'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── ReopenCapaModal ──────────────────────────────────────────────────────────

function ReopenCapaModal({
  open: isOpen,
  capa,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  capa: CapaListItem | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen || !capa) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-[#1E3A5F]">Reopen CAPA</h2>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E3A5F]">
            <X size={18} />
          </button>
        </div>
        <p className="text-[13px] text-[#475569] mb-5">
          Reopen <strong>{capa.capa_number}</strong>? The closed date will be cleared and
          the status will return to <strong>OPEN</strong>.
        </p>
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-[12px] mb-3">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} disabled={loading}>
            {loading ? 'Reopening…' : 'Reopen CAPA'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── CapaModal (Create / Edit) ────────────────────────────────────────────────

function CapaModal({
  open: isOpen,
  mode,
  form,
  onChange,
  users,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  form: CapaForm;
  onChange: (field: keyof CapaForm, value: string) => void;
  users: UserMinimal[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!isOpen) return null;

  const field = (
    label: string,
    key: keyof CapaForm,
    required = false,
    type = 'text',
    placeholder = ''
  ) => (
    <div>
      <label className="block text-[12px] font-semibold text-[#64748B] mb-1.5 uppercase tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={e => onChange(key, e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[13px] text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
      />
    </div>
  );

  const select = (label: string, key: keyof CapaForm, opts: { value: string; label: string }[], required = false) => (
    <div>
      <label className="block text-[12px] font-semibold text-[#64748B] mb-1.5 uppercase tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        value={form[key]}
        onChange={e => onChange(key, e.target.value)}
        className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[13px] text-[#1A202C] focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
      >
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const textarea = (label: string, key: keyof CapaForm, required = false, rows = 3, placeholder = '') => (
    <div>
      <label className="block text-[12px] font-semibold text-[#64748B] mb-1.5 uppercase tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        rows={rows}
        value={form[key]}
        onChange={e => onChange(key, e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[13px] text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#E2E8F0]">
          <h2 className="text-[15px] font-semibold text-[#1E3A5F]">
            {mode === 'create' ? 'New CAPA' : 'Edit CAPA'}
          </h2>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E3A5F]">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {field('Title', 'title', true, 'text', 'Brief description of the issue or action')}

          <div className="grid grid-cols-2 gap-4">
            {select('Type', 'capa_type', CAPA_TYPES.map(t => ({ value: t, label: t })), true)}
            {select('Priority', 'priority', CAPA_PRIORITIES.map(p => ({ value: p, label: p })), true)}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {select('Source Type', 'source_type', [
              { value: '', label: '— None —' },
              ...SOURCE_TYPES.map(s => ({ value: s, label: s })),
            ])}
            {field('Source Reference ID', 'source_id', false, 'text', 'Optional linked record ID')}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#64748B] mb-1.5 uppercase tracking-wide">
                Responsible Person <span className="text-red-500">*</span>
              </label>
              <select
                value={form.responsible_user_id}
                onChange={e => onChange('responsible_user_id', e.target.value)}
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[13px] text-[#1A202C] focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
              >
                <option value="">— Select person —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>
            {field('Due Date', 'due_date', true, 'date')}
          </div>

          {textarea('Description', 'description', false, 2, 'Optional context or background')}

          {textarea('Root Cause', 'root_cause', true, 3, 'Describe the root cause of the issue')}

          {select('Root Cause Method', 'root_cause_method', [
            { value: '', label: '— None —' },
            ...ROOT_CAUSE_METHODS.map(m => ({ value: m, label: m })),
          ])}

          {textarea('Action Plan', 'action_plan', true, 4, 'Steps taken or planned to address the root cause')}

          {mode === 'edit' && textarea(
            'Effectiveness Check',
            'effectiveness_check',
            false, 3,
            'Optional — describe effectiveness check results (required before closing)'
          )}
        </div>

        {error && (
          <div className="mx-6 mb-4 flex items-center gap-2 text-red-600 text-[12px]">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="flex justify-end gap-2 px-6 pb-5">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" onClick={onSubmit} disabled={loading}>
            {loading ? 'Saving…' : (mode === 'create' ? 'Create CAPA' : 'Save Changes')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Drawer sub-components ────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2.5 border-b border-[#F1F5F9] last:border-0">
      <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide shrink-0">{label}</span>
      <span className="text-[13px] text-[#1E3A5F] text-right">{value}</span>
    </div>
  );
}

function DetailsTab({ capa }: { capa: CapaListItem }) {
  const statusLabel = capa.is_overdue && capa.status === 'OPEN' ? 'OVERDUE' : capa.status;
  return (
    <div className="p-4 space-y-0">
      <Row label="CAPA #" value={<span className="font-mono font-bold">{capa.capa_number}</span>} />
      <Row label="Type" value={
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${typeCls(capa.capa_type)}`}>
          {capa.capa_type}
        </span>
      } />
      <Row label="Status" value={<StatusBadge status={statusLabel} />} />
      <Row label="Priority" value={
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${priorityCls(capa.priority)}`}>
          {capa.priority ?? '—'}
        </span>
      } />
      <Row label="Source" value={capa.source_type ?? '—'} />
      {capa.source_id && <Row label="Source Ref" value={String(capa.source_id)} />}
      <Row label="Responsible" value={capa.responsible_user_name ?? '—'} />
      <Row label="Due Date" value={
        <span className={capa.is_overdue ? 'text-red-600 font-medium' : ''}>
          {fmtDate(capa.due_date)}
        </span>
      } />
      {capa.description && (
        <div className="py-2.5 border-b border-[#F1F5F9]">
          <span className="block text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-1">Description</span>
          <p className="text-[13px] text-[#1E3A5F] leading-relaxed">{capa.description}</p>
        </div>
      )}
      <Row label="Created By" value={capa.created_by_name ?? '—'} />
      <Row label="Created" value={fmtDateTime(capa.created_at)} />
      <Row label="Last Updated" value={fmtDateTime(capa.updated_at)} />
      {capa.closed_at && <Row label="Closed" value={fmtDateTime(capa.closed_at)} />}
    </div>
  );
}

function ActionPlanTab({ capa }: { capa: CapaListItem }) {
  return (
    <div className="p-4 space-y-5">
      <div>
        <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Root Cause Method</p>
        <p className="text-[13px] text-[#64748B]">{capa.root_cause_method ?? '—'}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Root Cause</p>
        <p className="text-[13px] text-[#1E3A5F] leading-relaxed whitespace-pre-wrap">
          {capa.root_cause ?? '—'}
        </p>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Action Plan</p>
        <p className="text-[13px] text-[#1E3A5F] leading-relaxed whitespace-pre-wrap">
          {capa.action_plan ?? '—'}
        </p>
      </div>
      {capa.effectiveness_check && (
        <div className="bg-[#F0FFF4] border border-[#BBF7D0] rounded-lg p-3">
          <p className="text-[11px] font-semibold text-[#15803D] uppercase tracking-wide mb-1.5">
            Effectiveness Check
          </p>
          <p className="text-[13px] text-[#1E3A5F] leading-relaxed whitespace-pre-wrap">
            {capa.effectiveness_check}
          </p>
          {capa.effectiveness_date && (
            <p className="text-[11px] text-[#64748B] mt-1.5">{fmtDate(capa.effectiveness_date)}</p>
          )}
        </div>
      )}
    </div>
  );
}

function AttachmentsTab({
  attachments,
  loading,
  canEdit,
  pendingFilePath,
  pendingFileName,
  attachNote,
  attachLoading,
  attachError,
  onBrowse,
  onAttachNoteChange,
  onAttach,
  onClearPending,
  onOpen,
}: {
  attachments: CAPAAttachment[];
  loading: boolean;
  canEdit: boolean;
  pendingFilePath: string | null;
  pendingFileName: string;
  attachNote: string;
  attachLoading: boolean;
  attachError: string | null;
  onBrowse: () => void;
  onAttachNoteChange: (v: string) => void;
  onAttach: () => void;
  onClearPending: () => void;
  onOpen: (id: number) => void;
}) {
  return (
    <div className="p-4 space-y-4">
      {canEdit && (
        <div className="border border-[#E2E8F0] rounded-lg p-3 bg-[#F8FAFC]">
          {!pendingFilePath ? (
            <Button variant="secondary" size="sm" onClick={onBrowse}>
              <Paperclip size={13} /> Browse file…
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium text-[#1E3A5F] truncate">{pendingFileName}</p>
                <button onClick={onClearPending} className="text-[#94A3B8] hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
              <input
                type="text"
                value={attachNote}
                onChange={e => onAttachNoteChange(e.target.value)}
                placeholder="Optional note"
                className="w-full border border-[#E2E8F0] rounded-md px-2.5 py-1.5 text-[12px] text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#2E5080]"
              />
              {attachError && (
                <p className="text-[11px] text-red-600 flex items-center gap-1">
                  <AlertCircle size={12} /> {attachError}
                </p>
              )}
              <Button variant="primary" size="sm" onClick={onAttach} disabled={attachLoading}>
                {attachLoading ? 'Attaching…' : 'Attach File'}
              </Button>
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-[12px] text-[#94A3B8]">Loading…</p>}

      {!loading && attachments.length === 0 && (
        <p className="text-[12px] text-[#94A3B8] text-center py-4">No attachments yet.</p>
      )}

      {attachments.map(a => (
        <div key={a.id} className="flex items-center justify-between gap-2 py-2 border-b border-[#F1F5F9] last:border-0">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[#1E3A5F] truncate">{a.file_name}</p>
            <p className="text-[11px] text-[#94A3B8]">
              {a.uploaded_by_name ?? '—'} &middot; {fmtDate(a.uploaded_at)}
              {a.file_size ? ` · ${fmtBytes(a.file_size)}` : ''}
            </p>
          </div>
          <button
            onClick={() => onOpen(a.id)}
            className="text-[#2E5080] hover:text-[#1E3A5F] shrink-0"
            title="Open file"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ActivityTab({ activity, loading }: { activity: CapaActivityEntry[]; loading: boolean }) {
  if (loading) return <p className="p-4 text-[12px] text-[#94A3B8]">Loading…</p>;
  if (activity.length === 0) {
    return <p className="p-4 text-[12px] text-[#94A3B8] text-center py-6">No activity yet.</p>;
  }
  return (
    <div className="p-4 space-y-0">
      {activity.map((entry, i) => (
        <div key={entry.id} className="flex gap-3 pb-4">
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-full bg-[#EBF2FA] flex items-center justify-center shrink-0">
              <CheckCircle2 size={13} className="text-[#1E3A5F]" />
            </div>
            {i < activity.length - 1 && <div className="w-0.5 flex-1 bg-[#E2E8F0] mt-1" />}
          </div>
          <div className="pb-1 min-w-0">
            <p className="text-[12px] font-semibold text-[#1E3A5F]">{entry.action}</p>
            {entry.description && (
              <p className="text-[12px] text-[#475569] mt-0.5 leading-relaxed">{entry.description}</p>
            )}
            <p className="text-[11px] text-[#94A3B8] mt-0.5">
              {entry.performed_by_name ?? 'System'} &middot; {fmtDateTime(entry.performed_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── DetailsDrawer ────────────────────────────────────────────────────────────

function DetailsDrawer({
  capa,
  tab,
  onTabChange,
  attachments,
  activity,
  drawerLoading,
  canEdit,
  pendingFilePath,
  pendingFileName,
  attachNote,
  attachLoading,
  attachError,
  onBrowse,
  onAttachNoteChange,
  onAttach,
  onClearPending,
  onOpenAttachment,
  onClose,
  onEdit,
  onCloseCapa,
  onReopenCapa,
}: {
  capa: CapaListItem;
  tab: DrawerTab;
  onTabChange: (t: DrawerTab) => void;
  attachments: CAPAAttachment[];
  activity: CapaActivityEntry[];
  drawerLoading: boolean;
  canEdit: boolean;
  pendingFilePath: string | null;
  pendingFileName: string;
  attachNote: string;
  attachLoading: boolean;
  attachError: string | null;
  onBrowse: () => void;
  onAttachNoteChange: (v: string) => void;
  onAttach: () => void;
  onClearPending: () => void;
  onOpenAttachment: (id: number) => void;
  onClose: () => void;
  onEdit: () => void;
  onCloseCapa: () => void;
  onReopenCapa: () => void;
}) {
  const statusLabel = capa.is_overdue && capa.status === 'OPEN' ? 'OVERDUE' : capa.status;
  const tabs: { id: DrawerTab; label: string; icon: React.ReactNode }[] = [
    { id: 'details',     label: 'Details',     icon: <FileText size={13} /> },
    { id: 'action',      label: 'Action Plan', icon: <AlignLeft size={13} /> },
    { id: 'attachments', label: 'Attachments', icon: <Paperclip size={13} /> },
    { id: 'activity',    label: 'Activity',    icon: <Activity size={13} /> },
  ];

  return (
    <div className="w-[460px] shrink-0 border-l border-[#E2E8F0] bg-white flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-[#E2E8F0]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12px] font-bold text-[#2E5080]">{capa.capa_number}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${typeCls(capa.capa_type)}`}>
              {capa.capa_type}
            </span>
            <StatusBadge status={statusLabel} />
          </div>
          <p className="text-[14px] font-semibold text-[#1E3A5F] mt-1 leading-snug">{capa.title}</p>
        </div>
        <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E3A5F] ml-2 shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
          {capa.status === 'OPEN' && (
            <Button variant="primary" size="sm" onClick={onCloseCapa}>
              <CheckSquare size={13} /> Close CAPA
            </Button>
          )}
          {capa.status === 'CLOSED' && (
            <Button variant="secondary" size="sm" onClick={onReopenCapa}>
              <RefreshCw size={13} /> Reopen
            </Button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#E2E8F0] bg-[#F8FAFC]">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-[#1E3A5F] text-[#1E3A5F]'
                : 'border-transparent text-[#64748B] hover:text-[#1E3A5F]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'details' && <DetailsTab capa={capa} />}
        {tab === 'action' && <ActionPlanTab capa={capa} />}
        {tab === 'attachments' && (
          <AttachmentsTab
            attachments={attachments}
            loading={drawerLoading}
            canEdit={canEdit}
            pendingFilePath={pendingFilePath}
            pendingFileName={pendingFileName}
            attachNote={attachNote}
            attachLoading={attachLoading}
            attachError={attachError}
            onBrowse={onBrowse}
            onAttachNoteChange={onAttachNoteChange}
            onAttach={onAttach}
            onClearPending={onClearPending}
            onOpen={onOpenAttachment}
          />
        )}
        {tab === 'activity' && (
          <ActivityTab activity={activity} loading={drawerLoading} />
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CAPA() {
  const { user } = useAuthStore();
  const { companyName } = useSettingsStore();
  const canEdit = user?.role === 'Admin' || user?.role === 'QualityManager';

  // Data
  const [capas, setCapas] = useState<CapaListItem[]>([]);
  const [users, setUsers] = useState<UserMinimal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [overdueFilter, setOverdueFilter] = useState('');

  // Drawer
  const [selected, setSelected] = useState<CapaListItem | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('details');
  const [attachments, setAttachments] = useState<CAPAAttachment[]>([]);
  const [activity, setActivity] = useState<CapaActivityEntry[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // File attach
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');
  const [attachNote, setAttachNote] = useState('');
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<CapaForm>(EMPTY_FORM);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Close modal
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeEffCheck, setCloseEffCheck] = useState('');
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  // Reopen modal
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenLoading, setReopenLoading] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  // Import notice
  const [importNoticeOpen, setImportNoticeOpen] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [capaData, userData] = await Promise.all([
        listCapas(user.id),
        listUsersMinimal(user.id),
      ]);
      setCapas(capaData);
      setUsers(userData);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── KPIs ─────────────────────────────────────────────────────────────────────

  const total     = capas.length;
  const openCount = capas.filter(c => c.status === 'OPEN').length;
  const overdue   = capas.filter(c => c.is_overdue).length;
  const closed    = capas.filter(c => c.status === 'CLOSED').length;

  // ── Filtered list ─────────────────────────────────────────────────────────────

  const filtered = capas.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      c.capa_number.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      (c.responsible_user_name ?? '').toLowerCase().includes(q);
    return matchSearch &&
      (!statusFilter || c.status === statusFilter) &&
      (!sourceFilter || c.source_type === sourceFilter) &&
      (!overdueFilter || c.is_overdue);
  });

  const hasActiveFilters = !!(search || statusFilter || sourceFilter || overdueFilter);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSourceFilter('');
    setOverdueFilter('');
  };

  // ── Drawer ────────────────────────────────────────────────────────────────────

  const selectCapa = (c: CapaListItem) => {
    setSelected(c);
    setDrawerTab('details');
    setAttachments([]);
    setActivity([]);
    setPendingFilePath(null);
    setPendingFileName('');
    setAttachNote('');
    setAttachError(null);
  };

  const handleDrawerTabChange = async (tab: DrawerTab) => {
    setDrawerTab(tab);
    if (!selected || !user) return;
    if (tab === 'attachments' && attachments.length === 0) {
      setDrawerLoading(true);
      try { setAttachments(await listCapaAttachments(user.id, selected.id)); } catch {}
      finally { setDrawerLoading(false); }
    } else if (tab === 'activity' && activity.length === 0) {
      setDrawerLoading(true);
      try { setActivity(await getCapaActivity(user.id, selected.id)); } catch {}
      finally { setDrawerLoading(false); }
    }
  };

  // ── File attach ───────────────────────────────────────────────────────────────

  const handleBrowseFile = async () => {
    const result = await openFilePicker({
      multiple: false,
      filters: [{ name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'] }],
    });
    if (result && typeof result === 'string') {
      setPendingFilePath(result);
      setPendingFileName(result.replace(/\\/g, '/').split('/').pop() ?? result);
    }
  };

  const handleAttachFile = async () => {
    if (!selected || !user || !pendingFilePath) return;
    setAttachLoading(true);
    setAttachError(null);
    try {
      const attachment = await attachCapaFile(
        user.id, selected.id, pendingFilePath, pendingFileName, attachNote || null
      );
      setAttachments(prev => [attachment, ...prev]);
      setPendingFilePath(null);
      setPendingFileName('');
      setAttachNote('');
      const updated = await getCapa(user.id, selected.id);
      setSelected(updated);
      setCapas(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (e) {
      setAttachError(String(e));
    } finally {
      setAttachLoading(false);
    }
  };

  const handleOpenAttachment = async (attachmentId: number) => {
    if (!user) return;
    try { await openCapaAttachment(user.id, attachmentId); } catch {}
  };

  // ── Modal (Create / Edit) ─────────────────────────────────────────────────────

  const openCreateModal = () => {
    setForm(EMPTY_FORM);
    setModalMode('create');
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = () => {
    if (!selected) return;
    setForm({
      title: selected.title,
      capa_type: selected.capa_type,
      source_type: selected.source_type ?? '',
      source_id: selected.source_id != null ? String(selected.source_id) : '',
      root_cause: selected.root_cause ?? '',
      root_cause_method: selected.root_cause_method ?? '',
      action_plan: selected.action_plan ?? '',
      due_date: selected.due_date ?? '',
      responsible_user_id: selected.responsible_user_id != null ? String(selected.responsible_user_id) : '',
      description: selected.description ?? '',
      priority: selected.priority ?? 'MEDIUM',
      effectiveness_check: selected.effectiveness_check ?? '',
    });
    setModalMode('edit');
    setModalError(null);
    setModalOpen(true);
  };

  const handleFormChange = (field: keyof CapaForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleModalSubmit = async () => {
    if (!user) return;
    const responsibleId = parseInt(form.responsible_user_id, 10);
    if (isNaN(responsibleId)) {
      setModalError('Please select a responsible person');
      return;
    }
    setModalLoading(true);
    setModalError(null);
    try {
      if (modalMode === 'create') {
        const newCapa = await createCapa(
          user.id, form.title, form.capa_type,
          form.source_type || null,
          form.source_id ? parseInt(form.source_id, 10) : null,
          form.root_cause, form.root_cause_method || null,
          form.action_plan, form.due_date, responsibleId,
          form.description || null, form.priority
        );
        setCapas(prev => [newCapa, ...prev]);
        setSelected(newCapa);
      } else {
        const updated = await updateCapa(
          user.id, selected!.id, form.title, form.capa_type,
          form.source_type || null,
          form.source_id ? parseInt(form.source_id, 10) : null,
          form.root_cause, form.root_cause_method || null,
          form.action_plan, form.due_date, responsibleId,
          form.description || null, form.priority,
          form.effectiveness_check || null
        );
        setCapas(prev => prev.map(c => c.id === updated.id ? updated : c));
        setSelected(updated);
      }
      setModalOpen(false);
    } catch (e) {
      setModalError(String(e));
    } finally {
      setModalLoading(false);
    }
  };

  // ── Close CAPA ────────────────────────────────────────────────────────────────

  const handleCloseCapa = async () => {
    if (!selected || !user) return;
    setCloseLoading(true);
    setCloseError(null);
    try {
      const updated = await setCapaStatus(user.id, selected.id, 'CLOSED', closeEffCheck);
      setCapas(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSelected(updated);
      setCloseModalOpen(false);
      setCloseEffCheck('');
    } catch (e) {
      setCloseError(String(e));
    } finally {
      setCloseLoading(false);
    }
  };

  // ── Reopen CAPA ───────────────────────────────────────────────────────────────

  const handleReopenCapa = async () => {
    if (!selected || !user) return;
    setReopenLoading(true);
    setReopenError(null);
    try {
      const updated = await setCapaStatus(user.id, selected.id, 'OPEN', null);
      setCapas(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSelected(updated);
      setReopenModalOpen(false);
    } catch (e) {
      setReopenError(String(e));
    } finally {
      setReopenLoading(false);
    }
  };

  // ── Export / Print ────────────────────────────────────────────────────────────

  const handleExportCSV = async () => {
    try { await exportCapasCSV(filtered); } catch {}
  };
  const handleExportJSON = async () => {
    try { await exportCapasJSON(filtered); } catch {}
  };
  const handlePrint = () => { printCapaRegister(filtered, companyName); };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="CAPA"
          subtitle="Corrective and Preventive Actions"
          icon={<CheckCircle2 size={18} />}
        />
        <ModuleToolbar
          onNew={canEdit ? openCreateModal : undefined}
          newLabel="New CAPA"
          onRefresh={load}
          loading={loading}
          onPrint={handlePrint}
          exportOptions={[
            { label: 'Export CSV', onClick: handleExportCSV },
            { label: 'Export JSON', onClick: handleExportJSON },
          ]}
          canEdit={canEdit}
          hasData={filtered.length > 0}
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total CAPAs" value={total} icon={<ClipboardList size={18} />} color="navy" />
        <StatCard
          label="Open" value={openCount} icon={<Clock size={18} />} color="amber"
          onClick={() => { setStatusFilter(statusFilter === 'OPEN' ? '' : 'OPEN'); setOverdueFilter(''); }}
          description={statusFilter === 'OPEN' ? 'Filtered ↑' : undefined}
        />
        <StatCard
          label="Overdue" value={overdue} icon={<AlertCircle size={18} />} color="red"
          onClick={() => { setOverdueFilter(overdueFilter === 'true' ? '' : 'true'); setStatusFilter(''); }}
          description={overdueFilter === 'true' ? 'Filtered ↑' : undefined}
        />
        <StatCard
          label="Closed" value={closed} icon={<CheckSquare size={18} />} color="green"
          onClick={() => { setStatusFilter(statusFilter === 'CLOSED' ? '' : 'CLOSED'); setOverdueFilter(''); }}
          description={statusFilter === 'CLOSED' ? 'Filtered ↑' : undefined}
        />
      </div>

      {/* Filter bar */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search CAPA number, title, responsible person…"
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: 'All Statuses',
            options: [
              { value: 'OPEN',   label: 'Open' },
              { value: 'CLOSED', label: 'Closed' },
            ],
          },
          {
            value: sourceFilter,
            onChange: setSourceFilter,
            placeholder: 'All Sources',
            options: SOURCE_TYPES.map(s => ({ value: s, label: s })),
          },
          {
            value: overdueFilter,
            onChange: setOverdueFilter,
            placeholder: 'Any',
            options: [{ value: 'true', label: 'Overdue Only' }],
          },
        ]}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-[13px] bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Main content area */}
      <div className="flex gap-0 min-h-0">
        {/* Table */}
        <div className={`flex-1 min-w-0 ${selected ? 'border-r border-[#E2E8F0]' : ''}`}>
          <Card padding={false}>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[#94A3B8] text-[13px] gap-2">
                <RefreshCw size={16} className="animate-spin" /> Loading CAPAs…
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={28} />}
                title={hasActiveFilters ? 'No matching CAPAs' : 'No CAPA Records'}
                description={
                  hasActiveFilters
                    ? 'Try adjusting your filters.'
                    : 'Create a corrective or preventive action to address quality issues.'
                }
                action={
                  canEdit && !hasActiveFilters
                    ? { label: '+ New CAPA', onClick: openCreateModal }
                    : hasActiveFilters
                    ? { label: 'Clear Filters', onClick: clearFilters }
                    : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wide whitespace-nowrap">CAPA #</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">Title</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wide whitespace-nowrap">Type</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wide whitespace-nowrap">Priority</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wide whitespace-nowrap">Responsible</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wide whitespace-nowrap">Due Date</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">Status</th>
                      <th className="px-3 py-3 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => {
                      const statusLabel = c.is_overdue && c.status === 'OPEN' ? 'OVERDUE' : c.status;
                      const isSelected = selected?.id === c.id;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => selectCapa(c)}
                          className={`border-b border-[#F1F5F9] cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#EBF2FA]'
                              : i % 2 === 0
                              ? 'hover:bg-[#F8FAFC]'
                              : 'bg-[#FAFBFD] hover:bg-[#F1F5F9]'
                          }`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-[12px] text-[#2E5080]">
                              {c.capa_number}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-[#1E3A5F] line-clamp-1">{c.title}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${typeCls(c.capa_type)}`}>
                              {c.capa_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${priorityCls(c.priority)}`}>
                              {c.priority ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-[#475569]">
                            {c.responsible_user_name ?? '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={c.is_overdue ? 'text-red-600 font-medium' : 'text-[#475569]'}>
                              {fmtDate(c.due_date)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusBadge status={statusLabel} />
                          </td>
                          <td className="px-3 py-3">
                            <ChevronRight size={15} className="text-[#94A3B8]" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-2.5 text-[11px] text-[#94A3B8] border-t border-[#F1F5F9]">
                  {filtered.length} of {capas.length} CAPA{capas.length !== 1 ? 's' : ''}
                  {hasActiveFilters ? ' (filtered)' : ''}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Drawer */}
        {selected && (
          <DetailsDrawer
            capa={selected}
            tab={drawerTab}
            onTabChange={handleDrawerTabChange}
            attachments={attachments}
            activity={activity}
            drawerLoading={drawerLoading}
            canEdit={canEdit}
            pendingFilePath={pendingFilePath}
            pendingFileName={pendingFileName}
            attachNote={attachNote}
            attachLoading={attachLoading}
            attachError={attachError}
            onBrowse={handleBrowseFile}
            onAttachNoteChange={setAttachNote}
            onAttach={handleAttachFile}
            onClearPending={() => { setPendingFilePath(null); setPendingFileName(''); setAttachNote(''); setAttachError(null); }}
            onOpenAttachment={handleOpenAttachment}
            onClose={() => setSelected(null)}
            onEdit={openEditModal}
            onCloseCapa={() => {
              setCloseEffCheck(selected.effectiveness_check ?? '');
              setCloseError(null);
              setCloseModalOpen(true);
            }}
            onReopenCapa={() => {
              setReopenError(null);
              setReopenModalOpen(true);
            }}
          />
        )}
      </div>

      {/* Modals */}
      <CapaModal
        open={modalOpen}
        mode={modalMode}
        form={form}
        onChange={handleFormChange}
        users={users}
        loading={modalLoading}
        error={modalError}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
      />

      <CloseCapaModal
        open={closeModalOpen}
        capa={selected}
        effectivenessCheck={closeEffCheck}
        onChange={setCloseEffCheck}
        loading={closeLoading}
        error={closeError}
        onClose={() => setCloseModalOpen(false)}
        onConfirm={handleCloseCapa}
      />

      <ReopenCapaModal
        open={reopenModalOpen}
        capa={selected}
        loading={reopenLoading}
        error={reopenError}
        onClose={() => setReopenModalOpen(false)}
        onConfirm={handleReopenCapa}
      />

      <ImportNoticeModal
        open={importNoticeOpen}
        onClose={() => setImportNoticeOpen(false)}
      />
    </div>
  );
}
