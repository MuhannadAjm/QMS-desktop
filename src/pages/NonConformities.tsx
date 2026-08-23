import { useState, useEffect, useCallback } from 'react';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { AlertOctagon } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import * as ncService from '../services/nonConformityService';
import { exportNcsCSV, exportNcsJSON } from '../services/exportService';
import { printNcRegister } from '../services/printService';
import ModuleToolbar from '../components/ui/ModuleToolbar';
import FilterBar from '../components/ui/FilterBar';
import type { NcListItem, NcAttachment, NcActivityEntry } from '../types/nonConformity';
import { NC_SOURCE_TYPES, NC_SEVERITIES, NC_STATUSES } from '../types/nonConformity';

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
  const cls: Record<string, string> = {
    OPEN: 'bg-blue-100 text-blue-800',
    IN_REVIEW: 'bg-yellow-100 text-yellow-800',
    CLOSED: 'bg-green-100 text-green-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.replace('_', ' ')}
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

function sourceLabel(v: string | null | undefined): string {
  return NC_SOURCE_TYPES.find(s => s.value === v)?.label ?? v ?? '—';
}

// ── NC Modal ──────────────────────────────────────────────────────────────────

interface NcModalProps {
  nc: NcListItem | null;
  users: UserMin[];
  userId: number;
  onClose: () => void;
  onSaved: (n: NcListItem) => void;
}

function NcModal({ nc, users, userId, onClose, onSaved }: NcModalProps) {
  const isEdit = !!nc;
  const [title, setTitle] = useState(nc?.title ?? '');
  const [severity, setSeverity] = useState(nc?.severity ?? 'LOW');
  const [sourceType, setSourceType] = useState(nc?.source_type ?? 'INTERNAL');
  const [description, setDescription] = useState(nc?.description ?? '');
  const [detectedDate, setDetectedDate] = useState(
    nc?.detected_date ? nc.detected_date.split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [responsibleUserId, setResponsibleUserId] = useState<number>(nc?.responsible_user_id ?? 0);
  const [containmentAction, setContainmentAction] = useState(nc?.containment_action ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const responsibleId = responsibleUserId > 0 ? responsibleUserId : null;
      let result: NcListItem;
      if (isEdit) {
        result = await ncService.updateNonConformity(
          userId, nc!.id, title, severity, sourceType,
          description || null, detectedDate || null,
          responsibleId, containmentAction || null,
        );
      } else {
        result = await ncService.createNonConformity(
          userId, title, severity, sourceType,
          description || null, null, detectedDate || null,
          responsibleId, containmentAction || null,
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
          <h2 className="text-lg font-semibold text-[#1E3A5F]">{isEdit ? 'Edit Non-Conformity' : 'New Non-Conformity'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Title / Description <span className="text-red-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
              placeholder="Brief title of the non-conformity" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Severity <span className="text-red-500">*</span></label>
              <select value={severity} onChange={e => setSeverity(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                {NC_SEVERITIES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Source <span className="text-red-500">*</span></label>
              <select value={sourceType} onChange={e => setSourceType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                {NC_SOURCE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Detailed Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Detailed description of the non-conformity" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Detected Date</label>
              <input type="date" value={detectedDate} onChange={e => setDetectedDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Responsible Person</label>
              <select value={responsibleUserId} onChange={e => setResponsibleUserId(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                <option value={0}>— None —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Containment Action</label>
            <textarea value={containmentAction} onChange={e => setContainmentAction(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Immediate containment action taken" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080] disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create NC'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create CAPA Modal ─────────────────────────────────────────────────────────

function CreateCapaModal({ nc, userId, onClose, onCreated }: {
  nc: NcListItem; userId: number;
  onClose: () => void; onCreated: (n: NcListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handle() {
    setSaving(true);
    setError('');
    try {
      const updated = await ncService.createCapaFromNonConformity(userId, nc.id);
      onCreated(updated);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Create CAPA from Non-Conformity</h2>
        {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm mb-3">{error}</div>}
        <p className="text-sm text-gray-600 mb-2">
          This will create a new CAPA linked to NC <strong>{nc.nc_number}</strong>.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          The CAPA will be seeded with the NC title and set to status <em>OPEN</em>. You can update it in the CAPA module.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080] disabled:opacity-50">
            {saving ? 'Creating…' : 'Create CAPA'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status Modals ─────────────────────────────────────────────────────────────

function CloseNcModal({ nc, userId, onClose, onClosed }: {
  nc: NcListItem; userId: number;
  onClose: () => void; onClosed: (n: NcListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  async function handle() {
    setSaving(true);
    try { onClosed(await ncService.setNonConformityStatus(userId, nc.id, 'CLOSED')); }
    catch { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Close Non-Conformity</h2>
        <p className="text-sm text-gray-600 mb-6">Close NC <strong>{nc.nc_number}</strong>? Status will be set to CLOSED.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50">
            {saving ? 'Closing…' : 'Close NC'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReopenNcModal({ nc, userId, onClose, onReopened }: {
  nc: NcListItem; userId: number;
  onClose: () => void; onReopened: (n: NcListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  async function handle() {
    setSaving(true);
    try { onReopened(await ncService.setNonConformityStatus(userId, nc.id, 'OPEN')); }
    catch { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Reopen Non-Conformity</h2>
        <p className="text-sm text-gray-600 mb-6">Reopen NC <strong>{nc.nc_number}</strong>? Status will return to OPEN.</p>
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
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Import NC Register</h2>
        <p className="text-sm text-gray-600 mb-4">Bulk import from CSV or Excel is not yet available. NC records must be created individually using the New NC form.</p>
        <p className="text-sm text-gray-400">This feature is planned for a future release.</p>
        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080]">OK</button>
        </div>
      </div>
    </div>
  );
}

// ── Details Drawer ────────────────────────────────────────────────────────────

type DrawerTab = 'details' | 'source' | 'capa' | 'attachments' | 'activity';

function DetailsDrawer({ nc, userId, canEdit, onClose, onUpdated, users }: {
  nc: NcListItem; userId: number; canEdit: boolean;
  users: UserMin[];
  onClose: () => void; onUpdated: (n: NcListItem) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>('details');
  const [attachments, setAttachments] = useState<NcAttachment[]>([]);
  const [activity, setActivity] = useState<NcActivityEntry[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [attNote, setAttNote] = useState('');
  const [attError, setAttError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [showCreateCapa, setShowCreateCapa] = useState(false);

  useEffect(() => {
    if (tab === 'attachments') ncService.listNcAttachments(userId, nc.id).then(setAttachments).catch(() => {});
    if (tab === 'activity') ncService.getNonConformityActivity(userId, nc.id).then(setActivity).catch(() => {});
  }, [tab, nc.id, userId]);

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
      await ncService.attachNcFile(userId, nc.id, filePath, fileName, attNote || null);
      const updated = await ncService.listNcAttachments(userId, nc.id);
      setAttachments(updated);
      setAttNote('');
    } catch (e) {
      setAttError(String(e));
    } finally {
      setBrowsing(false);
    }
  }

  async function handleOpen(att: NcAttachment) {
    try { await ncService.openNcAttachment(userId, att.id); } catch { /* silent */ }
  }

  const TABS: { id: DrawerTab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'source', label: 'Source' },
    { id: 'capa', label: 'CAPA Link' },
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
              <span className="font-mono text-xs font-bold text-[#1E3A5F]">{nc.nc_number}</span>
              <StatusBadge status={nc.status} />
              <SeverityBadge severity={nc.severity} />
            </div>
            <h2 className="text-base font-semibold text-gray-900 leading-tight">{nc.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4">&times;</button>
        </div>

        {/* Action buttons */}
        {canEdit && (
          <div className="flex gap-2 px-6 py-3 border-b bg-gray-50 flex-wrap">
            <button onClick={() => setShowEdit(true)}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-white">
              Edit
            </button>
            {nc.status !== 'CLOSED'
              ? <button onClick={() => setShowClose(true)}
                  className="px-3 py-1.5 text-xs font-semibold bg-green-700 text-white rounded-lg hover:bg-green-800">
                  Close NC
                </button>
              : <button onClick={() => setShowReopen(true)}
                  className="px-3 py-1.5 text-xs font-semibold bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080]">
                  Reopen
                </button>
            }
            {!nc.related_capa_id && (
              <button onClick={() => setShowCreateCapa(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-purple-700 text-white rounded-lg hover:bg-purple-800">
                Create CAPA
              </button>
            )}
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
                <div><p className="text-xs text-gray-500 mb-0.5">Severity</p><SeverityBadge severity={nc.severity} /></div>
                <div><p className="text-xs text-gray-500 mb-0.5">Status</p><StatusBadge status={nc.status} /></div>
                <div><p className="text-xs text-gray-500 mb-0.5">Detected Date</p><p className="text-sm font-medium">{fmtDate(nc.detected_date)}</p></div>
                <div><p className="text-xs text-gray-500 mb-0.5">Responsible</p><p className="text-sm font-medium">{nc.responsible_user_name ?? '—'}</p></div>
              </div>
              {nc.description && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Description</p>
                  <p className="text-sm whitespace-pre-wrap text-gray-800">{nc.description}</p>
                </div>
              )}
              {nc.containment_action && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Containment Action</p>
                  <p className="text-sm whitespace-pre-wrap text-gray-800">{nc.containment_action}</p>
                </div>
              )}
              {nc.closed_at && (
                <div><p className="text-xs text-gray-500 mb-0.5">Closed At</p><p className="text-sm font-medium">{fmtDate(nc.closed_at)}</p></div>
              )}
              <div className="pt-2 border-t">
                <p className="text-xs text-gray-400">Created by {nc.created_by_name ?? '—'} on {fmtDate(nc.created_at)}</p>
              </div>
            </div>
          )}

          {/* Source */}
          {tab === 'source' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-gray-500 mb-0.5">Source Type</p><p className="text-sm font-medium">{sourceLabel(nc.source_type)}</p></div>
                {nc.source_id && (
                  <div><p className="text-xs text-gray-500 mb-0.5">Source Record ID</p><p className="text-sm font-medium">#{nc.source_id}</p></div>
                )}
                {nc.finding_id && (
                  <div><p className="text-xs text-gray-500 mb-0.5">Originated From Finding</p><p className="text-sm font-medium">Finding #{nc.finding_id}</p></div>
                )}
              </div>
              <p className="text-xs text-gray-400 pt-2 border-t">Source links are set when an NC is created from an audit finding or another module. They cannot be changed after creation.</p>
            </div>
          )}

          {/* CAPA Link */}
          {tab === 'capa' && (
            <div className="space-y-4">
              {nc.related_capa_id ? (
                <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-purple-600 mb-1">Linked CAPA</p>
                  <p className="text-base font-bold text-purple-800 font-mono">{nc.related_capa_number}</p>
                  <p className="text-xs text-purple-600 mt-1">Navigate to the CAPA module to view and manage this record.</p>
                </div>
              ) : (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-500 mb-3">No CAPA has been created for this NC yet.</p>
                  {canEdit && (
                    <button onClick={() => setShowCreateCapa(true)}
                      className="px-4 py-2 text-sm bg-purple-700 text-white rounded-lg hover:bg-purple-800">
                      Create CAPA
                    </button>
                  )}
                </div>
              )}
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
        <NcModal nc={nc} users={users} userId={userId}
          onClose={() => setShowEdit(false)}
          onSaved={n => { onUpdated(n); setShowEdit(false); }} />
      )}
      {showClose && (
        <CloseNcModal nc={nc} userId={userId}
          onClose={() => setShowClose(false)}
          onClosed={n => { onUpdated(n); setShowClose(false); }} />
      )}
      {showReopen && (
        <ReopenNcModal nc={nc} userId={userId}
          onClose={() => setShowReopen(false)}
          onReopened={n => { onUpdated(n); setShowReopen(false); }} />
      )}
      {showCreateCapa && (
        <CreateCapaModal nc={nc} userId={userId}
          onClose={() => setShowCreateCapa(false)}
          onCreated={n => { onUpdated(n); setShowCreateCapa(false); }} />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NonConformities() {
  const { user } = useAuthStore();
  const { companyName } = useSettingsStore();
  const userId = user?.id ?? 0;
  const role = user?.role ?? '';
  const canEdit = ['Admin', 'QualityManager'].includes(role);

  const [ncs, setNcs] = useState<NcListItem[]>([]);
  const [users, setUsers] = useState<UserMin[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [selected, setSelected] = useState<NcListItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const loadNcs = useCallback(async () => {
    try {
      const data = await ncService.listNonConformities(userId);
      setNcs(data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadNcs();
    invoke<UserMin[]>('list_users_minimal', { currentUserId: userId }).then(setUsers).catch(() => {});
  }, [loadNcs, userId]);

  // KPI
  const totalCount = ncs.length;
  const openCount = ncs.filter(n => n.status === 'OPEN' || n.status === 'IN_REVIEW').length;
  const highCriticalCount = ncs.filter(n => (n.severity === 'HIGH' || n.severity === 'CRITICAL') && n.status !== 'CLOSED').length;
  const closedCount = ncs.filter(n => n.status === 'CLOSED').length;

  // Filter
  const filtered = ncs.filter(n => {
    if (filterStatus && n.status !== filterStatus) return false;
    if (filterSeverity && n.severity !== filterSeverity) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        n.nc_number.toLowerCase().includes(q) ||
        n.title.toLowerCase().includes(q) ||
        (n.responsible_user_name ?? '').toLowerCase().includes(q) ||
        (n.source_type ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const hasActiveFilters = !!(filterStatus || filterSeverity);

  function handleUpdated(updated: NcListItem) {
    setNcs(prev => prev.map(n => n.id === updated.id ? updated : n));
    if (selected?.id === updated.id) setSelected(updated);
  }

  return (
    <div className="p-6 space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total NCs', value: totalCount, color: 'text-[#1E3A5F]' },
          { label: 'Open / In Review', value: openCount, color: 'text-blue-700' },
          { label: 'High / Critical', value: highCriticalCount, color: 'text-red-700' },
          { label: 'Closed', value: closedCount, color: 'text-green-700' },
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
          <AlertOctagon size={20} className="text-[#1E3A5F]" />
          <div>
            <h1 className="text-lg font-bold text-[#1E3A5F]">Non-Conformities</h1>
            <p className="text-xs text-gray-500">NC register linked to audits, risks, and complaints</p>
          </div>
        </div>
        <ModuleToolbar
          canEdit={canEdit}
          onNew={() => setShowCreate(true)}
          newLabel="+ New NC"
          exportOptions={[
            { label: 'Export CSV', onClick: () => exportNcsCSV(filtered) },
            { label: 'Export JSON', onClick: () => exportNcsJSON(filtered) },
            { label: 'Print Register', onClick: () => printNcRegister(filtered, companyName) },
          ]}
          hasData={filtered.length > 0}
        />
      </div>

      {/* Filter bar */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        onClear={() => { setSearch(''); setFilterStatus(''); setFilterSeverity(''); }}
        hasActiveFilters={hasActiveFilters}
        filters={[
          {
            placeholder: 'All Statuses',
            value: filterStatus,
            onChange: setFilterStatus,
            options: NC_STATUSES.map(s => ({ value: s, label: s.replace('_', ' ') })),
          },
          {
            placeholder: 'All Severities',
            value: filterSeverity,
            onChange: setFilterSeverity,
            options: NC_SEVERITIES.map(s => ({ value: s, label: s })),
          },
        ]}
      />

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading non-conformities…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {ncs.length === 0 ? 'No NC records yet. Click "+ New NC" to create the first one.' : 'No NCs match the current filters.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['NC Number','Title','Severity','Source','Detected','Responsible','CAPA','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(n => (
                <tr key={n.id}
                  onClick={() => setSelected(n)}
                  className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-[#1E3A5F] whitespace-nowrap">{n.nc_number}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{n.title}</td>
                  <td className="px-4 py-3"><SeverityBadge severity={n.severity} /></td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{sourceLabel(n.source_type)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(n.detected_date)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{n.responsible_user_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {n.related_capa_number
                      ? <span className="font-mono text-xs font-semibold text-purple-700">{n.related_capa_number}</span>
                      : <span className="text-xs text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={n.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <NcModal nc={null} users={users} userId={userId}
          onClose={() => setShowCreate(false)}
          onSaved={n => { setNcs(prev => [n, ...prev]); setShowCreate(false); }} />
      )}
      {showImport && <ImportNoticeModal onClose={() => setShowImport(false)} />}

      {/* Details drawer */}
      {selected && (
        <DetailsDrawer
          nc={selected}
          userId={userId}
          canEdit={canEdit}
          users={users}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
