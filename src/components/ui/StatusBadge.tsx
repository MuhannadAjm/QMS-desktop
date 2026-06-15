type BadgeStatus =
  | 'OPEN'
  | 'CLOSED'
  | 'OVERDUE'
  | 'IN PROGRESS'
  | 'UNDER PROCESS'
  | 'CONTROLLED'
  | 'OBSOLETE'
  | 'ACTIVE'
  | 'INACTIVE';

interface StatusBadgeProps {
  status: BadgeStatus | string;
}

const styleMap: Record<string, { bg: string; text: string; dot: string }> = {
  OPEN:           { bg: 'bg-[#DBEAFE]', text: 'text-[#1D4ED8]', dot: 'bg-[#1D4ED8]' },
  CLOSED:         { bg: 'bg-[#DCFCE7]', text: 'text-[#15803D]', dot: 'bg-[#15803D]' },
  OVERDUE:        { bg: 'bg-[#FEE2E2]', text: 'text-[#DC2626]', dot: 'bg-[#DC2626]' },
  'IN PROGRESS':  { bg: 'bg-[#FEF9C3]', text: 'text-[#92400E]', dot: 'bg-[#92400E]' },
  'UNDER PROCESS':{ bg: 'bg-[#FEF9C3]', text: 'text-[#92400E]', dot: 'bg-[#92400E]' },
  CONTROLLED:     { bg: 'bg-[#DCFCE7]', text: 'text-[#15803D]', dot: 'bg-[#15803D]' },
  OBSOLETE:       { bg: 'bg-[#F1F5F9]', text: 'text-[#94A3B8]', dot: 'bg-[#94A3B8]' },
  ACTIVE:         { bg: 'bg-[#DCFCE7]', text: 'text-[#15803D]', dot: 'bg-[#15803D]' },
  INACTIVE:       { bg: 'bg-[#F1F5F9]', text: 'text-[#94A3B8]', dot: 'bg-[#94A3B8]' },
};

const fallback = { bg: 'bg-[#F1F5F9]', text: 'text-[#64748B]', dot: 'bg-[#64748B]' };

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = styleMap[status] ?? fallback;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${style.bg} ${style.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}
