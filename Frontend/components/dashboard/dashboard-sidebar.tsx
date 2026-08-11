'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { 
  LayoutDashboard, 
  Calendar, 
  ShoppingBag, 
  LogOut, 
  Home, 
  Camera,
  User as UserIcon,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname();

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
    <aside className="w-64 shrink-0 border-r border-slate-800/80 bg-slate-950 flex flex-col h-full min-h-screen">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            <Camera className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base text-white tracking-tight leading-none group-hover:text-indigo-300 transition-colors">
              SnapMarket<span className="text-indigo-400">.AI</span>
            </span>
            <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase mt-0.5">
              Creator Hub
            </span>
          </div>
        </Link>
      </div>

      {/* Main Navigation Links */}
      <div className="flex-1 px-3 py-6 space-y-1">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Menu
        </p>
        {navItems.map((item) => {
          const active = isNavActive(item.href, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-4 w-4 ${active ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </div>
              {active && <ChevronRight className="h-3.5 w-3.5 text-indigo-400/70" />}
            </Link>
          );
        })}
      </div>

      {/* Public Home Link */}
      <div className="px-3 py-2 border-t border-slate-900">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-900/60 transition-colors"
        >
          <Home className="h-4 w-4 text-slate-400" />
          <span>Back to Home Page</span>
        </Link>
      </div>

      {/* User Account & Logout Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300 border border-slate-700 font-semibold text-sm">
            {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || <UserIcon className="h-4 w-4" />}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-white truncate">
              {user?.name || 'Creator'}
            </span>
            <span className="text-[11px] text-slate-400 truncate">
              {user?.email || ''}
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => signOut({ callbackUrl: '/' })}
          className="w-full gap-2 border-slate-800 hover:bg-slate-900 hover:text-rose-400 text-slate-300 text-xs justify-center"
        >
          <LogOut className="h-3.5 w-3.5 text-rose-400" />
          <span>Sign Out</span>
        </Button>
      </div>
    </aside>
  );
}
