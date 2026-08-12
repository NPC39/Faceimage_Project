import React from 'react';

export default function PublicEventLoading() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col animate-pulse">
      {/* Header Skeleton */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 py-4 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="h-8 w-32 bg-slate-800 rounded-lg" />
          <div className="h-6 w-24 bg-slate-800 rounded-full" />
        </div>
      </div>

      {/* Main Skeleton */}
      <div className="max-w-5xl w-full mx-auto px-6 py-12 space-y-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 space-y-6">
          <div className="flex gap-3">
            <div className="h-6 w-24 bg-slate-800 rounded-full" />
            <div className="h-6 w-20 bg-slate-800 rounded-full" />
          </div>

          <div className="h-10 w-3/4 bg-slate-800 rounded-xl" />

          <div className="grid grid-cols-2 gap-4 max-w-xl">
            <div className="h-16 bg-slate-950 rounded-xl border border-slate-800" />
            <div className="h-16 bg-slate-950 rounded-xl border border-slate-800" />
          </div>

          <div className="h-20 bg-slate-950 rounded-xl border border-slate-800" />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 h-48" />
      </div>
    </div>
  );
}
