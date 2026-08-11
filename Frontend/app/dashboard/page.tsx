import React from 'react';
import { 
  Calendar, 
  ImageIcon, 
  ShoppingBag, 
  DollarSign, 
  UserCheck, 
  Layers,
  Receipt
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Badge } from '@/components/ui/badge';

export default async function DashboardOverviewPage() {
  const user = await getCurrentUser();

  const overviewStats = [
    {
      title: 'Total Events',
      value: '0',
      description: 'Active photo events',
      icon: Calendar,
      iconColor: 'text-indigo-400',
    },
    {
      title: 'Total Photos',
      value: '0',
      description: 'Total uploaded photos',
      icon: ImageIcon,
      iconColor: 'text-purple-400',
    },
    {
      title: 'Total Orders',
      value: '0',
      description: 'Completed photo sales',
      icon: ShoppingBag,
      iconColor: 'text-pink-400',
    },
    {
      title: 'Revenue',
      value: '฿0',
      description: 'Earned photo earnings',
      icon: DollarSign,
      iconColor: 'text-emerald-400',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header & Welcome */}
      <DashboardHeader
        heading={`Welcome back, ${user?.name || 'User'}`}
        subheading="Manage your photo events and sales from one place."
      >
        <Badge variant="outline" className="gap-2 border-emerald-500/30 bg-emerald-950/20 text-emerald-400 px-3 py-1 text-xs">
          <UserCheck className="h-3.5 w-3.5" />
          <span>Signed in as {user?.email}</span>
        </Badge>
      </DashboardHeader>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {overviewStats.map((stat) => (
          <StatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            description={stat.description}
            icon={stat.icon}
            iconColor={stat.iconColor}
          />
        ))}
      </div>

      {/* Overview Sections Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
        {/* Your Photo Events Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-400" />
              <span>Your Photo Events</span>
            </h2>
          </div>

          <EmptyState
            icon={Calendar}
            title="No events yet"
            description="Your events will appear here once you create your first photo event."
            action={{
              label: 'View Events',
              href: '/dashboard/events',
            }}
          />
        </div>

        {/* Recent Orders Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Receipt className="h-5 w-5 text-pink-400" />
              <span>Recent Orders</span>
            </h2>
          </div>

          <EmptyState
            icon={ShoppingBag}
            title="No orders yet"
            description="Customer orders will appear here once your paid events receive purchases."
            action={{
              label: 'View Orders',
              href: '/dashboard/orders',
            }}
          />
        </div>
      </div>
    </div>
  );
}
