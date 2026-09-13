'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera } from "lucide-react";

export function Footer() {
  const pathname = usePathname();

  if (pathname?.startsWith('/dashboard')) {
    return null;
  }

  return (
    <footer className="border-t border-zinc-900 bg-zinc-950 text-zinc-500 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-zinc-200 border border-zinc-800">
              <Camera className="h-4 w-4" />
            </div>
            <div>
              <span className="text-zinc-200 font-bold text-sm tracking-tight">SnapMarket</span>
              <p className="text-xs text-zinc-500">Minimal Facial Recognition Photo Discovery</p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs text-zinc-400 font-mono">
            <Link href="/" className="hover:text-zinc-100 transition-colors">Home</Link>
            <Link href="/dashboard" className="hover:text-zinc-100 transition-colors">Dashboard</Link>
            <Link href="/#how-it-works" className="hover:text-zinc-100 transition-colors">How It Works</Link>
            <span className="text-zinc-800">|</span>
            <span className="text-zinc-500">DES400 Senior Project</span>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-600 gap-4">
          <p>© {new Date().getFullYear()} SnapMarket. All rights reserved.</p>
          <p className="font-mono">Phase 1 Verified System</p>
        </div>
      </div>
    </footer>
  );
}

