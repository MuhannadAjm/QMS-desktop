import { useState, useEffect, useCallback } from 'react';
import { listRecordOwnerCandidates } from '../services/adminService';
import CustomerSelect, { type CustomerSelection } from '../components/ui/CustomerSelect';
import { open as openFilePicker } from '@tauri-apps/plugin-dialog';
import { useAuthStore } from '../stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { complaintService } from '../services/complaintService';
import { exportComplaintsCSV, exportComplaintsJSON } from '../services/exportService';
import { printComplaintRegister } from '../services/printService';
import ModuleToolbar from '../components/ui/ModuleToolbar';
import FilterBar from '../components/ui/FilterBar';
import type { ComplaintListItem, ComplaintAttachment, ComplaintActivityEntry } from '../types/complaint';
import { COMPLAINT_PRIORITIES, COMPLAINT_CATEGORIES, priorityBadgeClass } from '../types/complaint';

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

// Mirrors UserMinimal in src-tauri/src/commands/users.rs, which serialises
// { id, name, role }. This previously declared `full_name`, so every option
// label rendered `undefined` - the list was populated but appeared blank.
interface UserMin { id: number; name: string; role?: string; }

// ── Complaint Modal ───────────────────────────────────────────────────────────

interface ComplaintModalProps {
  complaint: ComplaintListItem | null;
  userId: number;
  onClose: () => void;
  onSaved: (c: ComplaintListItem) => void;
}

function ComplaintModal({ complaint, userId, onClose, onSaved }: ComplaintModalProps) {
  // Candidates need complaints create/edit/assign permission. Fetched here
  // rather than by the page: this component only mounts when a form opens, so a
  // read-only viewer never triggers the request and never sees a spurious
  // authorization error.
  const [users, setUsers] = useState<UserMin[]>([]);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    listRecordOwnerCandidates(userId, 'complaints')
      .then(cs => { if (!cancelled) { setUsers(cs); setCandidateError(null); } })
      .catch(e => { if (!cancelled) setCandidateError(String(e)); });
    return () => { cancelled = true; };
  }, [userId]);
  const isEdit = !!complaint;
  const [customer, setCustomer] = useState<CustomerSelection>({
    refId: complaint?.customer_ref_id ?? null,
    name: complaint?.customer_name ?? '',
    code: complaint?.customer_id ?? '',
  });
  // Only true for a complaint that already points at a deactivated customer.
  const linkedInactive = complaint?.customer_ref_id != null && complaint.customer_ref_active === false;
  const [title, setTitle] = useState(complaint?.title ?? '');
  const [description, setDescription] = useState(complaint?.description ?? '');
  const [category, setCategory] = useState(complaint?.category ?? '');
  const [receivedDate, setReceivedDate] = useState(
    complaint?.received_date ? complaint.received_date.split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [priority, setPriority] = useState(complaint?.priority ?? 'MEDIUM');
  const [issuedByUserId, setIssuedByUserId] = useState<number>(complaint?.issued_by_user_id ?? 0);
  const [rootCause, setRootCause] = useState(complaint?.root_cause ?? '');
  const [resolution, setResolution] = useState(complaint?.resolution ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!customer.name.trim()) { setError('Select a customer'); return; }
    if (!customer.code.trim()) { setError('Customer ID is missing — reselect the customer'); return; }
    if (!title.trim()) { setError('Complaint title is required'); return; }
    if (!receivedDate) { setError('Received date is required'); return; }
    setSaving(true);
    setError('');
    try {
      let result: ComplaintListItem;
      const issuedBy = issuedByUserId > 0 ? issuedByUserId : null;
      if (isEdit) {
        result = await complaintService.updateComplaint(
          userId, complaint!.id, customer.refId, customer.name, customer.code, title,
          description || null, category || null, receivedDate, priority,
          issuedBy, rootCause || null, resolution || null,
        );
      } else {
        result = await complaintService.createComplaint(
          userId, customer.refId, customer.name, customer.code, title,
          description || null, category || null, receivedDate, priority,
          issuedBy, rootCause || null, resolution || null,
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
          <h2 className="text-lg font-semibold text-[#1E3A5F]">{isEdit ? 'Edit Complaint' : 'New Complaint'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {(error || candidateError) && <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">{error || candidateError}</div>}

          <CustomerSelect
            userId={userId}
            value={customer}
            onChange={setCustomer}
            linkedInactive={linkedInactive}
          />

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Complaint Title <span className="text-red-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
              placeholder="Brief title of the complaint" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description / Details</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Detailed description of the complaint" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                <option value="">— Select —</option>
                {COMPLAINT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Priority <span className="text-red-500">*</span></label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                {COMPLAINT_PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Received Date <span className="text-red-500">*</span></label>
              <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Issued By (User)</label>
              <select value={issuedByUserId} onChange={e => setIssuedByUserId(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080]">
                <option value={0}>— None —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Root Cause</label>
            <textarea value={rootCause} onChange={e => setRootCause(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Root cause analysis (can be updated later)" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Resolution</label>
            <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] resize-none"
              placeholder="Resolution / corrective action taken (can be updated later)" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#2E5080] disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Complaint'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseComplaintModal({ complaint, userId, onClose, onClosed }: {
  complaint: ComplaintListItem; userId: number; onClose: () => void; onClosed: (c: ComplaintListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  async function handle() {
    setSaving(true);
    try { onClosed(await complaintService.setComplaintStatus(userId, complaint.id, 'CLOSED')); }
    catch { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Close Complaint</h2>
        <p className="text-sm text-gray-600 mb-6">Close complaint <strong>{complaint.complaint_number}</strong>? Status will be set to CLOSED.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handle} disabled={saving}
            className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50">
            {saving ? 'Closing…' : 'Close Complaint'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReopenComplaintModal({ complaint, userId, onClose, onReopened }: {
  complaint: ComplaintListItem; userId: number; onClose: () => void; onReopened: (c: ComplaintListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  async function handle() {
    setSaving(true);
    try { onReopened(await complaintService.setComplaintStatus(userId, complaint.id, 'OPEN')); }
    catch { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Reopen Complaint</h2>
        <p className="text-sm text-gray-600 mb-6">Reopen complaint <strong>{complaint.complaint_number}</strong>? Status will return to OPEN.</p>
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
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Import Complaint Register</h2>
        <p className="text-sm text-gray-600 mb-4">
          Bulk import from CSV or Excel is not yet available. Complaint records must be created individually using the New Complaint form.
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

function CreateNcFromComplaintModal({ complaint, userId, onClose, onCreated }: {
  complaint: ComplaintListItem; userId: number; onClose: () => void; onCreated: (c: ComplaintListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function handle() {
    setSaving(true);
    setError('');
    try { onCreated(await complaintService.createNcFromComplaint(userId, complaint.id)); }
    catch (e) { setError(String(e)); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Create Non-Conformity from Complaint</h2>
        <p className="text-sm text-gray-600 mb-2">
          A new Non-Conformity will be created and linked to <strong>{complaint.complaint_number}</strong>.
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

function CreateCapaFromComplaintModal({ complaint, userId, onClose, onCreated }: {
  complaint: ComplaintListItem; userId: number; onClose: () => void; onCreated: (c: ComplaintListItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function handle() {
    setSaving(true);
    setError('');
    try { onCreated(await complaintService.createCapaFromComplaint(userId, complaint.id)); }
    catch (e) { setError(String(e)); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Create CAPA from Complaint</h2>
        <p className="text-sm text-gray-600 mb-2">
          A new CAPA will be created and linked to <strong>{complaint.complaint_number}</strong>.
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

type DrawerTab = 'details' | 'customer' | 'attachments' | 'activity' | 'links';

function DetailsDrawer({ complaint, userId, canEdit, onClose, onUpdated }: {
  complaint: ComplaintListItem; userId: number; canEdit: boolean;
  onClose: () => void; onUpdated: (c: ComplaintListItem) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>('details');
  const [attachments, setAttachments] = useState<ComplaintAttachment[]>([]);
  const [activity, setActivity] = useState<ComplaintActivityEntry[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [attNote, setAttNote] = useState('');
  const [attError, setAttError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [showCreateNc, setShowCreateNc] = useState(false);
  const [showCreateCapa, setShowCreateCapa] = useState(false);

  useEffect(() => {
    if (tab === 'attachments') complaintService.listComplaintAttachments(userId, complaint.id).then(setAttachments).catch(() => {});
    if (tab === 'activity') complaintService.getComplaintActivity(userId, complaint.id).then(setActivity).catch(() => {});
  }, [tab, complaint.id, userId]);

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
      const att = await complaintService.attachComplaintFile(userId, complaint.id, filePath, fileName, attNote || null);
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
    { id: 'customer', label: 'Customer' },
    { id: 'attachments', label: 'Attachments' },
    { id: 'activity', label: 'Activity' },
    { id: 'links', label: complaint.related_nc_id || complaint.related_capa_id ? 'Links ●' : 'Links' },
  ];

  return (
    <>
      <div className="fixed right-0 top-0 h-full w-[460px] bg-white border-l border-gray-200 shadow-2xl flex flex-col z-40">
        <div className="px-5 py-4 border-b bg-[#EBF2FA] flex items-start justify-between">
          <div className="flex-1 min-w-0 mr-3">
            <div className="font-mono text-sm font-bold text-[#1E3A5F]">{complaint.complaint_number}</div>
            <div className="font-semibold text-gray-800 mt-0.5 line-clamp-2 text-sm">{complaint.title}</div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusBadge status={complaint.status} />
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${priorityBadgeClass(complaint.priority)}`}>
                {complaint.priority ?? '—'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none shrink-0">&times;</button>
        </div>

        <div className="flex border-b overflow-x-auto shrink-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 text-sm">
          {tab === 'details' && (
            <div className="space-y-3">
              {([
                ['Complaint No.', complaint.complaint_number],
                ['Category', complaint.category],
                ['Received Date', fmtDate(complaint.received_date)],
                ['Issued By', complaint.issued_by_name],
                ['Closed At', fmtDate(complaint.closed_at)],
                ['Created By', complaint.created_by_name],
                ['Created', fmtDate(complaint.created_at)],
                ['Updated', fmtDate(complaint.updated_at)],
              ] as [string, string | null | undefined][]).map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <span className="text-gray-400 font-medium w-36 shrink-0 text-xs">{label}</span>
                  <span className="text-gray-800 text-xs break-words">{value || '—'}</span>
                </div>
              ))}
              {complaint.description && (
                <div className="mt-2">
                  <div className="text-xs text-gray-400 font-medium mb-1">Description</div>
                  <div className="text-gray-800 text-xs whitespace-pre-wrap bg-gray-50 rounded p-2">{complaint.description}</div>
                </div>
              )}
              {complaint.root_cause && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Root Cause</div>
                  <div className="bg-orange-50 rounded-lg p-3 text-gray-800 text-xs whitespace-pre-wrap">{complaint.root_cause}</div>
                </div>
              )}
              {complaint.resolution && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Resolution</div>
                  <div className="bg-green-50 rounded-lg p-3 text-gray-800 text-xs whitespace-pre-wrap">{complaint.resolution}</div>
                </div>
              )}
            </div>
          )}

          {tab === 'customer' && (
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-xl p-4">
                <div className="text-xs font-semibold text-gray-500 mb-3">Customer Information</div>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <span className="text-gray-400 text-xs w-28 shrink-0">Customer Name</span>
                    <span className="text-gray-800 font-semibold text-sm">{complaint.customer_name}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 text-xs w-28 shrink-0">Customer ID</span>
                    <span className="text-gray-800 font-mono text-sm">{complaint.customer_id}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 text-xs w-28 shrink-0">Master record</span>
                    {/* These are the details AS RECORDED. If the customer has since
                        been renamed the master will differ, and that is deliberate —
                        the complaint says what it said when it was raised. */}
                    {complaint.customer_ref_id === null ? (
                      <span className="text-gray-600 text-sm">
                        Not linked — recorded as text
                      </span>
                    ) : complaint.customer_ref_active === false ? (
                      <span className="text-sm text-[#B91C1C] font-medium">Linked · customer inactive</span>
                    ) : (
                      <span className="text-sm text-[#15803D] font-medium">Linked</span>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-3">
                  Shown as recorded when the complaint was raised. Later changes to the
                  customer master do not alter this.
                </p>
              </div>
            </div>
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
                  <button onClick={() => complaintService.openComplaintAttachment(userId, a.id)}
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
                {complaint.related_nc_id ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-xs font-mono font-bold text-blue-700">{complaint.related_nc_number}</span>
                    <span className="text-xs text-gray-500">Linked Non-Conformity</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-400">No Non-Conformity linked to this complaint.</div>
                    {canEdit && (
                      <button onClick={() => setShowCreateNc(true)}
                        className="text-xs bg-[#1E3A5F] text-white px-3 py-1.5 rounded-lg hover:bg-[#2E5080] font-medium">
                        Create NC from this Complaint
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-2">CAPA</div>
                {complaint.related_capa_id ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                    <span className="text-xs font-mono font-bold text-purple-700">{complaint.related_capa_number}</span>
                    <span className="text-xs text-gray-500">Linked CAPA</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-400">No CAPA linked to this complaint.</div>
                    {canEdit && (
                      <button onClick={() => setShowCreateCapa(true)}
                        className="text-xs bg-purple-700 text-white px-3 py-1.5 rounded-lg hover:bg-purple-800 font-medium">
                        Create CAPA from this Complaint
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
            {complaint.status === 'OPEN' ? (
              <button onClick={() => setShowClose(true)}
                className="flex-1 py-2 text-xs bg-green-700 text-white rounded-lg hover:bg-green-800 font-medium">
                Close
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
        <ComplaintModal complaint={complaint} userId={userId}
          onClose={() => setShowEdit(false)}
          onSaved={c => { onUpdated(c); setShowEdit(false); }} />
      )}
      {showClose && (
        <CloseComplaintModal complaint={complaint} userId={userId}
          onClose={() => setShowClose(false)}
          onClosed={c => { onUpdated(c); setShowClose(false); }} />
      )}
      {showReopen && (
        <ReopenComplaintModal complaint={complaint} userId={userId}
          onClose={() => setShowReopen(false)}
          onReopened={c => { onUpdated(c); setShowReopen(false); }} />
      )}
      {showCreateNc && (
        <CreateNcFromComplaintModal complaint={complaint} userId={userId}
          onClose={() => setShowCreateNc(false)}
          onCreated={c => { onUpdated(c); setShowCreateNc(false); setTab('links'); }} />
      )}
      {showCreateCapa && (
        <CreateCapaFromComplaintModal complaint={complaint} userId={userId}
          onClose={() => setShowCreateCapa(false)}
          onCreated={c => { onUpdated(c); setShowCreateCapa(false); setTab('links'); }} />
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Complaints() {
  const { user } = useAuthStore();
  const { companyName } = useSettingsStore();
  const userId = user?.id ?? 0;
  // Gating is derived from effective permissions, not from the role name, so a
  // custom role with these permissions gets the same affordances. Presentation
  // only: every command re-checks the caller in Rust.
  const can = usePermissionStore((s) => s.can);
  const canEdit = can('complaints.edit');
  const canCreate = can('complaints.create');

  const [complaints, setComplaints] = useState<ComplaintListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ComplaintListItem | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [activeKpi, setActiveKpi] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await complaintService.listComplaints(userId);
      setComplaints(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
  }, [userId]);

  const totalCount = complaints.length;
  const openCount = complaints.filter(c => c.status === 'OPEN').length;
  const closedCount = complaints.filter(c => c.status === 'CLOSED').length;
  const uniqueCustomers = new Set(complaints.map(c => c.customer_id)).size;

  // Build unique customer list for filter dropdown
  const customerOptions = Array.from(
    new Map(complaints.map(c => [c.customer_id, `${c.customer_name} (${c.customer_id})`])).entries()
  ).map(([id, label]) => ({ value: id, label }));

  const filtered = complaints.filter(c => {
    if (activeKpi === 'open' && c.status !== 'OPEN') return false;
    if (activeKpi === 'closed' && c.status !== 'CLOSED') return false;
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterPriority && c.priority !== filterPriority) return false;
    if (filterCustomer && c.customer_id !== filterCustomer) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !c.complaint_number.toLowerCase().includes(q) &&
        !c.customer_name.toLowerCase().includes(q) &&
        !c.customer_id.toLowerCase().includes(q) &&
        !c.title.toLowerCase().includes(q) &&
        !(c.issued_by_name ?? '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  function handleKpiClick(key: string) {
    setActiveKpi(prev => prev === key ? '' : key);
    setSearch(''); setFilterStatus(''); setFilterPriority(''); setFilterCustomer('');
  }

  function onComplaintUpdated(updated: ComplaintListItem) {
    setComplaints(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSelected(updated);
  }

  const filterDefs = [
    {
      placeholder: 'All Statuses', value: filterStatus,
      options: [{ value: 'OPEN', label: 'Open' }, { value: 'CLOSED', label: 'Closed' }],
      onChange: setFilterStatus,
    },
    {
      placeholder: 'All Priorities', value: filterPriority,
      options: COMPLAINT_PRIORITIES.map(p => ({ value: p, label: p })),
      onChange: setFilterPriority,
    },
    {
      placeholder: 'All Customers', value: filterCustomer,
      options: customerOptions,
      onChange: setFilterCustomer,
    },
  ];

  const hasFilter = !!(search || filterStatus || filterPriority || filterCustomer || activeKpi);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-[#1E3A5F]">Complaints Register</h1>
        <p className="text-sm text-gray-500 mt-1">Record, track and resolve customer complaints</p>
      </div>

      <div className="px-6 pb-4 grid grid-cols-4 gap-4">
        {[
          { key: 'total', label: 'Total Complaints', value: totalCount, color: 'bg-[#1E3A5F] text-white' },
          { key: 'open', label: 'Open', value: openCount, color: 'bg-amber-50 border border-amber-200 text-amber-700' },
          { key: 'closed', label: 'Closed', value: closedCount, color: 'bg-green-50 border border-green-200 text-green-700' },
          { key: 'customers', label: 'Unique Customers', value: uniqueCustomers, color: 'bg-purple-50 border border-purple-200 text-purple-700' },
        ].map(card => (
          <button key={card.key} onClick={() => card.key !== 'customers' ? handleKpiClick(card.key) : undefined}
            className={`rounded-xl p-4 text-left transition-all shadow-sm ${card.key !== 'customers' ? 'hover:shadow-md cursor-pointer' : 'cursor-default'} ${card.color} ${activeKpi === card.key ? 'ring-2 ring-offset-1 ring-[#1E3A5F]' : ''}`}>
            <div className="text-3xl font-bold">{card.value}</div>
            <div className="text-sm mt-1 opacity-80">{card.label}</div>
          </button>
        ))}
      </div>

      <div className="px-6 pb-2">
        <ModuleToolbar
          canEdit={canEdit}
          onNew={canCreate ? () => setShowNew(true) : undefined}
          onRefresh={load}
          onPrint={() => printComplaintRegister(filtered, companyName)}
          exportOptions={[
            { label: 'Export CSV', onClick: () => exportComplaintsCSV(userId, filtered) },
            { label: 'Export JSON', onClick: () => exportComplaintsJSON(userId, filtered) },
          ]}
          hasData={filtered.length > 0}
        />
      </div>

      <div className="px-6 pb-2">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search complaint number, customer, title, issued by…"
          filters={filterDefs}
          hasActiveFilters={hasFilter}
          onClear={() => { setSearch(''); setFilterStatus(''); setFilterPriority(''); setFilterCustomer(''); setActiveKpi(''); }}
        />
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading complaints…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {hasFilter ? 'No complaints match the current filters.' : 'No complaints found. Click New Complaint to create one.'}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Complaint ID','Customer Name','Customer ID','Title','Date','Priority','Issued By','Status',''].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600 text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => setSelected(c)}
                  className="border-b border-gray-100 hover:bg-[#EBF2FA] cursor-pointer transition-colors">
                  <td className="px-3 py-3 font-mono font-bold text-[#1E3A5F] text-xs">{c.complaint_number}</td>
                  <td className="px-3 py-3 text-gray-800 font-medium text-xs">{c.customer_name}</td>
                  <td className="px-3 py-3 text-gray-600 font-mono text-xs">{c.customer_id}</td>
                  <td className="px-3 py-3 text-gray-800 max-w-[180px]">
                    <div className="line-clamp-2 text-xs">{c.title}</div>
                  </td>
                  <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">{fmtDate(c.received_date)}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${priorityBadgeClass(c.priority)}`}>
                      {c.priority ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{c.issued_by_name ?? '—'}</td>
                  <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-3 py-3 text-gray-400 text-xs">›</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="text-xs text-gray-400 mt-2">
          Showing {filtered.length} of {complaints.length} complaint{complaints.length !== 1 ? 's' : ''}
        </div>
      </div>

      {showNew && (
        <ComplaintModal complaint={null} userId={userId}
          onClose={() => setShowNew(false)}
          onSaved={c => { setComplaints(prev => [c, ...prev]); setShowNew(false); setSelected(c); }} />
      )}
      {showImport && <ImportNoticeModal onClose={() => setShowImport(false)} />}

      {selected && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setSelected(null)} />
          <DetailsDrawer
            complaint={selected} userId={userId} canEdit={canEdit}
            onClose={() => setSelected(null)}
            onUpdated={onComplaintUpdated}
          />
        </>
      )}
    </div>
  );
}
