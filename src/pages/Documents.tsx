import { useState, useEffect, useCallback } from 'react';
import { listRecordOwnerCandidates } from '../services/adminService';
import type { AssignmentCandidate } from '../services/adminService';
import {
  FolderOpen, FileText, CheckCircle, Clock, Archive,
  X, Edit2, ChevronRight, Paperclip, Trash2, Info,
} from 'lucide-react';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';

import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import ModuleToolbar from '../components/ui/ModuleToolbar';
import FilterBar from '../components/ui/FilterBar';

import { useAuthStore } from '../stores/authStore';
import DocumentViewer from '../components/documents/DocumentViewer';
import Modal from '../components/ui/Modal';
import type { DocumentFileInfo } from '../types/document';
import { usePermissionStore } from '../stores/permissionStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  listDocuments,
  createDocument,
  updateDocument,
  setDocumentStatus,
  attachDocumentFile,
  listDocumentRevisions,
  getDocumentActivity,
  getDocumentFileInfo,
  removeDocumentAttachment,
  approveDocument,
  rejectDocument,
} from '../services/documentService';
import { exportDocumentsCSV, exportDocumentsJSON } from '../services/exportService';
import { printDocumentRegister } from '../services/printService';
import { DOCUMENT_TYPES, DOCUMENT_STATUSES } from '../types/document';
import type { DocumentListItem, DocumentRevision, ActivityEntry } from '../types/document';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * What to show for "Approval Date".
 *
 * approval_date is the system-generated one. Documents created before this
 * existed carry a hand-typed date in effective_date — the form used to write
 * there under the label "Approval Date" — so it is still shown rather than
 * discarded, and marked so nobody reads it as a system record.
 */
function approvalDateLabel(doc: DocumentListItem | null): string {
  if (!doc) return 'Pending approval';
  if (doc.approval_date) return fmtDate(doc.approval_date);
  if (doc.effective_date) return `${fmtDate(doc.effective_date)} (recorded before approval tracking)`;
  // A document already CONTROLLED before this workflow existed has no approval
  // record at all. Saying "pending" would be wrong — it is not waiting for
  // anything — and inventing a date would be worse.
  if (doc.status === 'CONTROLLED') return 'Not recorded';
  if (doc.rejected_at) return 'Rejected — awaiting correction';
  return 'Pending approval';
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.replace('T', ' ').split(' ')[0];
}

interface DocForm {
  title: string;
  document_type: string;
  version: string;
  owner_user_id: string;
  description: string;
}

const EMPTY_FORM: DocForm = {
  title: '',
  document_type: '',
  version: '1.0',
  owner_user_id: '',
  description: '',
};

const ACTION_META: Record<string, { label: string; cls: string }> = {
  CREATED:        { label: 'Created',        cls: 'bg-[#DCFCE7] text-[#15803D]' },
  UPDATED:        { label: 'Updated',        cls: 'bg-[#DBEAFE] text-[#1D4ED8]' },
  STATUS_CHANGED: { label: 'Status Changed', cls: 'bg-[#FEF9C3] text-[#92400E]' },
  FILE_ATTACHED:  { label: 'File Attached',  cls: 'bg-[#EDE9FE] text-[#6D28D9]' },
};

// ──────────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────────

export default function Documents() {
  const { user } = useAuthStore();
  const { companyName } = useSettingsStore();
  // Gating is derived from effective permissions, not from the role name, so a
  // custom role with these permissions gets the same affordances. Presentation
  // only: every command re-checks the caller in Rust.
  const can = usePermissionStore((s) => s.can);
  const canEdit = can('documents.edit');
  const canCreate = can('documents.create');
  const canManageFiles = can('documents.attachment_manage');
  const canApprove = can('documents.approve');
  const canPrint = can('documents.print');
  const canOpenExternal = can('documents.open_external');

  // Data
  const [documents, setDocuments]   = useState<DocumentListItem[]>([]);
  // AssignmentCandidate is id+name only - narrower than UserMinimal by design.
  const [users, setUsers]           = useState<AssignmentCandidate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Filters
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]   = useState('');

  // Drawer
  const [selected, setSelected]       = useState<DocumentListItem | null>(null);
  const [drawerTab, setDrawerTab]     = useState<'details' | 'revisions' | 'activity'>('details');
  const [revisions, setRevisions]     = useState<DocumentRevision[]>([]);
  const [activity, setActivity]       = useState<ActivityEntry[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // File attach
  const [pendingPath, setPendingPath]     = useState<string | null>(null);
  const [pendingName, setPendingName]     = useState('');
  const [attachSummary, setAttachSummary] = useState('');
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachError, setAttachError]     = useState<string | null>(null);

  // Viewer / approval
  const [viewerInfo, setViewerInfo]   = useState<DocumentFileInfo | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy]   = useState(false);
  const [rejectOpen, setRejectOpen]   = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Document modal
  const [modalOpen, setModalOpen]     = useState(false);
  const [modalMode, setModalMode]     = useState<'create' | 'edit'>('create');
  const [form, setForm]               = useState<DocForm>(EMPTY_FORM);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError]   = useState<string | null>(null);

  // Status modal
  const [statusOpen, setStatusOpen]       = useState(false);
  const [targetStatus, setTargetStatus]   = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError]     = useState<string | null>(null);

  // Import notice modal
  const [importNoticeOpen, setImportNoticeOpen] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadDocuments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [docs, usrs] = await Promise.all([
        listDocuments(user.id),
        // Owner candidates require documents.create/edit, so they are fetched
        // only when the user can actually edit. A read-only viewer never asks.
        canEdit ? listRecordOwnerCandidates(user.id, 'documents') : Promise.resolve<AssignmentCandidate[]>([]),
      ]);
      setDocuments(docs);
      setUsers(usrs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user, canEdit]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const loadDrawerData = useCallback(async (docId: number) => {
    if (!user) return;
    setDrawerLoading(true);
    try {
      const [revs, acts] = await Promise.all([
        listDocumentRevisions(user.id, docId),
        getDocumentActivity(user.id, docId),
      ]);
      setRevisions(revs);
      setActivity(acts);
    } catch {
      // drawer still usable without side panel data
    } finally {
      setDrawerLoading(false);
    }
  }, [user]);

  const selectDocument = (doc: DocumentListItem) => {
    setSelected(doc);
    setDrawerTab('details');
    setPendingPath(null);
    setPendingName('');
    setAttachSummary('');
    setAttachError(null);
    loadDrawerData(doc.id);
  };

  // ── KPIs ────────────────────────────────────────────────────────────────────

  const total      = documents.length;
  const controlled = documents.filter(d => d.status === 'CONTROLLED').length;
  const underProc  = documents.filter(d => d.status === 'UNDER PROCESS').length;
  const obsolete   = documents.filter(d => d.status === 'OBSOLETE').length;

  // ── Filters ──────────────────────────────────────────────────────────────────

  const filtered = documents.filter(doc => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || doc.doc_number.toLowerCase().includes(q)
      || doc.title.toLowerCase().includes(q)
      || (doc.owner_name ?? '').toLowerCase().includes(q)
      || doc.category.toLowerCase().includes(q);
    return matchSearch
      && (!statusFilter || doc.status === statusFilter)
      && (!typeFilter   || doc.category === typeFilter);
  });

  // ── Modal handlers ────────────────────────────────────────────────────────────

  const openCreateModal = () => {
    setForm(EMPTY_FORM);
    setModalMode('create');
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = () => {
    if (!selected) return;
    setForm({
      title:          selected.title,
      document_type:  selected.category,
      version:        selected.version,
      owner_user_id:  selected.owner_id ? String(selected.owner_id) : '',
      description:    selected.description ?? '',
    });
    setModalMode('edit');
    setModalError(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!form.title.trim())    { setModalError('Title is required'); return; }
    if (!form.document_type)   { setModalError('Document type is required'); return; }
    setModalLoading(true);
    setModalError(null);
    try {
      const ownerUserId  = form.owner_user_id ? Number(form.owner_user_id) : null;
      const description  = form.description.trim() || null;

      if (modalMode === 'create') {
        const created = await createDocument(
          user.id, form.title, form.document_type, form.version,
          ownerUserId, description,
        );
        setDocuments(prev => [created, ...prev]);
        setModalOpen(false);
        selectDocument(created);
      } else if (selected) {
        const updated = await updateDocument(
          user.id, selected.id, form.title, form.document_type, form.version,
          ownerUserId, description,
        );
        setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
        setSelected(updated);
        setModalOpen(false);
        loadDrawerData(updated.id);
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setModalLoading(false);
    }
  };

  // ── Status change ─────────────────────────────────────────────────────────────

  const openStatusModal = () => {
    if (!selected) return;
    const others = DOCUMENT_STATUSES.filter(s => s !== selected.status);
    setTargetStatus(others[0] ?? '');
    setStatusError(null);
    setStatusOpen(true);
  };

  const confirmStatusChange = async () => {
    if (!user || !selected || !targetStatus) return;
    setStatusLoading(true);
    setStatusError(null);
    try {
      const updated = await setDocumentStatus(user.id, selected.id, targetStatus);
      setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
      setSelected(updated);
      setStatusOpen(false);
      loadDrawerData(updated.id);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatusLoading(false);
    }
  };

  // ── File handlers ─────────────────────────────────────────────────────────────

  const handleBrowseFile = async () => {
    try {
      const result = await openFileDialog({
        multiple: false,
        filters: [{
          name: 'Documents',
          extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'],
        }],
      });
      if (!result || typeof result !== 'string') return;
      const parts = result.replace(/\\/g, '/').split('/');
      const fileName = parts[parts.length - 1] || 'file';
      setPendingPath(result);
      setPendingName(fileName);
      setAttachSummary('');
      setAttachError(null);
    } catch {
      setAttachError('File picker failed. Please try again.');
    }
  };

  const handleAttachFile = async () => {
    if (!user || !selected || !pendingPath) return;
    setAttachLoading(true);
    setAttachError(null);
    try {
      const updated = await attachDocumentFile(
        user.id, selected.id, pendingPath, pendingName,
        attachSummary.trim() || null,
      );
      setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
      setSelected(updated);
      setPendingPath(null);
      setPendingName('');
      setAttachSummary('');
      const [revs, acts] = await Promise.all([
        listDocumentRevisions(user.id, updated.id),
        getDocumentActivity(user.id, updated.id),
      ]);
      setRevisions(revs);
      setActivity(acts);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttachLoading(false);
    }
  };

  // Opening a document keeps it inside the application: fetch what kind of file
  // it is, then show the viewer. Handing it to Windows is a separate, narrower
  // action inside the viewer.
  const handleOpenFile = async () => {
    if (!user || !selected) return;
    setActionError(null);
    try {
      const info = await getDocumentFileInfo(user.id, selected.id);
      setViewerInfo(info);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  // Every lifecycle action refreshes from what the backend returned, so the
  // screen reflects the record rather than an optimistic guess about it.
  const applyUpdated = (updated: DocumentListItem) => {
    setDocuments(prev => prev.map(d => (d.id === updated.id ? updated : d)));
    setSelected(updated);
    loadDrawerData(updated.id);
  };

  const runAction = async (fn: () => Promise<DocumentListItem>) => {
    setActionBusy(true);
    setActionError(null);
    try {
      applyUpdated(await fn());
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setActionBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !selected) return;
    await runAction(() => approveDocument(user.id, selected.id));
  };

  const handleReject = async () => {
    if (!user || !selected) return;
    if (!rejectReason.trim()) return;
    const ok = await runAction(() => rejectDocument(user.id, selected.id, rejectReason));
    if (ok) { setRejectOpen(false); setRejectReason(''); }
  };

  const handleRemoveAttachment = async () => {
    if (!user || !selected) return;
    const ok = await runAction(() => removeDocumentAttachment(user.id, selected.id));
    if (ok) setConfirmRemove(false);
  };


  // ── Export / Print ────────────────────────────────────────────────────────────

  const handleExportCSV = async () => {
    try {
      await exportDocumentsCSV(user!.id, filtered);
    } catch {
      // user cancelled save dialog or error — silent
    }
  };

  const handleExportJSON = async () => {
    try {
      await exportDocumentsJSON(user!.id, filtered);
    } catch {
      // user cancelled save dialog or error — silent
    }
  };

  const handlePrint = () => {
    printDocumentRegister(filtered, companyName || 'QMS Desktop');
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Documents"
          subtitle="Controlled document register with version management"
          icon={<FolderOpen size={18} />}
        />
        <div className="pt-1 shrink-0">
          <ModuleToolbar
            canEdit={canEdit}
            loading={loading}
            onNew={canCreate ? openCreateModal : undefined}
            newLabel="New Document"
            onRefresh={loadDocuments}
            onPrint={handlePrint}
            exportOptions={[
              { label: 'Export CSV', onClick: handleExportCSV },
              { label: 'Export JSON', onClick: handleExportJSON },
            ]}
            hasData={filtered.length > 0}
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Documents" value={total} icon={<FileText size={18} />} color="navy" />
        <StatCard
          label="Controlled"
          value={controlled}
          icon={<CheckCircle size={18} />}
          color="green"
          onClick={() => setStatusFilter(statusFilter === 'CONTROLLED' ? '' : 'CONTROLLED')}
          description={statusFilter === 'CONTROLLED' ? 'Filter active — click to clear' : undefined}
        />
        <StatCard
          label="Under Process"
          value={underProc}
          icon={<Clock size={18} />}
          color="amber"
          onClick={() => setStatusFilter(statusFilter === 'UNDER PROCESS' ? '' : 'UNDER PROCESS')}
          description={statusFilter === 'UNDER PROCESS' ? 'Filter active — click to clear' : undefined}
        />
        <StatCard
          label="Obsolete"
          value={obsolete}
          icon={<Archive size={18} />}
          color="gray"
          onClick={() => setStatusFilter(statusFilter === 'OBSOLETE' ? '' : 'OBSOLETE')}
          description={statusFilter === 'OBSOLETE' ? 'Filter active — click to clear' : undefined}
        />
      </div>

      {/* Filter bar */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search doc number, title, owner…"
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: 'All Statuses',
            options: DOCUMENT_STATUSES.map(s => ({ value: s, label: s })),
          },
          {
            value: typeFilter,
            onChange: setTypeFilter,
            placeholder: 'All Types',
            options: DOCUMENT_TYPES.map(t => ({ value: t, label: t })),
          },
        ]}
        onClear={() => { setSearch(''); setStatusFilter(''); setTypeFilter(''); }}
        hasActiveFilters={Boolean(search || statusFilter || typeFilter)}
      />

      {/* Document table */}
      <Card padding={false}>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[#94A3B8] text-[13px]">
            Loading documents…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-[#DC2626] text-[13px]">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={28} />}
            title={documents.length === 0 ? 'No Documents' : 'No Matching Documents'}
            description={
              documents.length === 0
                ? 'Controlled documents will appear here. Create your first document to get started.'
                : 'No documents match your current filters.'
            }
            action={
              canEdit && documents.length === 0
                ? { label: 'New Document', onClick: openCreateModal }
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  {['Doc Number', 'Title', 'Type', 'Ver.', 'Status', 'Owner', 'Approval Date', ''].map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 font-semibold text-[#64748B] text-[11px]
                                 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(doc => (
                  <tr
                    key={doc.id}
                    onClick={() => selectDocument(doc)}
                    className={`
                      border-b border-[#F1F5F9] cursor-pointer transition-colors duration-100
                      hover:bg-[#F8FAFC]
                      ${selected?.id === doc.id ? 'bg-[#EBF2FA] hover:bg-[#EBF2FA]' : 'bg-white'}
                    `}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-[12px] font-bold text-[#1E3A5F]">
                        {doc.doc_number}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[#1A202C] font-medium truncate">{doc.title}</span>
                        {doc.file_path && (
                          <Paperclip size={11} className="text-[#94A3B8] shrink-0" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {doc.category
                        ? <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#F1F5F9] text-[#64748B]">{doc.category}</span>
                        : <span className="text-[#CBD5E1]">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-[#64748B] whitespace-nowrap">{doc.version}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="px-4 py-3 text-[#64748B] whitespace-nowrap max-w-[120px] truncate">
                      {doc.owner_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[#64748B] whitespace-nowrap">
                      {approvalDateLabel(doc)}
                    </td>
                    <td className="px-4 py-3 w-8">
                      <ChevronRight size={14} className="text-[#CBD5E1]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 text-[11px] text-[#94A3B8] border-t border-[#F1F5F9]">
              {filtered.length} document{filtered.length !== 1 ? 's' : ''}
              {(search || statusFilter || typeFilter) && ` (filtered from ${documents.length})`}
            </div>
          </div>
        )}
      </Card>

      {/* Details drawer */}
      {selected && (
        <DetailsDrawer
          doc={selected}
          tab={drawerTab}
          setTab={setDrawerTab}
          revisions={revisions}
          activity={activity}
          drawerLoading={drawerLoading}
          canEdit={canEdit}
          onEdit={openEditModal}
          onClose={() => setSelected(null)}
          onStatusChange={openStatusModal}
          pendingPath={pendingPath}
          setPendingPath={setPendingPath}
          pendingName={pendingName}
          attachSummary={attachSummary}
          setAttachSummary={setAttachSummary}
          attachLoading={attachLoading}
          attachError={attachError}
          onBrowseFile={handleBrowseFile}
          onAttachFile={handleAttachFile}
          onOpenFile={handleOpenFile}
          canManageFiles={canManageFiles}
          canApprove={canApprove}
          actionError={actionError}
          actionBusy={actionBusy}
          onApprove={handleApprove}
          onRejectOpen={() => { setRejectReason(''); setActionError(null); setRejectOpen(true); }}
          onRemoveOpen={() => { setActionError(null); setConfirmRemove(true); }}
        />
      )}

      {/* Create / Edit modal */}
      {modalOpen && (
        <DocumentModal
          approvalLabel={modalMode === 'create' ? 'Set when the document is approved' : approvalDateLabel(selected)}
          mode={modalMode}
          form={form}
          setForm={setForm}
          users={users}
          loading={modalLoading}
          error={modalError}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      {/* Status change modal */}
      {statusOpen && selected && (
        <StatusModal
          currentStatus={selected.status}
          docNumber={selected.doc_number}
          targetStatus={targetStatus}
          setTargetStatus={setTargetStatus}
          loading={statusLoading}
          error={statusError}
          onClose={() => setStatusOpen(false)}
          onConfirm={confirmStatusChange}
        />
      )}

      {/* Import notice modal */}
      {importNoticeOpen && (
        <ImportNoticeModal onClose={() => setImportNoticeOpen(false)} />
      )}

      {/* In-app viewer. The document stays inside QMS unless someone explicitly
          chooses to hand it to Windows. */}
      {viewerInfo && selected && user && (
        <DocumentViewer
          open
          onClose={() => setViewerInfo(null)}
          currentUserId={user.id}
          doc={selected}
          info={viewerInfo}
          canPrint={canPrint}
          canOpenExternal={canOpenExternal}
        />
      )}

      {/* Rejection needs a reason: the author has to know what to correct. */}
      <Modal
        open={rejectOpen}
        title={`Reject ${selected?.doc_number ?? ''}`}
        onClose={() => setRejectOpen(false)}
        widthClass="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)} disabled={actionBusy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleReject}
              disabled={actionBusy || !rejectReason.trim()}
            >
              {actionBusy ? 'Rejecting…' : 'Reject Document'}
            </Button>
          </>
        }
      >
        {actionError && (
          <p className="text-[13px] text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
            {actionError}
          </p>
        )}
        <p className="text-[12.5px] text-[#64748B]">
          The document, its file and its history are kept. It stays editable so the author can
          correct it and resubmit.
        </p>
        <div>
          <label className="block text-[12px] font-semibold text-[#374151] mb-1">
            Rejection Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            autoFocus
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="What needs to change before this can be approved?"
            className="w-full px-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#2E5080]"
          />
          {!rejectReason.trim() && (
            <p className="text-[11.5px] text-[#94A3B8] mt-1">
              A reason is required — whitespace alone will not do.
            </p>
          )}
        </div>
      </Modal>

      {/* Removing a draft's file deletes the stored copy, so it is confirmed. */}
      <Modal
        open={confirmRemove}
        title="Remove attached file"
        onClose={() => setConfirmRemove(false)}
        widthClass="max-w-lg"
        closeOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRemove(false)} disabled={actionBusy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRemoveAttachment} disabled={actionBusy}>
              {actionBusy ? 'Removing…' : 'Remove File'}
            </Button>
          </>
        }
      >
        {actionError && (
          <p className="text-[13px] text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
            {actionError}
          </p>
        )}
        <p className="text-[13px] text-[#374151]">
          Remove <strong>{selected?.original_file_name}</strong> from{' '}
          <strong>{selected?.doc_number}</strong>?
        </p>
        <p className="text-[12.5px] text-[#64748B]">
          The stored copy is deleted and the draft revision entry for it is dropped. The removal
          itself is recorded in the document's activity history. This is only possible because the
          document is still under process and has never been approved.
        </p>
      </Modal>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DetailsDrawer
// ──────────────────────────────────────────────────────────────────────────────

interface DrawerProps {
  doc: DocumentListItem;
  tab: 'details' | 'revisions' | 'activity';
  setTab: (t: 'details' | 'revisions' | 'activity') => void;
  revisions: DocumentRevision[];
  activity: ActivityEntry[];
  drawerLoading: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
  onStatusChange: () => void;
  pendingPath: string | null;
  setPendingPath: (p: string | null) => void;
  pendingName: string;
  attachSummary: string;
  setAttachSummary: (s: string) => void;
  attachLoading: boolean;
  attachError: string | null;
  onBrowseFile: () => void;
  onAttachFile: () => void;
  onOpenFile: () => void;
  canManageFiles: boolean;
  canApprove: boolean;
  actionError: string | null;
  actionBusy: boolean;
  onApprove: () => void;
  onRejectOpen: () => void;
  onRemoveOpen: () => void;
}

function DetailsDrawer({
  doc, tab, setTab, revisions, activity, drawerLoading, canEdit,
  onEdit, onClose, onStatusChange,
  pendingPath, setPendingPath, pendingName,
  attachSummary, setAttachSummary, attachLoading, attachError,
  onBrowseFile, onAttachFile, onOpenFile,
  canManageFiles, canApprove, actionError, actionBusy,
  onApprove, onRejectOpen, onRemoveOpen,
}: DrawerProps) {
  const tabBtn = (t: typeof tab, label: string, count?: number) => (
    <button
      className={`px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors cursor-pointer ${
        tab === t
          ? 'border-[#1E3A5F] text-[#1E3A5F]'
          : 'border-transparent text-[#64748B] hover:text-[#1A202C]'
      }`}
      onClick={() => setTab(t)}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1 text-[10px] opacity-70">({count})</span>
      )}
    </button>
  );

  return (
    <div
      className="fixed right-0 top-0 h-screen w-[440px] bg-white border-l border-[#E2E8F0]
                 shadow-2xl z-40 flex flex-col"
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-[#E2E8F0] flex-shrink-0">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[11px] font-bold text-[#2E5080] bg-[#EBF2FA]
                             px-2 py-0.5 rounded inline-block mb-1.5">
              {doc.doc_number}
            </span>
            <h2 className="text-[15px] font-semibold text-[#1A202C] leading-snug mb-2">
              {doc.title}
            </h2>
            <StatusBadge status={doc.status} />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#1A202C] transition-colors"
                title="Edit document"
              >
                <Edit2 size={15} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#1A202C] transition-colors"
              title="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E2E8F0] flex-shrink-0">
        {tabBtn('details', 'Details')}
        {tabBtn('revisions', 'Revisions', revisions.length)}
        {tabBtn('activity', 'Activity', activity.length)}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'details' && (
          <DetailsTab
            doc={doc}
            canEdit={canEdit}
            onStatusChange={onStatusChange}
            pendingPath={pendingPath}
            setPendingPath={setPendingPath}
            pendingName={pendingName}
            attachSummary={attachSummary}
            setAttachSummary={setAttachSummary}
            attachLoading={attachLoading}
            attachError={attachError}
            onBrowseFile={onBrowseFile}
            onAttachFile={onAttachFile}
            canManageFiles={canManageFiles}
            canApprove={canApprove}
            actionError={actionError}
            actionBusy={actionBusy}
            onApprove={onApprove}
            onRejectOpen={onRejectOpen}
            onRemoveOpen={onRemoveOpen}
            onOpenFile={onOpenFile}
          />
        )}
        {tab === 'revisions' && (
          <RevisionsTab revisions={revisions} loading={drawerLoading} />
        )}
        {tab === 'activity' && (
          <ActivityTab entries={activity} loading={drawerLoading} />
        )}
      </div>
    </div>
  );
}

// ── Details tab ────────────────────────────────────────────────────────────────

interface DetailsTabProps {
  doc: DocumentListItem;
  canEdit: boolean;
  onStatusChange: () => void;
  pendingPath: string | null;
  setPendingPath: (p: string | null) => void;
  pendingName: string;
  attachSummary: string;
  setAttachSummary: (s: string) => void;
  attachLoading: boolean;
  attachError: string | null;
  onBrowseFile: () => void;
  onAttachFile: () => void;
  onOpenFile: () => void;
  canManageFiles: boolean;
  canApprove: boolean;
  actionError: string | null;
  actionBusy: boolean;
  onApprove: () => void;
  onRejectOpen: () => void;
  onRemoveOpen: () => void;
}

function DetailsTab({
  doc, canEdit, onStatusChange,
  pendingPath, setPendingPath, pendingName,
  attachSummary, setAttachSummary, attachLoading, attachError,
  onBrowseFile, onAttachFile, onOpenFile,
  canManageFiles, canApprove, actionError, actionBusy,
  onApprove, onRejectOpen, onRemoveOpen,
}: DetailsTabProps) {
  return (
    <div className="p-5 space-y-6">
      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <MetaField label="Document Type" value={doc.category || '—'} />
        <MetaField label="Version" value={doc.version} />
        <div>
          <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-1">
            Status
          </p>
          <div className="flex items-center gap-2">
            <StatusBadge status={doc.status} />
            {canEdit && (
              <button
                onClick={onStatusChange}
                className="text-[11px] text-[#2E5080] hover:underline"
              >
                Change
              </button>
            )}
          </div>
        </div>
        <MetaField label="Owner" value={doc.owner_name ?? '—'} />
        <MetaField label="Approval Date" value={approvalDateLabel(doc)} />
        {doc.approved_by_name && <MetaField label="Approved By" value={doc.approved_by_name} />}
        {doc.rejected_at && doc.status === 'UNDER PROCESS' && (
          <div className="col-span-2">
            <p className="text-[11px] font-semibold text-[#B91C1C] uppercase tracking-wide mb-1">
              Rejected — correction required
            </p>
            <p className="text-[12.5px] text-[#7F1D1D] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2 whitespace-pre-wrap">
              {doc.rejection_reason}
            </p>
            <p className="text-[11px] text-[#94A3B8] mt-1">
              {fmtDate(doc.rejected_at)}{doc.rejected_by_name ? ' · ' + doc.rejected_by_name : ''}
            </p>
          </div>
        )}
        <MetaField label="Last Revised" value={fmtDate(doc.revision_date)} />
        <MetaField label="Created" value={fmtDate(doc.created_at)} />
        <MetaField label="Updated" value={fmtDate(doc.updated_at)} />
      </div>

      {/* Description */}
      {doc.description && (
        <div>
          <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-1.5">
            Description
          </p>
          <p className="text-[13px] text-[#374151] leading-relaxed whitespace-pre-wrap">
            {doc.description}
          </p>
        </div>
      )}

      {/* Approval — only where the lifecycle actually allows a decision */}
      {canApprove && doc.status === 'UNDER PROCESS' && (
        <div className="border border-[#E2E8F0] rounded-lg p-4 space-y-3">
          <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">
            Approval
          </p>
          {!doc.file_path ? (
            <p className="text-[12.5px] text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-md px-3 py-2">
              Attach the document file before approving. A controlled document must have the file
              it controls.
            </p>
          ) : (
            <p className="text-[12.5px] text-[#64748B]">
              Approving places this document under control and records the approval date and
              approver automatically.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={actionBusy || !doc.file_path}
              onClick={onApprove}
            >
              <CheckCircle size={13} /> Approve
            </Button>
            <Button variant="secondary" size="sm" disabled={actionBusy} onClick={onRejectOpen}>
              <X size={13} /> Reject
            </Button>
          </div>
        </div>
      )}

      {/* File section */}
      <div className="border border-[#E2E8F0] rounded-lg p-4 space-y-3">
        <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">
          Attached File
        </p>

        {doc.original_file_name ? (
          <div className="flex items-center gap-2">
            <Paperclip size={13} className="text-[#64748B] shrink-0" />
            <span className="text-[13px] text-[#1A202C] font-medium flex-1 truncate">
              {doc.original_file_name}
            </span>
            <button
              onClick={onOpenFile}
              className="flex items-center gap-1 text-[12px] text-[#2E5080] hover:underline shrink-0"
            >
              <FileText size={12} /> Preview
            </button>
          </div>
        ) : (
          <p className="text-[13px] text-[#94A3B8] italic">No file attached</p>
        )}

        {actionError && (
          <p className="text-[12.5px] text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
            {actionError}
          </p>
        )}

        {/* A draft's file can be corrected. A controlled one is evidence: it is
            superseded by a new revision, never edited in place or erased. */}
        {canManageFiles && doc.status === 'UNDER PROCESS' && !pendingPath && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onBrowseFile}>
              <Paperclip size={13} />
              {doc.file_path ? 'Replace File' : 'Attach File'}
            </Button>
            {doc.file_path && (
              <Button variant="secondary" size="sm" onClick={onRemoveOpen} disabled={actionBusy}>
                <Trash2 size={13} /> Remove File
              </Button>
            )}
          </div>
        )}

        {canManageFiles && doc.status !== 'UNDER PROCESS' && doc.file_path && (
          <p className="text-[11.5px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2">
            This document is {doc.status.toLowerCase()}. Its file is part of the controlled record
            and cannot be replaced or removed here — raise a new revision instead.
          </p>
        )}

        {canManageFiles && pendingPath && (
          <div className="space-y-2.5 pt-1 border-t border-[#F1F5F9]">
            <div className="flex items-center gap-2 text-[13px]">
              <Paperclip size={13} className="text-[#2E5080] shrink-0" />
              <span className="text-[#1A202C] flex-1 truncate">{pendingName}</span>
              <button
                onClick={() => setPendingPath(null)}
                className="text-[#94A3B8] hover:text-[#1A202C]"
                title="Cancel"
              >
                <X size={13} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Change summary (optional)"
              value={attachSummary}
              onChange={e => setAttachSummary(e.target.value)}
              className="w-full px-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md
                         placeholder-[#94A3B8] focus:outline-none focus:ring-2
                         focus:ring-[#1E3A5F]/20 focus:border-[#2E5080]"
            />
            {attachError && (
              <p className="text-[12px] text-[#DC2626]">{attachError}</p>
            )}
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={onAttachFile} disabled={attachLoading}>
                {attachLoading ? 'Uploading…' : 'Save File'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPendingPath(null)} disabled={attachLoading}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {attachError && !pendingPath && (
          <p className="text-[12px] text-[#DC2626]">{attachError}</p>
        )}
      </div>
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p className="text-[13px] text-[#1A202C]">{value}</p>
    </div>
  );
}

// ── Revisions tab ──────────────────────────────────────────────────────────────

function RevisionsTab({ revisions, loading }: { revisions: DocumentRevision[]; loading: boolean }) {
  if (loading) return <div className="p-5 text-[13px] text-[#94A3B8]">Loading revisions…</div>;
  if (revisions.length === 0) return <div className="p-5 text-[13px] text-[#94A3B8] italic">No revision history.</div>;

  return (
    <div className="p-5 space-y-3">
      {revisions.map(rev => (
        <div key={rev.id} className="border border-[#E2E8F0] rounded-lg p-3.5 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] font-bold text-[#2E5080] bg-[#EBF2FA] px-1.5 py-0.5 rounded">
              v{rev.version}
            </span>
            {rev.original_file_name && (
              <span className="flex items-center gap-1 text-[11px] text-[#64748B]">
                <Paperclip size={10} /> {rev.original_file_name}
              </span>
            )}
            <span className="ml-auto text-[11px] text-[#94A3B8]">{fmtDate(rev.revised_at)}</span>
          </div>
          {rev.change_summary && (
            <p className="text-[12px] text-[#374151]">{rev.change_summary}</p>
          )}
          {rev.revised_by_name && (
            <p className="text-[11px] text-[#94A3B8]">By {rev.revised_by_name}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Activity tab ───────────────────────────────────────────────────────────────

function ActivityTab({ entries, loading }: { entries: ActivityEntry[]; loading: boolean }) {
  if (loading) return <div className="p-5 text-[13px] text-[#94A3B8]">Loading activity…</div>;
  if (entries.length === 0) return <div className="p-5 text-[13px] text-[#94A3B8] italic">No activity recorded.</div>;

  return (
    <div className="p-5 space-y-1">
      {entries.map((entry, idx) => {
        const meta = ACTION_META[entry.action] ?? { label: entry.action, cls: 'bg-[#F1F5F9] text-[#64748B]' };
        return (
          <div key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-[#CBD5E1] mt-1.5 shrink-0" />
              {idx < entries.length - 1 && <div className="flex-1 w-px bg-[#F1F5F9] mt-1" />}
            </div>
            <div className="pb-4 flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.cls}`}>
                  {meta.label}
                </span>
                <span className="ml-auto text-[11px] text-[#94A3B8] shrink-0">
                  {fmtDate(entry.performed_at)}
                </span>
              </div>
              {entry.description && (
                <p className="text-[12px] text-[#374151]">{entry.description}</p>
              )}
              {entry.performed_by_name && (
                <p className="text-[11px] text-[#94A3B8] mt-0.5">by {entry.performed_by_name}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DocumentModal (Create / Edit)
// ──────────────────────────────────────────────────────────────────────────────

interface ModalProps {
  mode: 'create' | 'edit';
  form: DocForm;
  setForm: (f: DocForm) => void;
  users: AssignmentCandidate[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  /** Read-only text for the approval date field. */
  approvalLabel: string;
}

function DocumentModal({ mode, form, setForm, users, loading, error, onClose, onSubmit, approvalLabel }: ModalProps) {
  const set = (key: keyof DocForm, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#E2E8F0]">
          <h2 className="text-[15px] font-semibold text-[#1A202C]">
            {mode === 'create' ? 'New Document' : 'Edit Document'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#1A202C] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-[12px] font-semibold text-[#374151] mb-1">
              Title <span className="text-[#DC2626]">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Document title"
              className="w-full px-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md
                         placeholder-[#94A3B8] focus:outline-none focus:ring-2
                         focus:ring-[#1E3A5F]/20 focus:border-[#2E5080]"
            />
          </div>

          {/* Type + Version */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                Document Type <span className="text-[#DC2626]">*</span>
              </label>
              <select
                value={form.document_type}
                onChange={e => set('document_type', e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md
                           bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#2E5080]"
              >
                <option value="">Select type…</option>
                {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                Version
              </label>
              <input
                type="text"
                value={form.version}
                onChange={e => set('version', e.target.value)}
                placeholder="1.0"
                className="w-full px-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md
                           placeholder-[#94A3B8] focus:outline-none focus:ring-2
                           focus:ring-[#1E3A5F]/20 focus:border-[#2E5080]"
              />
            </div>
          </div>

          {/* Owner + Approval Date (read-only) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#374151] mb-1">Owner</label>
              <select
                value={form.owner_user_id}
                onChange={e => set('owner_user_id', e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md
                           bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#2E5080]"
              >
                <option value="">— None —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#374151] mb-1">Approval Date</label>
              {/* Read-only by design. An approval date is evidence that a document
                  became controlled, so it is set by approving — not typed. */}
              <div className="w-full px-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md bg-[#F8FAFC] text-[#64748B]">
                {approvalLabel}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[12px] font-semibold text-[#374151] mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Optional description or scope…"
              className="w-full px-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md
                         placeholder-[#94A3B8] focus:outline-none focus:ring-2
                         focus:ring-[#1E3A5F]/20 focus:border-[#2E5080] resize-none"
            />
          </div>

          {error && (
            <div className="bg-[#FEE2E2] border border-[#FCA5A5] rounded-md px-3 py-2
                            text-[12px] text-[#DC2626]">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E2E8F0]">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" onClick={onSubmit} disabled={loading}>
            {loading
              ? (mode === 'create' ? 'Creating…' : 'Saving…')
              : (mode === 'create' ? 'Create Document' : 'Save Changes')
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// StatusModal
// ──────────────────────────────────────────────────────────────────────────────

interface StatusModalProps {
  currentStatus: string;
  docNumber: string;
  targetStatus: string;
  setTargetStatus: (s: string) => void;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

function StatusModal({
  currentStatus, docNumber, targetStatus, setTargetStatus,
  loading, error, onClose, onConfirm,
}: StatusModalProps) {
  const options = DOCUMENT_STATUSES.filter(s => s !== currentStatus);

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#E2E8F0]">
          <h2 className="text-[15px] font-semibold text-[#1A202C]">Change Status</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#1A202C] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-[13px] text-[#374151]">
            Update status of <span className="font-mono font-bold text-[#1E3A5F]">{docNumber}</span>:
          </p>
          <div className="flex items-center gap-3">
            <StatusBadge status={currentStatus} />
            <span className="text-[#94A3B8] text-sm">→</span>
            <select
              value={targetStatus}
              onChange={e => setTargetStatus(e.target.value)}
              className="px-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md bg-white
                         focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#2E5080]"
            >
              {options.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {error && <p className="text-[12px] text-[#DC2626]">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E2E8F0]">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} disabled={loading || !targetStatus}>
            {loading ? 'Changing…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ImportNoticeModal — Phase 4B preview-only notice
// ──────────────────────────────────────────────────────────────────────────────

function ImportNoticeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-[#2E5080]" />
            <h2 className="text-[15px] font-semibold text-[#1A202C]">Import Documents</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#1A202C] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-[#EBF2FA] border border-[#BFDBFE] rounded-lg px-4 py-3">
            <p className="text-[13px] text-[#1E3A5F] font-medium mb-1">
              Import is not yet available in this version.
            </p>
            <p className="text-[12px] text-[#374151] leading-relaxed">
              Bulk import from CSV or JSON will be available in a future release.
              Use the <strong>New Document</strong> button to add documents individually.
            </p>
          </div>
          <p className="text-[12px] text-[#64748B]">
            When import is released, it will support CSV and JSON formats with a
            preview step before any data is written to the database.
          </p>
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-[#E2E8F0]">
          <Button variant="primary" onClick={onClose}>Got it</Button>
        </div>
      </div>
    </div>
  );
}
