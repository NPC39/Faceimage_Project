'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Heart } from "lucide-react";

export function Footer() {
  const pathname = usePathname();

  if (pathname?.startsWith('/dashboard')) {
    return null;
  }

  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 text-slate-400 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Camera className="h-4 w-4" />
            </div>
            <div>
              <span className="text-white font-semibold">SnapMarket.AI</span>
              <p className="text-xs text-slate-500">Face Recognition Photo Marketplace</p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-400">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
            <Link href="/#features" className="hover:text-white transition-colors">Features</Link>
            <span className="text-slate-700">|</span>
            <span className="text-slate-500">University Graduation Project</span>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} Face Recognition Photo Marketplace. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Built with <Heart className="h-3.5 w-3.5 text-pink-500 fill-pink-500" /> for academic demonstration
          </p>
        </div>
      </div>
    </footer>
  );
}
