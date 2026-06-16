import { useState } from 'react';
import { X, Copy, Check, Heart } from 'lucide-react';

const SHARE_MESSAGE =
  "I'm using QMS Desktop for local quality management — documents, CAPA, risks, complaints, audits, and reports. " +
  "It runs fully offline on Windows with no cloud subscription required. " +
  "Worth checking out if you manage ISO 9001 or similar quality processes.";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TellAFriendDialog({ open, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(SHARE_MESSAGE);
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
            <Heart size={15} strokeWidth={1.75} className="text-[#1E3A5F]" />
            <h2 className="text-[15px] font-semibold text-[#1A202C]">Tell a Friend</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#1A202C] transition-colors p-1 rounded"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className="text-[13px] text-[#64748B]">
            Know someone who manages quality? Copy the message below and share it with them.
          </p>

          <div className="bg-[#F4F6F9] rounded-lg p-4 border border-[#E2E8F0]">
            <p className="text-[13px] text-[#374151] leading-relaxed">{SHARE_MESSAGE}</p>
          </div>

          <p className="text-[12px] text-[#94A3B8]">
            No tracking. No internet required. Just copy and share.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E2E8F0] text-[13px] font-medium text-[#374151] rounded-md hover:bg-[#F4F6F9] transition-colors"
          >
            {copied
              ? <Check size={13} className="text-emerald-500" />
              : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy Message'}
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
