import React from 'react';

interface DashboardHeaderProps {
  heading: string;
  subheading?: string;
  children?: React.ReactNode;
}

export function DashboardHeader({
  heading,
  subheading,
  children,
}: DashboardHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80 mb-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {heading}
        </h1>
        {subheading && (
          <p className="text-slate-400 text-sm mt-1">
            {subheading}
          </p>
        )}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
}
