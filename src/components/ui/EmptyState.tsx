import React from 'react';
import Button from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-xl bg-[#EBF2FA] flex items-center justify-center text-[#1E3A5F] mb-4">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold text-[#1A202C] mb-1.5">{title}</h3>
      <p className="text-[13px] text-[#64748B] max-w-sm leading-relaxed">{description}</p>
      {action && (
        <div className="mt-5">
          <Button variant="primary" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
