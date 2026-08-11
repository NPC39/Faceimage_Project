import React from 'react';
import Link from 'next/link';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 ${className}`}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-semibold text-white tracking-tight">{title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mt-1 mb-6 leading-relaxed">
        {description}
      </p>
      {action && (
        action.href ? (
          <Link href={action.href}>
            <Button variant="outline" size="sm" className="border-slate-700 hover:bg-slate-800 text-slate-200">
              {action.label}
            </Button>
          </Link>
        ) : (
          <Button variant="outline" size="sm" onClick={action.onClick} className="border-slate-700 hover:bg-slate-800 text-slate-200">
            {action.label}
          </Button>
        )
      )}
    </div>
  );
}
