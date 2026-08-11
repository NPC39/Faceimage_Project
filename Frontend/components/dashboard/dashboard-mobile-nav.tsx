'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { 
  Camera, 
  Menu, 
  X, 
  LayoutDashboard, 
  Calendar, 
  ShoppingBag, 
  Home, 
  LogOut,
  User as UserIcon 
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardMobileNavProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

export function DashboardMobileNav({ user }: DashboardMobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile drawer whenever route changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const navItems = [
    {
      name: 'Overview',
      href: '/dashboard',
      icon: LayoutDashboard,
      exact: true,
    },
    {
      name: 'Events',
      href: '/dashboard/events',
      icon: Calendar,
      exact: false,
    },
    {
      name: 'Orders',
      href: '/dashboard/orders',
      icon: ShoppingBag,
      exact: false,
    },
  ];

  const isNavActive = (href: string, exact: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="md:hidden border-b border-slate-800 bg-slate-950 sticky top-0 z-40">
      {/* Compact Header Bar */}
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 shadow-md">
            <Camera className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-base text-white tracking-tight">
            SnapMarket<span className="text-indigo-400">.AI</span>
          </span>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle navigation menu"
          onClick={() => setIsOpen(!isOpen)}
          className="text-slate-300 hover:text-white"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Slide Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 top-16 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col justify-between border-t border-slate-800 p-6 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Dashboard Navigation
            </p>
            <nav className="space-y-2">
              {navItems.map((item) => {
                const active = isNavActive(item.href, item.exact);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all ${
                      active
                        ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'text-indigo-400' : 'text-slate-400'}`} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-slate-900">
              <Link
                href="/"
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-900 hover:text-white transition-colors"
              >
                <Home className="h-4 w-4 text-slate-400" />
                <span>Back to Home Page</span>
              </Link>
            </div>
          </div>

          {/* Mobile User Profile & Sign Out Footer */}
          <div className="pt-6 border-t border-slate-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-200 font-semibold border border-slate-700">
                {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || <UserIcon className="h-5 w-5" />}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-white truncate">
                  {user?.name || 'Creator'}
                </span>
                <span className="text-xs text-slate-400 truncate">
                  {user?.email || ''}
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              size="default"
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full gap-2 border-slate-800 hover:bg-slate-900 text-rose-400 hover:text-rose-300 justify-center"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
