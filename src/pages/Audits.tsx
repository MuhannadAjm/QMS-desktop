import { useState, useEffect, useCallback } from 'react';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import { listLeadAuditorCandidates } from '../services/adminService';
import { ClipboardCheck } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';
import { useSettingsStore } from '../stores/settingsStore';
import * as auditService from '../services/auditService';
import { exportAuditsCSV, exportAuditsJSON } from '../services/exportService';
import { printAuditRegister } from '../services/printService';
import ModuleToolbar from '../components/ui/ModuleToolbar';
import FilterBar from '../components/ui/FilterBar';
import type { AuditListItem, AuditFinding, AuditAttachment, AuditActivityEntry } from '../types/audit';
import { AUDIT_TYPES, FINDING_TYPES, FINDING_SEVERITIES, AUDIT_STATUSES } from '../types/audit';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.split('T')[0];
}

function fmtFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// Mirrors UserMinimal in src-tauri/src/commands/users.rs, which serialises
// { id, name, role }. This previously declared `full_name`, so every option
// label rendered `undefined` - the list was populated but appeared blank.
interface UserMin { id: number; name: string; role?: string; }

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'CLOSED'
    ? 'bg-green-100 text-green-800'
    : 'bg-blue-100 text-blue-800';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800',
    HIGH: 'bg-orange-100 text-orange-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    LOW: 'bg-green-100 text-green-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls[severity] ?? 'bg-gray-100 text-gray-700'}`}>
      {severity}
    </span>
  );
}

function FindingTypeBadge({ type }: { type: string }) {
  const cls: Record<string, string> = {
    NC: 'bg-red-100 text-red-700',
    OFI: 'bg-orange-100 text-orange-700',
    Observation: 'bg-yellow-100 text-yellow-700',
    Positive: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls[type] ?? 'bg-gray-100 text-gray-700'}`}>
      {type}
    </span>
  );
}

// ── Audit Modal ───────────────────────────────────────────────────────────────

interface AuditModalProps {
  audit: AuditListItem | null;
  userId: number;
  onClose: () => void;
  onSaved: (a: AuditListItem) => void;
}

function AuditModal({ audit, userId, onClose, onSaved }: AuditModalProps) {
  const isEdit = !!audit;
  // Candidates are fetched here rather than by the page. They require audit
  // create/edit/assign permission, so a page-level fetch would either fail or
  // show a spurious authorization error to a legitimate read-only viewer.
  const [users, setUsers] = useState<UserMin[]>([]);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    listLeadAuditorCandidates(userId)
      .then(cs => { if (!cancelled) { setUsers(cs); setCandidateError(null); } })
      .catch(e => { if (!cancelled) setCandidateError(String(e)); });
    return () => { cancelled = true; };
  }, [userId]);
  const [title, setTitle] = useState(audit?.title ?? '');
  const [auditType, setAuditType] = useState(audit?.audit_type ?? 'Internal Audit');
  const [department, setDepartment] = useState(audit?.department ?? '');
  const [auditorUserId, setAuditorUserId] = useState<number>(audit?.lead_auditor_id ?? 0);
  const [auditDate, setAuditDate] = useState(
    audit?.actual_date ? audit.actual_date.split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [plannedDate, setPlannedDate] = useState(audit?.planned_date?.split('T')[0] ?? '');
  const [scope, setScope] = useState(audit?.scope ?? '');
  const [standard, setStandard] = useState(audit?.standard ?? 'ISO 9001');
  const [auditee, setAuditee] = useState(audit?.auditee ?? '');
  const [summary, setSummary] = useState(audit?.summary ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!department.trim()) { setError('Department is required'); return; }
    if (!auditDate) { setError('Audit date is required'); return; }
    if (!auditorUserId) { setError('Lead auditor is required'); return; }
    setSaving(true);
    setError('');
    try {
      let result: AuditListItem;
      if (isEdit) {
        result = await auditService.updateAudit(
          userId, audit!.id, title, auditType, department, auditorUserId,
          auditDate, scope || null, standard || null, plannedDate || null,
          auditee || null, summary || null,
        );
      } else {
        result = await auditService.createAudit(
          userId, title, auditType, department, auditorUserId, auditDate,
          scope || null, standard || null, plannedDate || null,
          auditee || null, summary || null,
        );
      }
      onSaved(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-[#1E3A5F]">{isEdit ? 'Edit Audit' : 'New Audit'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {(error || candidateError) && <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">{error || candidateError}</div>}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Audit Title <span className="text-red-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
              placeholder="Brief title of this audit" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Audit Type <span className="text-red-500">*</span></label>
              <select value={auditType} onChange={e => setAuditType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                {AUDIT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Department <span className="text-red-500">*</span></label>
              <input value={department} onChange={e => setDepartment(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
                placeholder="e.g. Production, Quality, HR" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Lead Auditor <span className="text-red-500">*</span></label>
              <select value={auditorUserId} onChange={e => setAuditorUserId(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                <option value={0}>— Select Auditor —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Auditee (Organization / Unit)</label>
              <input value={auditee} onChange={e => setAuditee(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
                placeholder="Auditee name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Audit Date <span className="text-red-500">*</span></label>
              <input type="date" value={auditDate} onChange={e => setAuditDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Planned Date</label>
              <input type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Standard / Reference</label>
              <input value={standard} onChange={e => setStandard(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
                placeholder="e.g. ISO 9001" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Scope</label>
            <textarea value={scope} onChange={e => setScope(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Audit scope (processes, products, areas covered)" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Summary / Recommended Actions</label>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Overall audit summary and recommendations" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080] disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Audit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Finding Modal ─────────────────────────────────────────────────────────────

function FindingModal({ finding, auditId, userId, onClose, onSaved }: {
  finding: AuditFinding | null;
  auditId: number;
  userId: number;
  onClose: () => void;
  onSaved: (f: AuditFinding) => void;
}) {
  const isEdit = !!finding;
  const [findingType, setFindingType] = useState(finding?.finding_type ?? 'NC');
  const [description, setDescription] = useState(finding?.description ?? '');
  const [severity, setSeverity] = useState(finding?.severity ?? 'LOW');
  const [clauseRef, setClauseRef] = useState(finding?.clause_ref ?? '');
  const [evidence, setEvidence] = useState(finding?.evidence ?? '');
  const [recommendedAction, setRecommendedAction] = useState(finding?.recommended_action ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!description.trim()) { setError('Finding description is required'); return; }
    setSaving(true);
    setError('');
    try {
      let result: AuditFinding;
      if (isEdit) {
        result = await auditService.updateAuditFinding(
          userId, finding!.id, findingType, description, severity,
          clauseRef || null, evidence || null, recommendedAction || null,
        );
      } else {
        result = await auditService.addAuditFinding(
          userId, auditId, findingType, description, severity,
          clauseRef || null, evidence || null, recommendedAction || null,
        );
      }
      onSaved(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-[#1E3A5F]">{isEdit ? 'Edit Finding' : 'Add Finding'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Finding Type <span className="text-red-500">*</span></label>
              <select value={findingType} onChange={e => setFindingType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                {FINDING_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Severity <span className="text-red-500">*</span></label>
              <select value={severity} onChange={e => setSeverity(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                {FINDING_SEVERITIES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Finding Description <span className="text-red-500">*</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Describe the finding in detail" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Clause / Reference</label>
            <input value={clauseRef} onChange={e => setClauseRef(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
              placeholder="e.g. ISO 9001 Clause 7.4" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Evidence</label>
            <textarea value={evidence} onChange={e => setEvidence(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Objective evidence observed" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Recommended Action</label>
            <textarea value={recommendedAction} onChange={e => setRecommendedAction(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Recommended corrective or improvement action" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080] disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Finding'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create NC Confirmation ────────────────────────────────────────────────────

function CreateNcModal({ finding, userId, onClose, onCreated }: {
  finding: AuditFinding; userId: number;
  onClose: () => void; onCreated: (f: AuditFinding) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handle() {
    setSaving(true);
    setError('');
    try {
      const updated = await auditService.createNcFromAuditFinding(userId, finding.id);
      onCreated(updated);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Create Non-Conformity from Finding</h2>
        {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm mb-3">{error}</div>}
        <p className="text-sm text-gray-600 mb-2">
          This will create a new NC record linked to finding <strong>{finding.finding_number}</strong>.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          The NC will be seeded with the finding description and set to <em>LOW</em> severity. You can update it in the Non-Conformities module.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 text-sm bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create NC'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Close / Reopen Modals ─────────────────────────────────────────────────────

function CloseAuditModal({ audit, userId, onClose, onClosed }: {
  audit: AuditListItem; userId: number;
  onClose: () => void; onClosed: (a: AuditListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  async function handle() {
    setSaving(true);
    try { onClosed(await auditService.setAuditStatus(userId, audit.id, 'CLOSED')); }
    catch { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Close Audit</h2>
        <p className="text-sm text-gray-600 mb-6">Close audit <strong>{audit.audit_number}</strong>? Status will be set to CLOSED.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50">
            {saving ? 'Closing…' : 'Close Audit'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReopenAuditModal({ audit, userId, onClose, onReopened }: {
  audit: AuditListItem; userId: number;
  onClose: () => void; onReopened: (a: AuditListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  async function handle() {
    setSaving(true);
    try { onReopened(await auditService.setAuditStatus(userId, audit.id, 'OPEN')); }
    catch { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Reopen Audit</h2>
        <p className="text-sm text-gray-600 mb-6">Reopen audit <strong>{audit.audit_number}</strong>? Status will return to OPEN.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080] disabled:opacity-50">
            {saving ? 'Reopening…' : 'Reopen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportNoticeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Import Audit Register</h2>
        <p className="text-sm text-gray-600 mb-4">Bulk import from CSV or Excel is not yet available. Audit records must be created individually using the New Audit form.</p>
        <p className="text-sm text-gray-400">This feature is planned for a future release.</p>
        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080]">OK</button>
        </div>
      </div>
    </div>
  );
}

// ── Details Drawer ────────────────────────────────────────────────────────────

type DrawerTab = 'details' | 'findings' | 'attachments' | 'activity';

function DetailsDrawer({ audit, userId, canEdit, canAddFindings, onClose, onUpdated }: {
  audit: AuditListItem; userId: number; canEdit: boolean; canAddFindings: boolean;
  onClose: () => void; onUpdated: (a: AuditListItem) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>('details');
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [attachments, setAttachments] = useState<AuditAttachment[]>([]);
  const [activity, setActivity] = useState<AuditActivityEntry[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [attNote, setAttNote] = useState('');
  const [attError, setAttError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [showAddFinding, setShowAddFinding] = useState(false);
  const [editFinding, setEditFinding] = useState<AuditFinding | null>(null);
  const [createNcFinding, setCreateNcFinding] = useState<AuditFinding | null>(null);

  useEffect(() => {
    if (tab === 'findings') auditService.listAuditFindings(userId, audit.id).then(setFindings).catch(() => {});
    if (tab === 'attachments') auditService.listAuditAttachments(userId, audit.id).then(setAttachments).catch(() => {});
    if (tab === 'activity') auditService.getAuditActivity(userId, audit.id).then(setActivity).catch(() => {});
  }, [tab, audit.id, userId]);

  async function handleAttach() {
    setBrowsing(true);
    setAttError('');
    try {
      const file = await openFilePicker({
        multiple: false,
        filters: [{ name: 'Allowed Files', extensions: ['pdf','doc','docx','xls','xlsx','png','jpg','jpeg'] }],
      });
      if (!file) return;
      const filePath = typeof file === 'string' ? file : (file as { path?: string }).path ?? '';
      const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
      await auditService.attachAuditFile(userId, audit.id, filePath, fileName, attNote || null);
      const updated = await auditService.listAuditAttachments(userId, audit.id);
      setAttachments(updated);
      setAttNote('');
    } catch (e) {
      setAttError(String(e));
    } finally {
      setBrowsing(false);
    }
  }

  async function handleOpen(att: AuditAttachment) {
    try { await auditService.openAuditAttachment(userId, att.id); } catch { /* silent */ }
  }

  const TABS: { id: DrawerTab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'findings', label: `Findings (${audit.findings_count})` },
    { id: 'attachments', label: 'Attachments' },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b bg-white">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-[#1E3A5F]">{audit.audit_number}</span>
              <StatusBadge status={audit.status} />
            </div>
            <h2 className="text-base font-semibold text-gray-900 leading-tight">{audit.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4">&times;</button>
        </div>

        {/* Action buttons */}
        {canEdit && (
          <div className="flex gap-2 px-6 py-3 border-b bg-gray-50">
            <button onClick={() => setShowEdit(true)}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-white">
              Edit
            </button>
            {audit.status === 'OPEN'
              ? <button onClick={() => setShowClose(true)}
                  className="px-3 py-1.5 text-xs font-semibold bg-green-700 text-white rounded-lg hover:bg-green-800">
                  Close Audit
                </button>
              : <button onClick={() => setShowReopen(true)}
                  className="px-3 py-1.5 text-xs font-semibold bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080]">
                  Reopen
                </button>
            }
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b px-6">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-xs font-semibold border-b-2 -mb-px ${
                tab === t.id ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">

          {/* Details */}
          {tab === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-gray-500 mb-0.5">Audit Type</p><p className="text-sm font-medium">{audit.audit_type ?? '—'}</p></div>
                <div><p className="text-xs text-gray-500 mb-0.5">Department</p><p className="text-sm font-medium">{audit.department ?? '—'}</p></div>
                <div><p className="text-xs text-gray-500 mb-0.5">Lead Auditor</p><p className="text-sm font-medium">{audit.lead_auditor_name ?? '—'}</p></div>
                <div><p className="text-xs text-gray-500 mb-0.5">Auditee</p><p className="text-sm font-medium">{audit.auditee ?? '—'}</p></div>
                <div><p className="text-xs text-gray-500 mb-0.5">Audit Date</p><p className="text-sm font-medium">{fmtDate(audit.actual_date)}</p></div>
                <div><p className="text-xs text-gray-500 mb-0.5">Planned Date</p><p className="text-sm font-medium">{fmtDate(audit.planned_date)}</p></div>
                <div><p className="text-xs text-gray-500 mb-0.5">Standard</p><p className="text-sm font-medium">{audit.standard ?? '—'}</p></div>
                <div><p className="text-xs text-gray-500 mb-0.5">Status</p><StatusBadge status={audit.status} /></div>
              </div>
              {audit.scope && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Scope</p>
                  <p className="text-sm whitespace-pre-wrap text-gray-800">{audit.scope}</p>
                </div>
              )}
              {audit.summary && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Summary / Recommended Actions</p>
                  <p className="text-sm whitespace-pre-wrap text-gray-800">{audit.summary}</p>
                </div>
              )}
              {audit.closed_at && (
                <div><p className="text-xs text-gray-500 mb-0.5">Closed At</p><p className="text-sm font-medium">{fmtDate(audit.closed_at)}</p></div>
              )}
              <div className="pt-2 border-t">
                <p className="text-xs text-gray-400">Created by {audit.created_by_name ?? '—'} on {fmtDate(audit.created_at)}</p>
              </div>
            </div>
          )}

          {/* Findings */}
          {tab === 'findings' && (
            <div className="space-y-3">
              {canAddFindings && (
                <div className="flex justify-end">
                  <button onClick={() => setShowAddFinding(true)}
                    className="px-3 py-1.5 text-xs font-semibold bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080]">
                    + Add Finding
                  </button>
                </div>
              )}
              {findings.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">No findings recorded yet.</div>
              )}
              {findings.map(f => (
                <div key={f.id} className="border border-gray-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-gray-600">{f.finding_number}</span>
                    <FindingTypeBadge type={f.finding_type} />
                    <SeverityBadge severity={f.severity} />
                    {f.is_non_conformity && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-700 border border-red-200">NC Created</span>
                    )}
                    {f.clause_ref && <span className="text-xs text-gray-400">{f.clause_ref}</span>}
                  </div>
                  <p className="text-sm text-gray-800">{f.description}</p>
                  {f.evidence && <p className="text-xs text-gray-500"><strong>Evidence:</strong> {f.evidence}</p>}
                  {f.recommended_action && <p className="text-xs text-gray-500"><strong>Recommended:</strong> {f.recommended_action}</p>}
                  {f.related_nc_number && (
                    <p className="text-xs text-blue-600">Linked NC: {f.related_nc_number}</p>
                  )}
                  {canAddFindings && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditFinding(f)}
                        className="text-xs text-[#1E3A5F] hover:underline font-semibold">Edit</button>
                      {!f.is_non_conformity && f.finding_type === 'NC' && (
                        <button onClick={() => setCreateNcFinding(f)}
                          className="text-xs text-red-700 hover:underline font-semibold">Create NC</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Attachments */}
          {tab === 'attachments' && (
            <div className="space-y-4">
              {canEdit && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input value={attNote} onChange={e => setAttNote(e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
                      placeholder="Optional note for this attachment" />
                    <button onClick={handleAttach} disabled={browsing}
                      className="px-4 py-2 text-sm font-semibold bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080] disabled:opacity-50 whitespace-nowrap">
                      {browsing ? 'Browsing…' : 'Attach File'}
                    </button>
                  </div>
                  {attError && <p className="text-xs text-red-600">{attError}</p>}
                </div>
              )}
              {attachments.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">No attachments yet.</div>
              )}
              {attachments.map(att => (
                <div key={att.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{att.file_name}</p>
                    <p className="text-xs text-gray-400">{fmtFileSize(att.file_size)} · {att.uploaded_by_name ?? '—'} · {fmtDate(att.uploaded_at)}</p>
                  </div>
                  <button onClick={() => handleOpen(att)}
                    className="text-xs text-[#1E3A5F] hover:underline font-semibold">Open</button>
                </div>
              ))}
            </div>
          )}

          {/* Activity */}
          {tab === 'activity' && (
            <div className="space-y-3">
              {activity.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">No activity recorded yet.</div>
              )}
              {activity.map(a => (
                <div key={a.id} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1E3A5F] mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{a.action}</p>
                    {a.description && <p className="text-xs text-gray-500">{a.description}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{a.performed_by_name ?? '—'} · {fmtDate(a.performed_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sub-modals */}
      {showEdit && (
        <AuditModal audit={audit} userId={userId}
          onClose={() => setShowEdit(false)}
          onSaved={a => { onUpdated(a); setShowEdit(false); }} />
      )}
      {showClose && (
        <CloseAuditModal audit={audit} userId={userId}
          onClose={() => setShowClose(false)}
          onClosed={a => { onUpdated(a); setShowClose(false); }} />
      )}
      {showReopen && (
        <ReopenAuditModal audit={audit} userId={userId}
          onClose={() => setShowReopen(false)}
          onReopened={a => { onUpdated(a); setShowReopen(false); }} />
      )}
      {showAddFinding && (
        <FindingModal finding={null} auditId={audit.id} userId={userId}
          onClose={() => setShowAddFinding(false)}
          onSaved={f => {
            setFindings(prev => [...prev, f]);
            onUpdated({ ...audit, findings_count: audit.findings_count + 1 });
            setShowAddFinding(false);
          }} />
      )}
      {editFinding && (
        <FindingModal finding={editFinding} auditId={audit.id} userId={userId}
          onClose={() => setEditFinding(null)}
          onSaved={f => {
            setFindings(prev => prev.map(x => x.id === f.id ? f : x));
            setEditFinding(null);
          }} />
      )}
      {createNcFinding && (
        <CreateNcModal finding={createNcFinding} userId={userId}
          onClose={() => setCreateNcFinding(null)}
          onCreated={f => {
            setFindings(prev => prev.map(x => x.id === f.id ? f : x));
            setCreateNcFinding(null);
          }} />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Audits() {
  const { user } = useAuthStore();
  const { companyName } = useSettingsStore();
  const userId = user?.id ?? 0;
  // Gating is derived from effective permissions, not from the role name, so a
  // custom role with these permissions gets the same affordances. Presentation
  // only: every command re-checks the caller in Rust.
  const can = usePermissionStore((s) => s.can);
  const canEdit = can('audits.edit');
  const canCreate = can('audits.create');
  const canAddFindings = can('audits.finding_manage');

  const [audits, setAudits] = useState<AuditListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selected, setSelected] = useState<AuditListItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const loadAudits = useCallback(async () => {
    try {
      const data = await auditService.listAudits(userId);
      setAudits(data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAudits();

  }, [loadAudits, userId]);

  // KPI
  const totalCount = audits.length;
  const openCount = audits.filter(a => a.status === 'OPEN').length;
  const closedCount = audits.filter(a => a.status === 'CLOSED').length;
  const totalFindings = audits.reduce((s, a) => s + a.findings_count, 0);

  // Filter
  const filtered = audits.filter(a => {
    if (filterStatus && a.status !== filterStatus) return false;
    if (filterType && a.audit_type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.audit_number.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        (a.department ?? '').toLowerCase().includes(q) ||
        (a.lead_auditor_name ?? '').toLowerCase().includes(q) ||
        (a.auditee ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const hasActiveFilters = !!(filterStatus || filterType);

  function handleUpdated(updated: AuditListItem) {
    setAudits(prev => prev.map(a => a.id === updated.id ? updated : a));
    if (selected?.id === updated.id) setSelected(updated);
  }

  return (
    <div className="p-6 space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Audits', value: totalCount, color: 'text-[#1E3A5F]' },
          { label: 'Open', value: openCount, color: 'text-blue-700' },
          { label: 'Closed', value: closedCount, color: 'text-green-700' },
          { label: 'Total Findings', value: totalFindings, color: 'text-orange-600' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Page header + toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck size={20} className="text-[#1E3A5F]" />
          <div>
            <h1 className="text-lg font-bold text-[#1E3A5F]">Audits</h1>
            <p className="text-xs text-gray-500">Internal and external audit management</p>
          </div>
        </div>
        <ModuleToolbar
          canEdit={canEdit}
          onNew={canCreate ? () => setShowCreate(true) : undefined}
          newLabel="+ New Audit"
          exportOptions={[
            { label: 'Export CSV', onClick: () => exportAuditsCSV(userId, filtered) },
            { label: 'Export JSON', onClick: () => exportAuditsJSON(userId, filtered) },
            { label: 'Print Register', onClick: () => printAuditRegister(filtered, companyName) },
          ]}
          hasData={filtered.length > 0}
        />
      </div>

            {/* Filter bar */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        onClear={() => { setSearch(''); setFilterStatus(''); setFilterType(''); }}
        hasActiveFilters={hasActiveFilters}
        filters={[
          {
            placeholder: 'All Statuses',
            value: filterStatus,
            onChange: setFilterStatus,
            options: AUDIT_STATUSES.map(s => ({ value: s, label: s })),
          },
          {
            placeholder: 'All Types',
            value: filterType,
            onChange: setFilterType,
            options: AUDIT_TYPES.map(t => ({ value: t, label: t })),
          },
        ]}
      />

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading audits…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {audits.length === 0 ? 'No audit records yet. Click "+ New Audit" to create the first one.' : 'No audits match the current filters.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Audit Number','Title','Type','Department','Lead Auditor','Audit Date','Findings','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id}
                  onClick={() => setSelected(a)}
                  className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-[#1E3A5F] whitespace-nowrap">{a.audit_number}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{a.title}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{a.audit_type ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{a.department ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{a.lead_auditor_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(a.actual_date)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${a.findings_count > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>
                      {a.findings_count}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <AuditModal audit={null} userId={userId}
          onClose={() => setShowCreate(false)}
          onSaved={a => { setAudits(prev => [a, ...prev]); setShowCreate(false); }} />
      )}
      {showImport && <ImportNoticeModal onClose={() => setShowImport(false)} />}

      {/* Details drawer */}
      {selected && (
        <DetailsDrawer
          audit={selected}
          userId={userId}
          canEdit={canEdit}
          canAddFindings={canAddFindings}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
