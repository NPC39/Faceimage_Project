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
    <aside className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col h-full min-h-screen">
      {/* Brand Header */}
      <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-950 font-bold group-hover:scale-105 transition-transform">
            <Camera className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-base text-zinc-100 tracking-tight leading-none group-hover:text-white transition-colors">
              SnapMarket
            </span>
            <span className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase mt-0.5">
              Creator Hub
            </span>
          </div>
        </Link>
      </div>

      {/* Main Navigation Links */}
      <div className="flex-1 px-3 py-6 space-y-1">
        <p className="px-3 text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-500 mb-2">
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
                  ? 'bg-zinc-900 text-zinc-100 border border-zinc-800 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-4 w-4 ${active ? 'text-zinc-100' : 'text-zinc-400'}`} />
                <span>{item.name}</span>
              </div>
              {active && <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />}
            </Link>
          );
        })}
      </div>

      {/* Public Home Link */}
      <div className="px-3 py-2 border-t border-zinc-900">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
        >
          <Home className="h-4 w-4 text-zinc-400" />
          <span>Back to Home Page</span>
        </Link>
      </div>

      {/* User Account & Logout Footer */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200 border border-zinc-700 font-semibold text-sm">
            {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || <UserIcon className="h-4 w-4" />}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-white truncate">
              {user?.name || 'Creator'}
            </span>
            <span className="text-[11px] text-zinc-500 truncate">
              {user?.email || ''}
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => signOut({ callbackUrl: '/' })}
          className="w-full gap-2 border-zinc-800 hover:bg-zinc-900 text-zinc-400 text-xs justify-center"
        >
          <LogOut className="h-3.5 w-3.5 text-zinc-400" />
          <span>Sign Out</span>
        </Button>
      </div>
    </aside>
  );
}

