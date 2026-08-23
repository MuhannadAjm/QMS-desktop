import { useState, useEffect } from 'react';
import {
  HardDrive,
  FolderOpen,
  Plus,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
  Upload,
  Info,
  TriangleAlert,
  Trash2,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import Card from '../components/ui/Card';
import { useAuthStore } from '../stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';
import {
  getBackupStatus,
  createLocalBackup,
  openBackupsFolder,
  restoreLocalBackup,
  validateImportBackup,
  deleteBackup,
} from '../services/backupService';
import type { BackupStatus, BackupEntry } from '../types/backup';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.split('T')[0];
}

function fmtSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Restore Confirmation Modal ────────────────────────────────────────────────

interface RestoreModalProps {
  entry: BackupEntry | null;
  importPath: string | null;
  onCancel: () => void;
  onConfirm: (preserveLicense: boolean) => void;
  isRestoring: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

function RestoreModal({ entry, importPath, onCancel, onConfirm, isRestoring, message }: RestoreModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [preserveLicense, setPreserveLicense] = useState(true);
  const isImport = !!importPath;
  const displayName = entry?.name ?? (importPath ? importPath.split(/[\\/]/).pop() : '');
  const canConfirm = confirmText === 'RESTORE' && !isRestoring;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">

        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <TriangleAlert size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1A202C]">
              {isImport ? 'Import & Restore Backup' : 'Restore Backup'}
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5 font-mono truncate max-w-xs">{displayName}</p>
          </div>
        </div>

        {/* Warning box */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 space-y-1.5">
          <p className="text-xs font-semibold text-red-800 flex items-center gap-1.5">
            <AlertTriangle size={12} /> This action will replace your current data
          </p>
          <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
            <li>All records created after this backup was made will be lost.</li>
            <li>Uploaded files may be replaced with those from the backup.</li>
            <li>A safety backup of your current data will be created first.</li>
            <li>Only an Administrator should perform a restore.</li>
          </ul>
        </div>

        {/* Safety backup info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-start gap-2">
          <Info size={13} className="text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700">
            A safety backup of your current data will be created automatically before restore begins.
            If the safety backup fails, the restore will be aborted.
          </p>
        </div>

        {/* License preservation option */}
        <div className="border border-[#E2E8F0] rounded-lg p-3 mb-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preserveLicense}
              onChange={e => setPreserveLicense(e.target.checked)}
              className="mt-0.5 accent-[#1E3A5F]"
            />
            <div>
              <p className="text-xs font-semibold text-[#1A202C]">Keep current device license (recommended)</p>
              <p className="text-xs text-[#64748B] mt-0.5">
                Your license.json will not be replaced. Uncheck only if you intentionally want to restore the license from this backup.
              </p>
            </div>
          </label>
        </div>

        {/* Confirm input */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-[#64748B] mb-1.5">
            Type <strong className="text-[#1A202C]">RESTORE</strong> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="RESTORE"
            className="w-full h-9 px-3 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>

        {/* Result message */}
        {message && (
          <div className={`mb-4 p-3 rounded-md text-xs flex items-start gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.type === 'success'
              ? <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
              : <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
            {message.text}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isRestoring}
            className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-md hover:bg-[#F4F6F9] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(preserveLicense)}
            disabled={!canConfirm}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={13} />
            {isRestoring ? 'Restoring…' : 'Restore Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────

interface DeleteModalProps {
  entry: BackupEntry;
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
  error: string | null;
}

function DeleteModal({ entry, onCancel, onConfirm, isDeleting, error }: DeleteModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1A202C]">Delete Backup</h2>
            <p className="text-xs text-[#64748B] mt-0.5 font-mono truncate max-w-xs">{entry.name}</p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-5">
          <p className="text-xs font-semibold text-red-800 flex items-center gap-1.5 mb-1">
            <AlertTriangle size={12} /> This action is permanent
          </p>
          <p className="text-xs text-red-700">
            The backup folder and all its contents (database, uploads, settings) will be permanently deleted.
            This cannot be undone.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer mb-5">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            className="mt-0.5 accent-red-600"
          />
          <p className="text-xs text-[#1A202C]">
            I understand this will permanently delete this backup and it cannot be recovered.
          </p>
        </label>

        {error && (
          <div className="mb-4 p-3 rounded-md text-xs bg-red-50 border border-red-200 text-red-700 flex items-start gap-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-md hover:bg-[#F4F6F9] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || isDeleting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 size={13} />
            {isDeleting ? 'Deleting…' : 'Delete Backup'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Backup Page ───────────────────────────────────────────────────────────────

export default function Backup() {
  const { user } = useAuthStore();

  const currentUserId = user?.id ?? 0;
  // Gating is derived from effective permissions, not from the role name, so a
  // custom role with these permissions gets the same affordances. Presentation
  // only: every command re-checks the caller in Rust.
  const can = usePermissionStore((s) => s.can);
  const canCreate = can('backup.create');
  const canRestore = can('backup.restore');
  const canOperate = canCreate || canRestore;

  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Restore from backup list
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);
  // Restore from import (external folder)
  const [importPath, setImportPath] = useState<string | null>(null);
  const [importValidating, setImportValidating] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Shown persistently after a successful restore (prompts restart)
  const [restoreSuccessful, setRestoreSuccessful] = useState(false);

  // Delete backup
  const [deleteTarget, setDeleteTarget] = useState<BackupEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const showModal = restoreTarget !== null || importPath !== null;

  const loadStatus = async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const s = await getBackupStatus(currentUserId);
      setStatus(s);
    } catch (e) {
      setStatusError(String(e));
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    setCreateMessage(null);
    try {
      await createLocalBackup(currentUserId);
      setCreateMessage({ type: 'success', text: 'Backup created successfully.' });
      await loadStatus();
    } catch (e) {
      setCreateMessage({ type: 'error', text: String(e) });
    } finally {
      setCreating(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await openBackupsFolder(currentUserId);
    } catch (e) {
      setStatusError(String(e));
    }
  };

  const handleRestoreClick = (entry: BackupEntry) => {
    setRestoreTarget(entry);
    setImportPath(null);
    setRestoreMessage(null);
  };

  const handleImportClick = async () => {
    setImportError(null);
    setImportValidating(true);
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Select QMS Backup Folder' });
      if (!selected) { setImportValidating(false); return; }
      const folderPath = Array.isArray(selected) ? selected[0] : selected;
      const canonical = await validateImportBackup(currentUserId, folderPath);
      setImportPath(canonical);
      setRestoreTarget(null);
      setRestoreMessage(null);
    } catch (e) {
      setImportError(String(e));
    } finally {
      setImportValidating(false);
    }
  };

  const handleModalConfirm = async (preserveLicense: boolean) => {
    const path = restoreTarget?.full_path ?? importPath;
    if (!path) return;
    setRestoring(true);
    setRestoreMessage(null);
    try {
      const msg = await restoreLocalBackup(currentUserId, path, preserveLicense);
      setRestoreMessage({ type: 'success', text: msg });
      setRestoreSuccessful(true);
      await loadStatus();
    } catch (e) {
      setRestoreMessage({ type: 'error', text: String(e) });
    } finally {
      setRestoring(false);
    }
  };

  const handleModalCancel = () => {
    if (restoring) return;
    setRestoreTarget(null);
    setImportPath(null);
    setRestoreMessage(null);
  };

  const handleDeleteClick = (entry: BackupEntry) => {
    setDeleteTarget(entry);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBackup(currentUserId, deleteTarget.full_path);
      setDeleteTarget(null);
      await loadStatus();
    } catch (e) {
      setDeleteError(String(e));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  return (
    <div className="p-6 space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardDrive size={20} className="text-[#1E3A5F]" />
          <div>
            <h1 className="text-lg font-bold text-[#1E3A5F]">Backup &amp; Restore</h1>
            <p className="text-xs text-[#64748B]">Local backup of database, uploads, and settings</p>
          </div>
        </div>
        <button
          onClick={loadStatus}
          disabled={loadingStatus}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#1E3A5F] border border-[#E2E8F0] rounded-md hover:bg-[#F4F6F9] transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={loadingStatus ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Restart required banner (shown after successful restore) */}
      {restoreSuccessful && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Restart Required</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Data was restored successfully. Please close and reopen QMS Desktop to load the restored data.
            </p>
          </div>
        </div>
      )}

      {/* Capability notice — names the permission, not a role, since any role
          can be granted it. */}
      {!canOperate && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <Shield size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Read-only access</p>
            <p className="text-xs text-amber-700 mt-0.5">
              You can see the backup history, but creating and restoring backups need
              the “Create backups” and “Restore backups” permissions. Ask an
              administrator to grant them.
            </p>
          </div>
        </div>
      )}

      {/* Status + actions card */}
      {loadingStatus ? (
        <Card>
          <div className="h-24 flex items-center justify-center text-sm text-[#64748B]">
            Loading backup status…
          </div>
        </Card>
      ) : statusError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{statusError}</div>
      ) : status && (
        <Card>
          {/* Status summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-5">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1">Total Backups</p>
              <p className="text-2xl font-bold text-[#1E3A5F]">{status.available_backups.length}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1">Last Backup</p>
              <p className="text-sm font-semibold text-[#1A202C]">
                {status.available_backups.length > 0
                  ? fmtDate(status.available_backups[0].created_at)
                  : 'Never'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1">Database</p>
              <p className="text-sm font-semibold text-[#1A202C]">{fmtSize(status.database_size_bytes)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1">Uploads</p>
              <p className="text-sm font-semibold text-[#1A202C]">{fmtSize(status.uploads_size_bytes)}</p>
            </div>
          </div>

          <div className="text-xs text-[#94A3B8] font-mono mb-5">
            Backup folder: {status.backups_dir}
          </div>

          {/* Action buttons — Admin only */}
          {canOperate && (
            <div className="border-t border-[#E2E8F0] pt-4">
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Actions</p>
              <div className="flex flex-wrap gap-2">
                {canCreate && (
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#1E3A5F] text-white text-sm font-medium rounded-md hover:bg-[#2E5080] transition-colors disabled:opacity-50"
                >
                  <Plus size={14} />
                  {creating ? 'Creating backup…' : 'Create Backup'}
                </button>
                )}

                {canRestore && (
                <button
                  onClick={handleImportClick}
                  disabled={importValidating}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#1E3A5F] border border-[#E2E8F0] rounded-md hover:bg-[#F4F6F9] transition-colors disabled:opacity-50"
                >
                  <Upload size={14} />
                  {importValidating ? 'Validating…' : 'Import Backup File…'}
                </button>
                )}

                <button
                  onClick={handleOpenFolder}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#1E3A5F] border border-[#E2E8F0] rounded-md hover:bg-[#F4F6F9] transition-colors"
                >
                  <FolderOpen size={14} />
                  Open Backup Folder
                </button>
              </div>

              {importError && (
                <div className="mt-3 p-3 rounded-md text-xs bg-red-50 border border-red-200 text-red-700 flex items-start gap-2">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {importError}
                </div>
              )}

              {createMessage && (
                <div className={`mt-3 p-3 rounded-md text-sm flex items-start gap-2 ${
                  createMessage.type === 'success'
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {createMessage.type === 'success'
                    ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                    : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                  {createMessage.text}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* What is backed up — info card */}
      <Card>
        <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Backup Contents</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { name: 'data.db', desc: 'All QMS records (documents, CAPAs, risks, audits, etc.)' },
            { name: 'uploads/', desc: 'All attached files for every module' },
            { name: 'settings.json', desc: 'Company name, prefixes, and app settings' },
            { name: 'license.json', desc: 'Device license token — preserved on restore by default' },
          ].map(item => (
            <div key={item.name} className="flex items-start gap-2">
              <HardDrive size={13} className="text-[#1E3A5F] mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-[#1A202C] font-mono">{item.name}</p>
                <p className="text-xs text-[#64748B]">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Backup history */}
      {status && status.available_backups.length > 0 && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#1A202C]">
              Backup History ({status.available_backups.length})
            </h2>
            <p className="text-xs text-[#94A3B8]">Most recent first</p>
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            {status.available_backups.map(b => (
              <div key={b.name} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <HardDrive size={15} className="text-[#64748B] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1A202C] font-mono truncate">{b.name}</p>
                    <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1">
                      <Clock size={10} />
                      {b.created_at} &nbsp;·&nbsp; {fmtSize(b.size_bytes)}
                    </p>
                  </div>
                </div>
                {canRestore && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRestoreClick(b)}
                      disabled={restoreSuccessful}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={restoreSuccessful ? 'Restart app before restoring again' : 'Restore this backup'}
                    >
                      <RotateCcw size={12} />
                      Restore
                    </button>
                    <button
                      onClick={() => handleDeleteClick(b)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                      title="Delete this backup"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty backup state */}
      {status && status.available_backups.length === 0 && !loadingStatus && (
        <Card>
          <div className="text-center py-8">
            <HardDrive size={32} className="mx-auto text-[#CBD5E1] mb-3" />
            <p className="text-sm font-medium text-[#64748B]">No backups found</p>
            <p className="text-xs text-[#94A3B8] mt-1">
              {canCreate
                ? 'Create your first backup using the button above.'
                : 'No backups have been created yet.'}
            </p>
          </div>
        </Card>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteModal
          entry={deleteTarget}
          onCancel={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          isDeleting={deleting}
          error={deleteError}
        />
      )}

      {/* Restore confirmation modal */}
      {showModal && (
        <RestoreModal
          entry={restoreTarget}
          importPath={importPath}
          onCancel={handleModalCancel}
          onConfirm={handleModalConfirm}
          isRestoring={restoring}
          message={restoreMessage}
        />
      )}
    </div>
  );
}
