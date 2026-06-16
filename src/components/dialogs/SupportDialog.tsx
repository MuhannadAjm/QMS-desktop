import { useState, useEffect } from 'react';
import { X, Copy, Check, Headphones } from 'lucide-react';
import { licenseService } from '../../services/licenseService';
import type { LicenseDetails } from '../../types/license';

const APP_VERSION = '1.0.0';
const SUPPORT_EMAIL = 'support@qmsdesktop.com';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SupportDialog({ open, onClose }: Props) {
  const [details, setDetails] = useState<LicenseDetails | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      licenseService.getLicenseDetails()
        .then(setDetails)
        .catch(() => setDetails(null));
      setCopied(false);
    }
  }, [open]);

  function buildSupportInfo(): string {
    const lines = [
      'QMS Desktop — Support Information',
      `Version: ${APP_VERSION}`,
      `License Status: ${details?.state_label ?? 'Unknown'}`,
    ];
    if (details?.customer_name) lines.push(`Customer: ${details.customer_name}`);
    if (details?.plan) lines.push(`Plan: ${details.plan}`);
    lines.push(`Support Email: ${SUPPORT_EMAIL}`);
    return lines.join('\n');
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildSupportInfo());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-[440px] max-w-[calc(100vw-32px)]">

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2.5">
            <Headphones size={15} strokeWidth={1.75} className="text-[#1E3A5F]" />
            <h2 className="text-[15px] font-semibold text-[#1A202C]">Support</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#1A202C] transition-colors p-1 rounded"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="bg-[#F4F6F9] rounded-lg p-4 space-y-3">
            <div>
              <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">Support Email</p>
              <p className="text-[14px] font-medium text-[#1E3A5F]">{SUPPORT_EMAIL}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">App Version</p>
              <p className="text-[13px] text-[#1A202C]">{APP_VERSION}</p>
            </div>
            {details && (
              <>
                <div>
                  <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">License Status</p>
                  <p className={`text-[13px] font-medium ${details.is_valid ? 'text-emerald-600' : 'text-[#94A3B8]'}`}>
                    {details.state_label}
                  </p>
                </div>
                {details.customer_name && (
                  <div>
                    <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">Customer</p>
                    <p className="text-[13px] text-[#1A202C]">{details.customer_name}</p>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="text-[13px] text-[#374151]">
            Please include your app version and a screenshot when contacting support.
            Use <strong>Copy Support Info</strong> to copy a summary to your clipboard.
          </p>

          <div className="bg-[#1A202C] rounded-lg p-3">
            <pre className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
              {buildSupportInfo()}
            </pre>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E2E8F0] text-[13px] font-medium text-[#374151] rounded-md hover:bg-[#F4F6F9] transition-colors"
          >
            {copied
              ? <Check size={13} className="text-emerald-500" />
              : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy Support Info'}
          </button>
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
