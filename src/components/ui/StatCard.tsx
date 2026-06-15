import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: 'navy' | 'green' | 'amber' | 'red' | 'gray';
  onClick?: () => void;
  description?: string;
}

const colorMap = {
  navy: {
    iconBg: 'bg-[#EBF2FA]',
    iconText: 'text-[#1E3A5F]',
    value: 'text-[#1E3A5F]',
  },
  green: {
    iconBg: 'bg-[#DCFCE7]',
    iconText: 'text-[#15803D]',
    value: 'text-[#15803D]',
  },
  amber: {
    iconBg: 'bg-[#FEF9C3]',
    iconText: 'text-[#92400E]',
    value: 'text-[#92400E]',
  },
  red: {
    iconBg: 'bg-[#FEE2E2]',
    iconText: 'text-[#DC2626]',
    value: 'text-[#DC2626]',
  },
  gray: {
    iconBg: 'bg-[#F1F5F9]',
    iconText: 'text-[#94A3B8]',
    value: 'text-[#94A3B8]',
  },
};

export default function StatCard({
  label,
  value,
  icon,
  color = 'navy',
  onClick,
  description,
}: StatCardProps) {
  const colors = colorMap[color];

  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-lg border border-[#E2E8F0] shadow-sm p-4
        ${onClick ? 'cursor-pointer hover:shadow-md hover:border-[#C7D7E8] transition-all duration-150' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-[#64748B] uppercase tracking-wide leading-tight">
            {label}
          </p>
          <p className={`text-[28px] font-bold leading-tight mt-1.5 ${colors.value}`}>
            {value}
          </p>
          {description && (
            <p className="text-[11px] text-[#94A3B8] mt-1 truncate">{description}</p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colors.iconBg} ${colors.iconText}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
