import { X, BookOpen, ShieldCheck, Database, HelpCircle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MODULES = [
  { name: 'Dashboard',         desc: 'Overview of open items, overdue CAPAs, high risks, and recent activity.' },
  { name: 'CAPA',              desc: 'Corrective and Preventive Actions — create, assign, track, and close.' },
  { name: 'Risks',             desc: 'Risk register — assess likelihood and impact; link to CAPAs and NCs.' },
  { name: 'Complaints',        desc: 'Customer and internal complaints — track investigation and resolution.' },
  { name: 'Audits',            desc: 'Internal audit scheduling, findings, and closure tracking.' },
  { name: 'Non-Conformities',  desc: 'Track non-conforming products and processes; link to CAPAs.' },
  { name: 'Documents',         desc: 'Document register — revisions, status workflow, file attachments.' },
  { name: 'Users',             desc: 'Manage user accounts, roles, and access (Admin only).' },
  { name: 'Reports',           desc: 'Generate, print, and export reports for all quality modules.' },
  { name: 'Backup',            desc: 'Create, restore, and import local data backups (Admin only).' },
];

const STEPS = [
  'Log in with your username and password.',
  'Go to Settings (Tools → Settings) to set your company name and document prefixes.',
  'Create your first Document, CAPA, Risk, or Complaint using the sidebar.',
  'Use the Reports module to generate and export quality reports.',
  'Create regular backups via File → Create Backup before major sessions.',
];

export default function HelpDialog({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-[560px] max-w-[calc(100vw-32px)] max-h-[82vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0] shrink-0">
          <div className="flex items-center gap-2.5">
            <HelpCircle size={15} strokeWidth={1.75} className="text-[#1E3A5F]" />
            <h2 className="text-[15px] font-semibold text-[#1A202C]">Help — QMS Desktop</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#1A202C] transition-colors p-1 rounded"
          >
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">

          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={13} strokeWidth={1.75} className="text-[#1E3A5F]" />
              <p className="text-[13px] font-semibold text-[#1A202C]">Getting Started</p>
            </div>
            <ol className="space-y-2">
              {STEPS.map((step, i) => (
                <li key={i} className="flex gap-3 text-[13px] text-[#374151]">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[#EBF2FA] text-[#1E3A5F] text-[11px] font-semibold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={13} strokeWidth={1.75} className="text-[#1E3A5F]" />
              <p className="text-[13px] font-semibold text-[#1A202C]">Modules Overview</p>
            </div>
            <div className="space-y-2">
              {MODULES.map((m) => (
                <div key={m.name} className="flex gap-3 text-[13px]">
                  <span className="shrink-0 font-medium text-[#1A202C] w-36">{m.name}</span>
                  <span className="text-[#64748B]">{m.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Database size={13} strokeWidth={1.75} className="text-amber-600" />
              <p className="text-[12px] font-semibold text-amber-700 uppercase tracking-wide">Backup Reminder</p>
            </div>
            <p className="text-[13px] text-amber-800">
              Create regular backups (File → Create Backup) before software updates, after major data
              entry sessions, and before restoring from a previous backup. Backups are stored locally
              — no cloud upload occurs.
            </p>
          </div>

          <div className="bg-[#F4F6F9] rounded-lg p-4">
            <p className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide mb-1.5">Support</p>
            <p className="text-[13px] text-[#374151]">
              Contact:{' '}
              <span className="font-medium text-[#1E3A5F]">support@qmsdesktop.com</span>
            </p>
            <p className="text-[12px] text-[#64748B] mt-1">
              Please include your app version and a screenshot when reporting an issue.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end shrink-0">
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
