import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Calendar, Plus } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { prisma } from '@/lib/prisma';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { EmptyState } from '@/components/dashboard/empty-state';
import { EventCard, EventData } from '@/components/dashboard/event-card';
import { buttonVariants } from '@/components/ui/button';

export default async function EventsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const eventsRaw = await prisma.event.findMany({
    where: {
      creatorId: user.id,
    },
    include: {
      _count: {
        select: { photos: true },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const events: EventData[] = eventsRaw.map((e) => ({
    id: e.id,
    name: e.name,
    slug: e.slug,
    description: e.description,
    eventDate: e.eventDate,
    pricingType: e.pricingType as 'FREE' | 'PAID',
    pricePerPhoto: e.pricePerPhoto,
    currency: e.currency,
    status: e.status as 'DRAFT' | 'PROCESSING' | 'PUBLISHED' | 'ARCHIVED',
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    photoCount: e._count.photos,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <DashboardHeader
        heading="Events"
        subheading="Create and manage your photo events."
      >
        <Link
          href="/dashboard/events/new"
          className={buttonVariants({
            className: 'bg-indigo-600 hover:bg-indigo-500 text-white gap-2 font-medium',
          })}
        >
          <Plus className="h-4 w-4" />
          <span>Create Event</span>
        </Link>
      </DashboardHeader>

      {/* Main Content Area */}
      <div className="pt-2">
        {events.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No events yet"
            description="Create your first photo event to start publishing photos."
            action={{
              label: 'Create your first event',
              href: '/dashboard/events/new',
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
