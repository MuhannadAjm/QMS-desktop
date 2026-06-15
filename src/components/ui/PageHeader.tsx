import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, icon, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-9 h-9 rounded-lg bg-[#EBF2FA] flex items-center justify-center text-[#1E3A5F] shrink-0">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-[20px] font-semibold text-[#1A202C] leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-[13px] text-[#64748B] mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
