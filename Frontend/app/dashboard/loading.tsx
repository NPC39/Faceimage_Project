import React from 'react';

export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="pb-6 border-b border-slate-800/80 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-slate-800/80 rounded-xl" />
          <div className="h-4 w-96 bg-slate-800/50 rounded-lg" />
        </div>
        <div className="h-6 w-48 bg-slate-800/60 rounded-full" />
      </div>

      {/* Metric Cards Skeleton Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 space-y-3"
          >
            <div className="flex justify-between items-center">
              <div className="h-3 w-24 bg-slate-800/80 rounded" />
              <div className="h-7 w-7 bg-slate-800 rounded-lg" />
            </div>
            <div className="h-8 w-20 bg-slate-800/90 rounded-lg" />
            <div className="h-3 w-32 bg-slate-800/50 rounded" />
          </div>
        ))}
      </div>

      {/* Main Content Areas Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
        <div className="h-64 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6" />
        <div className="h-64 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6" />
      </div>
    </div>
  );
}
