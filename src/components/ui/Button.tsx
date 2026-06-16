import React from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-[#1E3A5F] text-white hover:bg-[#2E5080] border border-[#1E3A5F] hover:border-[#2E5080]',
  secondary:
    'bg-white text-[#1A202C] hover:bg-slate-50 border border-[#E2E8F0]',
  ghost:
    'bg-transparent text-[#64748B] hover:bg-slate-100 border border-transparent hover:border-[#E2E8F0]',
  danger:
    'bg-[#DC2626] text-white hover:bg-[#B91C1C] border border-[#DC2626] hover:border-[#B91C1C]',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-[12px]',
  md: 'px-4 py-2 text-[13px]',
  lg: 'px-5 py-2.5 text-[14px]',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  className = '',
  children,
  type = 'button',
  title,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        inline-flex items-center gap-2 rounded-md font-medium
        transition-colors duration-150 cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {children}
    </button>
  );
}
