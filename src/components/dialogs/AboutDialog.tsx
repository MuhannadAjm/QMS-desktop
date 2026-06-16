import { useState, useEffect } from 'react';
import { X, ShieldCheck, User } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { licenseService } from '../../services/licenseService';
import type { LicenseDetails } from '../../types/license';

const APP_VERSION = '1.0.0';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AboutDialog({ open, onClose }: Props) {
  const { user } = useAuthStore();
  const [details, setDetails] = useState<LicenseDetails | null>(null);

  useEffect(() => {
    if (open) {
      licenseService.getLicenseDetails()
        .then(setDetails)
        .catch(() => setDetails(null));
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-[440px] max-w-[calc(100vw-32px)]">

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-[15px] font-semibold text-[#1A202C]">About QMS Desktop</h2>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#1A202C] transition-colors p-1 rounded"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-[#1E3A5F] flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-[22px]">Q</span>
            </div>
            <div>
              <p className="text-[17px] font-semibold text-[#1A202C]">QMS Desktop</p>
              <p className="text-[13px] text-[#64748B]">Quality Management System</p>
              <p className="text-[12px] text-[#94A3B8] mt-0.5">Version {APP_VERSION}</p>
            </div>
          </div>

          <div className="bg-[#F4F6F9] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <ShieldCheck
                size={13}
                strokeWidth={1.75}
                className={details?.is_valid ? 'text-emerald-600' : 'text-[#94A3B8]'}
              />
              <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">License</p>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1.5 text-[13px]">
              <span className="text-[#64748B]">Status</span>
              <span className={`font-medium ${details?.is_valid ? 'text-emerald-600' : 'text-[#94A3B8]'}`}>
                {details?.state_label ?? '—'}
              </span>
              {details?.customer_name && (
                <>
                  <span className="text-[#64748B]">Customer</span>
                  <span className="text-[#1A202C]">{details.customer_name}</span>
                </>
              )}
              {details?.plan && (
                <>
                  <span className="text-[#64748B]">Plan</span>
                  <span className="text-[#1A202C]">{details.plan}</span>
                </>
              )}
              {details?.expires_at ? (
                <>
                  <span className="text-[#64748B]">Expires</span>
                  <span className="text-[#1A202C]">{details.expires_at}</span>
                </>
              ) : details?.is_valid ? (
                <>
                  <span className="text-[#64748B]">Expires</span>
                  <span className="text-[#1A202C]">Never</span>
                </>
              ) : null}
            </div>
          </div>

          {user && (
            <div className="bg-[#F4F6F9] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <User size={13} strokeWidth={1.75} className="text-[#64748B]" />
                <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">Signed In</p>
              </div>
              <p className="text-[13px] font-medium text-[#1A202C]">{user.name}</p>
              <p className="text-[12px] text-[#64748B] mt-0.5">@{user.username} · {user.role}</p>
            </div>
          )}

          <p className="text-[12px] text-[#94A3B8] text-center pt-1">
            © 2026 QMS Desktop. All rights reserved.<br />
            Built with Tauri 2, React, and Rust.
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
