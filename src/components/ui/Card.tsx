import React from 'react';

interface CardProps {
  className?: string;
  children: React.ReactNode;
  padding?: boolean;
}

export default function Card({ className = '', children, padding = true }: CardProps) {
  return (
    <div
      className={`
        bg-white rounded-lg border border-[#E2E8F0] shadow-sm
        ${padding ? 'p-6' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
