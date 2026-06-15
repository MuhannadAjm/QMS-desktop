import { useState, useEffect, useCallback } from 'react';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { riskService } from '../services/riskService';
import { exportRisksCSV, exportRisksJSON } from '../services/exportService';
import { printRiskRegister } from '../services/printService';
import ModuleToolbar from '../components/ui/ModuleToolbar';
import FilterBar from '../components/ui/FilterBar';
import type { RiskListItem, RiskAttachment, RiskActivityEntry } from '../types/risk';
import {
  RISK_CATEGORIES, RISK_SOURCES, riskLevelBadgeClass, riskScoreCellClass, computeRiskLevel,
} from '../types/risk';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.split('T')[0];
}

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

interface UserMin { id: number; full_name: string; }

// ── Risk Matrix ───────────────────────────────────────────────────────────────

function RiskMatrix({ severity, likelihood }: { severity: number; likelihood: number }) {
  const cellScore = (s: number, l: number) => s * l;
  const cellClass = (s: number, l: number) => {
    const score = cellScore(s, l);
    const isActive = s === severity && l === likelihood;
    const base = riskScoreCellClass(score);
    return `${base} text-center text-xs font-semibold w-10 h-10 flex items-center justify-center border border-white${isActive ? ' ring-2 ring-gray-800 ring-offset-1' : ''}`;
  };

  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 mb-2">5×5 Risk Matrix — current risk highlighted</div>
      <div className="inline-block border border-gray-200 rounded overflow-hidden">
        <div className="flex">
          <div className="w-10 h-10 flex items-center justify-center bg-gray-50 border-b border-r border-gray-200 text-xs text-gray-400">L\S</div>
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className="w-10 h-10 flex items-center justify-center bg-gray-100 text-xs font-bold text-gray-600 border-b border-r border-gray-200">{s}</div>
          ))}
        </div>
        {[5, 4, 3, 2, 1].map(l => (
          <div key={l} className="flex">
            <div className="w-10 h-10 flex items-center justify-center bg-gray-100 text-xs font-bold text-gray-600 border-b border-r border-gray-200">{l}</div>
            {[1, 2, 3, 4, 5].map(s => (
              <div key={s} className={cellClass(s, l)}>{cellScore(s, l)}</div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-300 inline-block" /> LOW (1–4)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-300 inline-block" /> MEDIUM (5–9)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400 inline-block" /> HIGH (10–19)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> CRITICAL (20–25)</span>
      </div>
    </div>
  );
}

// ── Risk Modal ────────────────────────────────────────────────────────────────

interface RiskModalProps {
  risk: RiskListItem | null;
  users: UserMin[];
  userId: number;
  onClose: () => void;
  onSaved: (r: RiskListItem) => void;
}

function RiskModal({ risk, users, userId, onClose, onSaved }: RiskModalProps) {
  const isEdit = !!risk;
  const [title, setTitle] = useState(risk?.title ?? '');
  const [description, setDescription] = useState(risk?.description ?? '');
  const [category, setCategory] = useState(risk?.category ?? '');
  const [process, setProcess] = useState(risk?.process ?? '');
  const [source, setSource] = useState(risk?.source ?? '');
  const [whoAffected, setWhoAffected] = useState(risk?.who_might_be_affected ?? '');
  const [severity, setSeverity] = useState<number>(risk?.severity ?? 3);
  const [likelihood, setLikelihood] = useState<number>(risk?.likelihood ?? 3);
  const [mitigationPlan, setMitigationPlan] = useState(risk?.mitigation_plan ?? '');
  const [recommendedActions, setRecommendedActions] = useState(risk?.recommended_actions ?? '');
  const [timeScale, setTimeScale] = useState(risk?.time_scale ?? '');
  const [ownerId, setOwnerId] = useState<number>(risk?.responsible_user_id ?? (users[0]?.id ?? 0));
  const [reviewDate, setReviewDate] = useState(risk?.review_date ? risk.review_date.split('T')[0] : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const previewScore = severity * likelihood;
  const previewLevel = computeRiskLevel(previewScore);

  async function handleSave() {
    if (!title.trim()) { setError('Hazard description is required'); return; }
    if (!ownerId) { setError('Responsible person is required'); return; }
    setSaving(true);
    setError('');
    try {
      let result: RiskListItem;
      if (isEdit) {
        result = await riskService.updateRisk(
          userId, risk!.id, title, description || null, category || null, process || null,
          source || null, whoAffected || null, severity, likelihood,
          mitigationPlan || null, recommendedActions || null, timeScale || null,
          ownerId, reviewDate || null,
        );
      } else {
        result = await riskService.createRisk(
          userId, title, description || null, category || null, process || null,
          source || null, whoAffected || null, severity, likelihood,
          mitigationPlan || null, recommendedActions || null, timeScale || null,
          ownerId, reviewDate || null,
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
          <h2 className="text-lg font-semibold text-[#1E3A5F]">{isEdit ? 'Edit Risk' : 'New Risk'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Hazard Description <span className="text-red-500">*</span></label>
            <textarea value={title} onChange={e => setTitle(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Describe the hazard or risk" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                <option value="">— Select —</option>
                {RISK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Process / Area</label>
              <input value={process} onChange={e => setProcess(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
                placeholder="e.g. Manufacturing" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Source</label>
              <select value={source} onChange={e => setSource(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                <option value="">— Select —</option>
                {RISK_SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Who Might Be Affected</label>
              <input value={whoAffected} onChange={e => setWhoAffected(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
                placeholder="Employees, Customers…" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Severity (1–5) <span className="text-red-500">*</span></label>
              <select value={severity} onChange={e => setSeverity(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                {[1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Likelihood (1–5) <span className="text-red-500">*</span></label>
              <select value={likelihood} onChange={e => setLikelihood(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                {[1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Score / Level</label>
              <div className="flex items-center gap-2 h-10">
                <span className={`inline-flex items-center justify-center w-10 h-10 rounded text-sm font-bold ${riskScoreCellClass(previewScore)}`}>
                  {previewScore}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${riskLevelBadgeClass(previewLevel)}`}>
                  {previewLevel}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Existing Controls / Mitigation</label>
            <textarea value={mitigationPlan} onChange={e => setMitigationPlan(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Describe existing controls already in place" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Recommended Actions</label>
            <textarea value={recommendedActions} onChange={e => setRecommendedActions(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Describe recommended actions to further reduce risk" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Responsible Person <span className="text-red-500">*</span></label>
              <select value={ownerId} onChange={e => setOwnerId(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                <option value={0}>— Select user —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Review Date</label>
              <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Time Scale</label>
            <input value={timeScale} onChange={e => setTimeScale(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
              placeholder="e.g. Immediate, Within 30 days, Q2 2026" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Additional Notes</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Any additional context or notes" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080] disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Risk'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseRiskModal({ risk, userId, onClose, onClosed }: {
  risk: RiskListItem; userId: number; onClose: () => void; onClosed: (r: RiskListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  async function handle() {
    setSaving(true);
    try { onClosed(await riskService.setRiskStatus(userId, risk.id, 'CLOSED')); }
    catch { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Close Risk</h2>
        <p className="text-sm text-gray-600 mb-6">Close risk <strong>{risk.risk_number}</strong>? Status will be set to CLOSED.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50">
            {saving ? 'Closing…' : 'Close Risk'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReopenRiskModal({ risk, userId, onClose, onReopened }: {
  risk: RiskListItem; userId: number; onClose: () => void; onReopened: (r: RiskListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  async function handle() {
    setSaving(true);
    try { onReopened(await riskService.setRiskStatus(userId, risk.id, 'OPEN')); }
    catch { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Reopen Risk</h2>
        <p className="text-sm text-gray-600 mb-6">Reopen risk <strong>{risk.risk_number}</strong>? Status will return to OPEN.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080] disabled:opacity-50">
            {saving ? 'Reopening…' : 'Reopen Risk'}
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
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Import Risk Register</h2>
        <p className="text-sm text-gray-600 mb-4">
          Bulk import from CSV or Excel is not yet available. Risk records must be created individually using the New Risk form.
        </p>
        <p className="text-sm text-gray-400">This feature is planned for a future release.</p>
        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080]">OK</button>
        </div>
      </div>
    </div>
  );
}

// ── Cross-module Confirmation Modals ──────────────────────────────────────────

function CreateNcFromRiskModal({ risk, userId, onClose, onCreated }: {
  risk: RiskListItem; userId: number; onClose: () => void; onCreated: (r: RiskListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function handle() {
    setSaving(true);
    setError('');
    try { onCreated(await riskService.createNcFromRisk(userId, risk.id)); }
    catch (e) { setError(String(e)); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Create Non-Conformity from Risk</h2>
        <p className="text-sm text-gray-600 mb-2">
          A new Non-Conformity will be created and linked to <strong>{risk.risk_number}</strong>.
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 mb-4">
          This action can only be done once — duplicate NCs are blocked.
        </p>
        {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm mb-3">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080] disabled:opacity-50">
            {saving ? 'Creating…' : 'Create NC'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateCapaFromRiskModal({ risk, userId, onClose, onCreated }: {
  risk: RiskListItem; userId: number; onClose: () => void; onCreated: (r: RiskListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function handle() {
    setSaving(true);
    setError('');
    try { onCreated(await riskService.createCapaFromRisk(userId, risk.id)); }
    catch (e) { setError(String(e)); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Create CAPA from Risk</h2>
        <p className="text-sm text-gray-600 mb-2">
          A new CAPA will be created and linked to <strong>{risk.risk_number}</strong>.
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 mb-4">
          This action can only be done once — duplicate CAPAs are blocked.
        </p>
        {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm mb-3">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 text-sm bg-purple-700 text-white rounded-lg hover:bg-purple-800 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create CAPA'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DetailsDrawer ─────────────────────────────────────────────────────────────

type DrawerTab = 'details' | 'controls' | 'matrix' | 'attachments' | 'activity' | 'links';

function DetailsDrawer({ risk, userId, canEdit, onClose, onUpdated, users }: {
  risk: RiskListItem; userId: number; canEdit: boolean; users: UserMin[];
  onClose: () => void; onUpdated: (r: RiskListItem) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>('details');
  const [attachments, setAttachments] = useState<RiskAttachment[]>([]);
  const [activity, setActivity] = useState<RiskActivityEntry[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [attNote, setAttNote] = useState('');
  const [attError, setAttError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [showCreateNc, setShowCreateNc] = useState(false);
  const [showCreateCapa, setShowCreateCapa] = useState(false);

  useEffect(() => {
    if (tab === 'attachments') riskService.listRiskAttachments(userId, risk.id).then(setAttachments).catch(() => {});
    if (tab === 'activity') riskService.getRiskActivity(userId, risk.id).then(setActivity).catch(() => {});
  }, [tab, risk.id, userId]);

  async function handleBrowseFile() {
    setBrowsing(true);
    setAttError('');
    try {
      const selected = await openFilePicker({
        multiple: false,
        filters: [{ name: 'Documents', extensions: ['pdf','doc','docx','xls','xlsx','png','jpg','jpeg'] }],
      });
      if (!selected) { setBrowsing(false); return; }
      const filePath = String(selected);
      const parts = filePath.replace(/\\/g, '/').split('/');
      const fileName = parts[parts.length - 1];
      const att = await riskService.attachRiskFile(userId, risk.id, filePath, fileName, attNote || null);
      setAttachments(prev => [att, ...prev]);
      setAttNote('');
    } catch (e) {
      setAttError(String(e));
    } finally {
      setBrowsing(false);
    }
  }

  const TABS: { id: DrawerTab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'controls', label: 'Controls & Actions' },
    { id: 'matrix', label: 'Risk Matrix' },
    { id: 'attachments', label: 'Attachments' },
    { id: 'activity', label: 'Activity' },
    { id: 'links', label: risk.related_nc_id || risk.related_capa_id ? 'Links ●' : 'Links' },
  ];

  return (
    <>
      <div className="fixed right-0 top-0 h-full w-[460px] bg-white border-l border-gray-200 shadow-2xl flex flex-col z-40">
        <div className="px-5 py-4 border-b bg-[#EBF2FA] flex items-start justify-between">
          <div className="flex-1 min-w-0 mr-3">
            <div className="font-mono text-sm font-bold text-[#1E3A5F]">{risk.risk_number}</div>
            <div className="font-semibold text-gray-800 mt-0.5 line-clamp-2 text-sm">{risk.title}</div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusBadge status={risk.status} />
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${riskLevelBadgeClass(risk.risk_level)}`}>
                {risk.risk_level ?? '—'}
              </span>
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold ${riskScoreCellClass(risk.risk_score)}`}>
                {risk.risk_score}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none shrink-0">&times;</button>
        </div>

        <div className="flex border-b overflow-x-auto shrink-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          {tab === 'details' && (
            <div className="space-y-3">
              {([
                ['Risk Number', risk.risk_number],
                ['Category', risk.category],
                ['Process / Area', risk.process],
                ['Source', risk.source],
                ['Who Might Be Affected', risk.who_might_be_affected],
                ['Responsible', risk.responsible_user_name],
                ['Review Date', fmtDate(risk.review_date)],
                ['Closed At', fmtDate(risk.closed_at)],
                ['Created By', risk.created_by_name],
                ['Created', fmtDate(risk.created_at)],
                ['Updated', fmtDate(risk.updated_at)],
              ] as [string, string | null | undefined][]).map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <span className="text-gray-400 font-medium w-40 shrink-0 text-xs">{label}</span>
                  <span className="text-gray-800 text-xs break-words">{value || '—'}</span>
                </div>
              ))}
              {risk.description && (
                <div className="mt-2">
                  <div className="text-xs text-gray-400 font-medium mb-1">Additional Notes</div>
                  <div className="text-gray-800 text-xs whitespace-pre-wrap bg-gray-50 rounded p-2">{risk.description}</div>
                </div>
              )}
            </div>
          )}

          {tab === 'controls' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Existing Controls / Mitigation</div>
                <div className="bg-blue-50 rounded-lg p-3 text-gray-800 text-xs whitespace-pre-wrap min-h-[60px]">
                  {risk.mitigation_plan || <span className="text-gray-400">No existing controls recorded</span>}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Recommended Actions</div>
                <div className="bg-amber-50 rounded-lg p-3 text-gray-800 text-xs whitespace-pre-wrap min-h-[60px]">
                  {risk.recommended_actions || <span className="text-gray-400">No recommended actions recorded</span>}
                </div>
              </div>
              {risk.time_scale && (
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Time Scale</div>
                  <div className="text-gray-800 text-xs">{risk.time_scale}</div>
                </div>
              )}
            </div>
          )}

          {tab === 'matrix' && (
            <RiskMatrix severity={risk.severity} likelihood={risk.likelihood} />
          )}

          {tab === 'attachments' && (
            <div className="space-y-4">
              {canEdit && (
                <div className="space-y-2">
                  <input value={attNote} onChange={e => setAttNote(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
                    placeholder="Optional note about this file" />
                  <button onClick={handleBrowseFile} disabled={browsing}
                    className="w-full flex items-center justify-center gap-2 bg-[#1E3A5F] text-white text-sm py-2 rounded-lg hover:bg-[#2E5080] disabled:opacity-50">
                    {browsing ? 'Uploading…' : 'Browse & Attach File'}
                  </button>
                  {attError && <div className="text-red-600 text-xs">{attError}</div>}
                </div>
              )}
              {attachments.length === 0 ? (
                <div className="text-gray-400 text-center py-6 text-sm">No attachments yet</div>
              ) : attachments.map(a => (
                <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{a.file_name}</div>
                    <div className="text-xs text-gray-400">{a.uploaded_by_name} · {fmtDate(a.uploaded_at)}</div>
                  </div>
                  <button onClick={() => riskService.openRiskAttachment(userId, a.id)}
                    className="text-[#1E3A5F] hover:underline text-xs font-medium">Open</button>
                </div>
              ))}
            </div>
          )}

          {tab === 'activity' && (
            <div className="space-y-3">
              {activity.length === 0 ? (
                <div className="text-gray-400 text-center py-6 text-sm">No activity yet</div>
              ) : activity.map(a => (
                <div key={a.id} className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#1E3A5F] mt-1.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-[#1E3A5F]">{a.action}</div>
                    {a.description && <div className="text-xs text-gray-600 mt-0.5">{a.description}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">{a.performed_by_name} · {fmtDate(a.performed_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'links' && (
            <div className="space-y-5">
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-2">Non-Conformity</div>
                {risk.related_nc_id ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-xs font-mono font-bold text-blue-700">{risk.related_nc_number}</span>
                    <span className="text-xs text-gray-500">Linked Non-Conformity</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-400">No Non-Conformity linked to this risk.</div>
                    {canEdit && (
                      <button onClick={() => setShowCreateNc(true)}
                        className="text-xs bg-[#1E3A5F] text-white px-3 py-1.5 rounded-lg hover:bg-[#2E5080] font-medium">
                        Create NC from this Risk
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-2">CAPA</div>
                {risk.related_capa_id ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                    <span className="text-xs font-mono font-bold text-purple-700">{risk.related_capa_number}</span>
                    <span className="text-xs text-gray-500">Linked CAPA</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-400">No CAPA linked to this risk.</div>
                    {canEdit && (
                      <button onClick={() => setShowCreateCapa(true)}
                        className="text-xs bg-purple-700 text-white px-3 py-1.5 rounded-lg hover:bg-purple-800 font-medium">
                        Create CAPA from this Risk
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex gap-2 px-5 py-3 border-t bg-gray-50 shrink-0">
            <button onClick={() => setShowEdit(true)}
              className="flex-1 py-2 text-xs border border-[#1E3A5F] text-[#1E3A5F] rounded-lg hover:bg-[#EBF2FA] font-medium">
              Edit
            </button>
            {risk.status === 'OPEN' ? (
              <button onClick={() => setShowClose(true)}
                className="flex-1 py-2 text-xs bg-green-700 text-white rounded-lg hover:bg-green-800 font-medium">
                Close Risk
              </button>
            ) : (
              <button onClick={() => setShowReopen(true)}
                className="flex-1 py-2 text-xs bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080] font-medium">
                Reopen
              </button>
            )}
          </div>
        )}
      </div>

      {showEdit && (
        <RiskModal risk={risk} users={users} userId={userId} onClose={() => setShowEdit(false)}
          onSaved={r => { onUpdated(r); setShowEdit(false); }} />
      )}
      {showClose && (
        <CloseRiskModal risk={risk} userId={userId} onClose={() => setShowClose(false)}
          onClosed={r => { onUpdated(r); setShowClose(false); }} />
      )}
      {showReopen && (
        <ReopenRiskModal risk={risk} userId={userId} onClose={() => setShowReopen(false)}
          onReopened={r => { onUpdated(r); setShowReopen(false); }} />
      )}
      {showCreateNc && (
        <CreateNcFromRiskModal risk={risk} userId={userId} onClose={() => setShowCreateNc(false)}
          onCreated={r => { onUpdated(r); setShowCreateNc(false); setTab('links'); }} />
      )}
      {showCreateCapa && (
        <CreateCapaFromRiskModal risk={risk} userId={userId} onClose={() => setShowCreateCapa(false)}
          onCreated={r => { onUpdated(r); setShowCreateCapa(false); setTab('links'); }} />
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Risks() {
  const { user } = useAuthStore();
  const { companyName } = useSettingsStore();
  const userId = user?.id ?? 0;
  const canEdit = user?.role === 'Admin' || user?.role === 'QualityManager';

  const [risks, setRisks] = useState<RiskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<RiskListItem | null>(null);
  const [users, setUsers] = useState<UserMin[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [activeKpi, setActiveKpi] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await riskService.listRisks(userId);
      setRisks(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    invoke<UserMin[]>('list_users_minimal', { currentUserId: userId }).then(setUsers).catch(() => {});
  }, [userId]);

  const totalCount = risks.length;
  const openCount = risks.filter(r => r.status === 'OPEN').length;
  const highCount = risks.filter(r => r.risk_score >= 10).length;
  const closedCount = risks.filter(r => r.status === 'CLOSED').length;

  const filtered = risks.filter(r => {
    if (activeKpi === 'open' && r.status !== 'OPEN') return false;
    if (activeKpi === 'high' && r.risk_score < 10) return false;
    if (activeKpi === 'closed' && r.status !== 'CLOSED') return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterLevel && r.risk_level !== filterLevel) return false;
    if (filterCategory && r.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.risk_number.toLowerCase().includes(q) &&
        !r.title.toLowerCase().includes(q) &&
        !(r.category ?? '').toLowerCase().includes(q) &&
        !(r.process ?? '').toLowerCase().includes(q) &&
        !(r.responsible_user_name ?? '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  function handleKpiClick(key: string) {
    setActiveKpi(prev => prev === key ? '' : key);
    setSearch(''); setFilterStatus(''); setFilterLevel(''); setFilterCategory('');
  }

  function onRiskUpdated(updated: RiskListItem) {
    setRisks(prev => prev.map(r => r.id === updated.id ? updated : r));
    setSelected(updated);
  }

  const filterDefs = [
    {
      placeholder: 'All Statuses', value: filterStatus,
      options: [{ value: 'OPEN', label: 'Open' }, { value: 'CLOSED', label: 'Closed' }],
      onChange: setFilterStatus,
    },
    {
      placeholder: 'All Levels', value: filterLevel,
      options: [
        { value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' },
        { value: 'HIGH', label: 'High' }, { value: 'CRITICAL', label: 'Critical' },
      ],
      onChange: setFilterLevel,
    },
    {
      placeholder: 'All Categories', value: filterCategory,
      options: RISK_CATEGORIES.map(c => ({ value: c, label: c })),
      onChange: setFilterCategory,
    },
  ];

  const hasFilter = !!(search || filterStatus || filterLevel || filterCategory || activeKpi);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-[#1E3A5F]">Risk Register</h1>
        <p className="text-sm text-gray-500 mt-1">Identify, assess and track quality and operational risks</p>
      </div>

      <div className="px-6 pb-4 grid grid-cols-4 gap-4">
        {[
          { key: 'total', label: 'Total Risks', value: totalCount, color: 'bg-[#1E3A5F] text-white' },
          { key: 'open', label: 'Open', value: openCount, color: 'bg-amber-50 border border-amber-200 text-amber-700' },
          { key: 'high', label: 'High / Critical', value: highCount, color: 'bg-orange-50 border border-orange-200 text-orange-700' },
          { key: 'closed', label: 'Closed', value: closedCount, color: 'bg-green-50 border border-green-200 text-green-700' },
        ].map(card => (
          <button key={card.key} onClick={() => handleKpiClick(card.key)}
            className={`rounded-xl p-4 text-left transition-all shadow-sm hover:shadow-md ${card.color} ${activeKpi === card.key ? 'ring-2 ring-offset-1 ring-[#1E3A5F]' : ''}`}>
            <div className="text-3xl font-bold">{card.value}</div>
            <div className="text-sm mt-1 opacity-80">{card.label}</div>
          </button>
        ))}
      </div>

      <div className="px-6 pb-2">
        <ModuleToolbar
          canEdit={canEdit}
          onNew={() => setShowNew(true)}
          onRefresh={load}
          onPrint={() => printRiskRegister(filtered, companyName)}
          exportOptions={[
            { label: 'Export CSV', onClick: () => exportRisksCSV(filtered) },
            { label: 'Export JSON', onClick: () => exportRisksJSON(filtered) },
          ]}
          onImport={() => setShowImport(true)}
        />
      </div>

      <div className="px-6 pb-2">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search risk number, hazard, category, responsible…"
          filters={filterDefs}
          hasActiveFilters={hasFilter}
          onClear={() => { setSearch(''); setFilterStatus(''); setFilterLevel(''); setFilterCategory(''); setActiveKpi(''); }}
        />
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading risks…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {hasFilter ? 'No risks match the current filters.' : 'No risks found. Click New Risk to create one.'}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Risk ID','Category','Hazard Description','Responsible','Sev.','Like.','Score','Level','Status',''].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600 text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} onClick={() => setSelected(r)}
                  className="border-b border-gray-100 hover:bg-[#EBF2FA] cursor-pointer transition-colors">
                  <td className="px-3 py-3 font-mono font-bold text-[#1E3A5F] text-xs">{r.risk_number}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{r.category ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-800 max-w-[200px]">
                    <div className="line-clamp-2 text-xs">{r.title}</div>
                  </td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{r.responsible_user_name ?? '—'}</td>
                  <td className="px-3 py-3 text-center text-gray-700 font-semibold text-xs">{r.severity}</td>
                  <td className="px-3 py-3 text-center text-gray-700 font-semibold text-xs">{r.likelihood}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded text-xs font-bold ${riskScoreCellClass(r.risk_score)}`}>
                      {r.risk_score}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${riskLevelBadgeClass(r.risk_level)}`}>
                      {r.risk_level ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-3 text-gray-400 text-xs">›</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="text-xs text-gray-400 mt-2">
          Showing {filtered.length} of {risks.length} risk{risks.length !== 1 ? 's' : ''}
        </div>
      </div>

      {showNew && (
        <RiskModal risk={null} users={users} userId={userId} onClose={() => setShowNew(false)}
          onSaved={r => { setRisks(prev => [r, ...prev]); setShowNew(false); setSelected(r); }} />
      )}
      {showImport && <ImportNoticeModal onClose={() => setShowImport(false)} />}

      {selected && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setSelected(null)} />
          <DetailsDrawer
            risk={selected} userId={userId} canEdit={canEdit} users={users}
            onClose={() => setSelected(null)}
            onUpdated={onRiskUpdated}
          />
        </>
      )}
    </div>
  );
}
