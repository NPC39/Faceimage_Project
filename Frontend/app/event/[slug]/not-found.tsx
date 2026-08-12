import React from 'react';
import Link from 'next/link';
import { Camera, Lock } from 'lucide-react';

export default function PublicEventNotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-6 bg-slate-900/80 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <div className="h-16 w-16 rounded-2xl bg-indigo-950/80 border border-indigo-800/80 text-indigo-400 flex items-center justify-center mx-auto shadow-lg shadow-indigo-950">
          <Lock className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">Event Unavailable</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            This event page is unavailable or does not exist. Please check the link provided by the event organizer.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors"
          >
            <Camera className="h-4 w-4" />
            <span>Return to Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
