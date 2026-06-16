import { X, RefreshCw } from 'lucide-react';

const APP_VERSION = '1.0.0';
const SUPPORT_EMAIL = 'support@qmsdesktop.com';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CheckForUpdatesDialog({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-[400px] max-w-[calc(100vw-32px)]">

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2.5">
            <RefreshCw size={15} strokeWidth={1.75} className="text-[#1E3A5F]" />
            <h2 className="text-[15px] font-semibold text-[#1A202C]">Check for Updates</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#1A202C] transition-colors p-1 rounded"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="bg-[#F4F6F9] rounded-lg p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#1E3A5F] flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-[15px]">Q</span>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#1A202C]">QMS Desktop</p>
              <p className="text-[12px] text-[#64748B]">Current version: {APP_VERSION}</p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-1.5">
            <p className="text-[13px] text-blue-800 font-medium">
              Automatic updates are not configured for this build.
            </p>
            <p className="text-[13px] text-blue-700">
              To get the latest version, contact support at{' '}
              <span className="font-medium">{SUPPORT_EMAIL}</span>{' '}
              and request the latest installer.
            </p>
          </div>

          <p className="text-[12px] text-[#94A3B8]">
            Always create a backup (File → Create Backup) before installing an update.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1E3A5F] text-white text-[13px] font-medium rounded-md hover:bg-[#2E5080] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
