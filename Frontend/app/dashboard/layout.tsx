import React from 'react';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { DashboardMobileNav } from '@/components/dashboard/dashboard-mobile-nav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row text-slate-100">
      {/* Mobile Top Navigation & Drawer */}
      <DashboardMobileNav user={user} />

      {/* Desktop Sidebar Navigation */}
      <div className="hidden md:block">
        <DashboardSidebar user={user} />
      </div>

      {/* Main Content Workspace Area */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
