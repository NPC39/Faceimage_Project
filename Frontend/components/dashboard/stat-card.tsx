import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  iconColor?: string;
  badgeText?: string;
}

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor = 'text-indigo-400',
  badgeText,
}: StatCardProps) {
  return (
    <Card className="bg-slate-900/80 border-slate-800/80 hover:border-slate-700 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-xl bg-slate-800/60 ${iconColor}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-extrabold text-white tracking-tight">{value}</div>
          {badgeText && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              {badgeText}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1.5 font-medium">{description}</p>
      </CardContent>
    </Card>
  );
}
