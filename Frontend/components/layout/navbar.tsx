'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { Camera, LayoutDashboard, LogOut, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';

  if (pathname?.startsWith('/dashboard')) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-950 font-bold transition-transform group-hover:scale-105">
            <Camera className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-base text-zinc-100 tracking-tight leading-none group-hover:text-white transition-colors">
              SnapMarket
            </span>
            <span className="text-[10px] text-zinc-400 tracking-wider uppercase font-medium mt-0.5">
              Photo Discovery
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-3">
          <Link href="/#how-it-works">
            <Button variant="ghost" size="sm" className="hidden sm:flex text-zinc-400 hover:text-zinc-100">
              How It Works
            </Button>
          </Link>
          <Link href="/#photographers">
            <Button variant="ghost" size="sm" className="hidden md:flex text-zinc-400 hover:text-zinc-100">
              For Photographers
            </Button>
          </Link>

          {isAuthenticated ? (
            <>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-2 text-zinc-300 hover:text-white">
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Dashboard</span>
                </Button>
              </Link>
              <div className="hidden lg:flex items-center px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900 text-xs text-zinc-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2" />
                <span className="truncate max-w-[120px] font-medium">{session?.user?.name || session?.user?.email}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="gap-2 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white"
              >
                <LogOut className="h-4 w-4 text-zinc-400" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="gap-1.5 text-zinc-400 hover:text-zinc-100">
                  <LogIn className="h-4 w-4" />
                  <span>Sign In</span>
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="default" size="sm" className="gap-1.5 font-semibold">
                  <UserPlus className="h-4 w-4" />
                  <span>Register</span>
                </Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

