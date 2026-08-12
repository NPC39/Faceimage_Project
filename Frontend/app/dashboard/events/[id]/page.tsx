import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { 
  Calendar, 
  Tag, 
  Settings, 
  ArrowLeft, 
  Link as LinkIcon, 
  Sparkles,
  ImageIcon,
  ShieldCheck
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { prisma } from '@/lib/prisma';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { formatEventDate, formatPrice, getStatusBadgeVariant } from '@/components/dashboard/event-card';

interface EventDetailPageProps {
  params: {
    id: string;
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const event = await prisma.event.findFirst({
    where: {
      id: params.id,
      creatorId: user.id,
    },
  });

  if (!event) {
    notFound();
  }

  const photoCount = await prisma.eventPhoto.count({
    where: { eventId: event.id },
  });

  const formattedDate = formatEventDate(event.eventDate);
  const formattedCreated = formatEventDate(event.createdAt);
  const priceDisplay = formatPrice(event.pricePerPhoto, event.pricingType as 'FREE' | 'PAID', event.currency);
  const statusBadgeStyle = getStatusBadgeVariant(event.status as any);
  const publicPath = `/event/${event.slug}`;

  return (
    <div className="space-y-8">
      {/* Navigation & Header */}
      <div className="space-y-3">
        <Link
          href="/dashboard/events"
          className={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: 'text-xs text-slate-400 hover:text-white px-2 gap-1.5 inline-flex',
          })}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Events</span>
        </Link>

        <DashboardHeader
          heading={event.name}
          subheading={`Created on ${formattedCreated} • Share slug: ${event.slug}`}
        >
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/events/${event.id}/photos`}
              className={buttonVariants({
                size: 'sm',
                className: 'bg-indigo-600 hover:bg-indigo-500 text-white gap-2 text-xs font-medium',
              })}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span>Manage Photos ({photoCount})</span>
            </Link>

            <Link
              href={`/dashboard/events/${event.id}/settings`}
              className={buttonVariants({
                variant: 'outline',
                size: 'sm',
                className: 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 gap-2 text-xs font-medium',
              })}
            >
              <Settings className="h-3.5 w-3.5 text-indigo-400" />
              <span>Edit Settings</span>
            </Link>
          </div>
        </DashboardHeader>
      </div>

      {/* Main Event Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Key Event Details (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-slate-900/80 border-slate-800 text-white">
            <CardHeader className="border-b border-slate-800/80 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                  <span>Overview & Metadata</span>
                </CardTitle>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`px-2.5 py-0.5 text-xs font-medium ${statusBadgeStyle}`}>
                    {event.status}
                  </Badge>
                  <Badge variant="outline" className="border-indigo-500/30 bg-indigo-950/30 text-indigo-300 px-2.5 py-0.5 text-xs font-semibold">
                    {priceDisplay}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-5">
              {/* Event Description */}
              <div className="space-y-1.5">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Description</span>
                <p className="text-sm text-slate-300 leading-relaxed bg-slate-950/50 p-3.5 rounded-lg border border-slate-800/60">
                  {event.description || 'No description provided for this event.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Event Date */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
                  <div className="p-2.5 rounded-md bg-indigo-950/50 text-indigo-400">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Event Date</div>
                    <div className="text-sm font-medium text-white">{formattedDate}</div>
                  </div>
                </div>

                {/* Slug / Public URL */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
                  <div className="p-2.5 rounded-md bg-purple-950/50 text-purple-400">
                    <Tag className="h-4 w-4" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-xs text-slate-400">Public URL Slug</div>
                    <div className="text-sm font-medium text-white truncate">{event.slug}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Photo Management Section */}
          <Card className="bg-slate-900/80 border-slate-800 text-white">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2 text-white">
                    <ImageIcon className="h-4 w-4 text-purple-400" />
                    <span>Photos & Gallery</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Manage uploaded photos for this event.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-purple-500/30 bg-purple-950/30 text-purple-300 text-xs px-2.5 py-0.5 font-semibold">
                  {photoCount} {photoCount === 1 ? 'Photo' : 'Photos'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="p-6 rounded-lg bg-slate-950/60 border border-slate-800 text-center space-y-3">
                <ImageIcon className="h-8 w-8 text-indigo-400 mx-auto" />
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">
                    {photoCount === 0 ? 'No photos uploaded yet' : `${photoCount} photos uploaded`}
                  </div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Upload, organize, retry, and view high-resolution event photos.
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    href={`/dashboard/events/${event.id}/photos`}
                    className={buttonVariants({
                      size: 'sm',
                      className: 'bg-indigo-600 hover:bg-indigo-500 text-white gap-2 text-xs font-medium',
                    })}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>Manage Photos</span>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Info (1 col) */}
        <div className="space-y-6">
          {/* Public Access Link Card */}
          <Card className="bg-slate-900/80 border-slate-800 text-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-emerald-400" />
                <span>Public Share Link</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="p-2.5 rounded bg-slate-950 font-mono text-indigo-300 text-xs truncate border border-slate-800">
                {publicPath}
              </div>
              
              {event.status === 'PUBLISHED' ? (
                <div className="space-y-2 pt-1">
                  <Link
                    href={publicPath}
                    target="_blank"
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                      className: 'w-full border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 gap-2 text-xs font-semibold',
                    })}
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                    <span>View Public Page</span>
                  </Link>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Share this link with event attendees to let them find their photos using AI face search.
                  </p>
                </div>
              ) : (
                <div className="p-2.5 rounded bg-amber-950/40 border border-amber-800/40 text-amber-300 text-[11px] leading-relaxed space-y-1">
                  <div className="font-semibold">Event Not Published</div>
                  <p className="text-amber-400/90 text-[10px]">
                    This event must be published in settings before customers can access the public link.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>


          {/* System & Ownership Info */}
          <Card className="bg-slate-900/80 border-slate-800 text-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-400" />
                <span>Ownership & Security</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-slate-400">
              <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                <span>Owner ID</span>
                <span className="font-mono text-slate-300 text-[11px]">{user.id.slice(0, 10)}...</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                <span>Event ID</span>
                <span className="font-mono text-slate-300 text-[11px]">{event.id.slice(0, 10)}...</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span>Created</span>
                <span className="text-slate-300 text-[11px]">{formattedCreated}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
