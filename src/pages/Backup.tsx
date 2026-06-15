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
} from 'lucide-react';
import Card from '../components/ui/Card';
import { useAuthStore } from '../stores/authStore';
import {
  getBackupStatus,
  createLocalBackup,
  openBackupsFolder,
  restoreLocalBackup,
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

export default function Backup() {
  const { user } = useAuthStore();
  const role = user?.role ?? 'Viewer';
  const currentUserId = user?.id ?? 0;
  const isAdmin = role === 'Admin';

  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      const msg = await createLocalBackup(currentUserId);
      setCreateMessage({ type: 'success', text: msg });
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
    setRestoreConfirmText('');
    setRestoreMessage(null);
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    setRestoreMessage(null);
    try {
      const msg = await restoreLocalBackup(currentUserId, restoreTarget.full_path);
      setRestoreMessage({ type: 'success', text: msg });
      setRestoreTarget(null);
      setRestoreConfirmText('');
    } catch (e) {
      setRestoreMessage({ type: 'error', text: String(e) });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardDrive size={20} className="text-[#1E3A5F]" />
          <div>
            <h1 className="text-lg font-bold text-[#1E3A5F]">Backup &amp; Restore</h1>
            <p className="text-xs text-gray-500">Local backup of database, uploads, and settings</p>
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

      {/* Admin gate notice */}
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <Shield size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Admin access required</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Creating and restoring backups is restricted to Admin users. Contact your system administrator.
            </p>
          </div>
        </div>
      )}

      {/* Status card */}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1">Backup Folder</p>
              <p className="text-xs text-[#64748B] break-all font-mono">{status.backups_dir}</p>
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-[#E2E8F0]">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1E3A5F] text-white text-sm font-medium rounded-md hover:bg-[#2E5080] transition-colors disabled:opacity-50"
              >
                <Plus size={14} />
                {creating ? 'Creating backup…' : 'Create Backup Now'}
              </button>
              <button
                onClick={handleOpenFolder}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#1E3A5F] border border-[#E2E8F0] rounded-md hover:bg-[#F4F6F9] transition-colors"
              >
                <FolderOpen size={14} />
                Open Folder
              </button>
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
        </Card>
      )}

      {/* Backup list */}
      {status && status.available_backups.length > 0 && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-semibold text-[#1A202C]">
              Available Backups ({status.available_backups.length})
            </h2>
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            {status.available_backups.map(b => (
              <div key={b.name} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <HardDrive size={16} className="text-[#64748B] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1A202C] font-mono truncate">{b.name}</p>
                    <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1">
                      <Clock size={10} />
                      {fmtDate(b.created_at)} &nbsp;·&nbsp; {fmtSize(b.size_bytes)}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleRestoreClick(b)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors shrink-0"
                  >
                    <RotateCcw size={12} />
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {status && status.available_backups.length === 0 && !loadingStatus && (
        <Card>
          <div className="text-center py-6">
            <HardDrive size={32} className="mx-auto text-[#CBD5E1] mb-3" />
            <p className="text-sm font-medium text-[#64748B]">No backups found</p>
            <p className="text-xs text-[#94A3B8] mt-1">
              {isAdmin
                ? 'Create your first backup using the button above.'
                : 'No backups have been created yet.'}
            </p>
          </div>
        </Card>
      )}

      {/* Restore confirmation modal */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1A202C]">Restore Backup</h2>
                <p className="text-xs text-[#64748B] mt-0.5">This will overwrite the current database.</p>
              </div>
            </div>

            <div className="bg-[#FEF2F2] border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700 space-y-1">
              <p><strong>Warning:</strong> All data created after this backup was made will be lost.</p>
              <p>The application must be restarted after restore completes.</p>
              <p className="font-mono text-[11px] mt-1 text-red-600">{restoreTarget.name}</p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-[#64748B] mb-1">
                Type <strong>RESTORE</strong> to confirm
              </label>
              <input
                type="text"
                value={restoreConfirmText}
                onChange={e => setRestoreConfirmText(e.target.value)}
                placeholder="RESTORE"
                className="w-full h-9 px-3 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            {restoreMessage && (
              <div className={`mb-3 p-3 rounded-md text-xs flex items-start gap-2 ${
                restoreMessage.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {restoreMessage.type === 'success'
                  ? <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
                  : <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
                {restoreMessage.text}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setRestoreTarget(null); setRestoreConfirmText(''); setRestoreMessage(null); }}
                disabled={restoring}
                className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-md hover:bg-[#F4F6F9] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRestoreConfirm}
                disabled={restoreConfirmText !== 'RESTORE' || restoring}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-40"
              >
                <RotateCcw size={13} />
                {restoring ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
