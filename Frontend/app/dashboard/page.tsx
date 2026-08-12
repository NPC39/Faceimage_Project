import React from 'react';
import Link from 'next/link';
import { 
  Calendar, 
  ImageIcon, 
  ShoppingBag, 
  DollarSign, 
  UserCheck, 
  Layers,
  Receipt,
  Plus,
  ArrowRight
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { prisma } from '@/lib/prisma';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { formatEventDate, formatPrice, getStatusBadgeVariant } from '@/components/dashboard/event-card';

export default async function DashboardOverviewPage() {
  const user = await getCurrentUser();

  const totalEventsCount = user
    ? await prisma.event.count({
        where: { creatorId: user.id },
      })
    : 0;

  const totalPhotosCount = user
    ? await prisma.eventPhoto.count({
        where: { event: { creatorId: user.id } },
      })
    : 0;

  const recentEvents = user
    ? await prisma.event.findMany({
        where: { creatorId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })
    : [];

  const overviewStats = [
    {
      title: 'Total Events',
      value: totalEventsCount.toString(),
      description: 'Active photo events',
      icon: Calendar,
      iconColor: 'text-indigo-400',
    },
    {
      title: 'Total Photos',
      value: totalPhotosCount.toString(),
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
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-2 border-emerald-500/30 bg-emerald-950/20 text-emerald-400 px-3 py-1 text-xs">
            <UserCheck className="h-3.5 w-3.5" />
            <span>Signed in as {user?.email}</span>
          </Badge>

          <Link
            href="/dashboard/events/new"
            className={buttonVariants({
              size: 'sm',
              className: 'bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 text-xs font-medium',
            })}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Event</span>
          </Link>
        </div>
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
        {/* Your Photo Events Section (Real Data) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-400" />
              <span>Your Photo Events</span>
            </h2>

            {recentEvents.length > 0 && (
              <Link
                href="/dashboard/events"
                className={buttonVariants({
                  variant: 'ghost',
                  size: 'sm',
                  className: 'text-xs text-indigo-400 hover:text-indigo-300 gap-1 px-2',
                })}
              >
                <span>View All ({totalEventsCount})</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {recentEvents.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No events yet"
              description="Your events will appear here once you create your first photo event."
              action={{
                label: 'Create your first event',
                href: '/dashboard/events/new',
              }}
            />
          ) : (
            <div className="space-y-3">
              {recentEvents.map((ev) => {
                const formattedDate = formatEventDate(ev.eventDate);
                const priceDisplay = formatPrice(ev.pricePerPhoto, ev.pricingType as 'FREE' | 'PAID', ev.currency);
                const statusBadgeStyle = getStatusBadgeVariant(ev.status as any);

                return (
                  <div
                    key={ev.id}
                    className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/events/${ev.id}`}
                          className="font-semibold text-sm text-white hover:text-indigo-400 transition-colors truncate block"
                        >
                          {ev.name}
                        </Link>
                        <Badge variant="outline" className={`px-2 py-0 text-[10px] ${statusBadgeStyle}`}>
                          {ev.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-indigo-400" />
                          {formattedDate}
                        </span>
                        <span>•</span>
                        <span className="font-mono text-slate-300">{ev.slug}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="outline" className="border-indigo-500/30 bg-indigo-950/30 text-indigo-300 text-xs px-2.5 py-0.5 font-semibold">
                        {priceDisplay}
                      </Badge>

                      <Link
                        href={`/dashboard/events/${ev.id}`}
                        className={buttonVariants({
                          variant: 'ghost',
                          size: 'sm',
                          className: 'h-8 w-8 p-0 text-slate-400 hover:text-white',
                        })}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Orders Section (Preserved Phase 4 Foundation) */}
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
