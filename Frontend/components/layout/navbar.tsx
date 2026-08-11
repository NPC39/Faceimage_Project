import Link from "next/link";
import { Camera, Sparkles, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 shadow-lg shadow-indigo-500/25 transition-transform group-hover:scale-105">
            <Camera className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg text-white tracking-tight leading-none group-hover:text-indigo-300 transition-colors">
              SnapMarket<span className="text-indigo-400">.AI</span>
            </span>
            <span className="text-[10px] text-slate-400 tracking-wider uppercase font-medium">
              Graduation Project
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2 text-slate-300 hover:text-white">
              <LayoutDashboard className="h-4 w-4 text-indigo-400" />
              <span>Dashboard</span>
            </Button>
          </Link>
          <Link href="/#features">
            <Button variant="ghost" size="sm" className="hidden sm:flex text-slate-300 hover:text-white">
              Features
            </Button>
          </Link>
          <Link href="/#how-it-works">
            <Button variant="ghost" size="sm" className="hidden md:flex text-slate-300 hover:text-white">
              How It Works
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="default" size="sm" className="gap-2">
              <Sparkles className="h-4 w-4" />
              <span>Get Started</span>
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
