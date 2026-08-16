import React from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { 
  Calendar, 
  Sparkles, 
  ImageIcon, 
  ShieldCheck, 
  Lock, 
  User as UserIcon,
  Search,
  Camera
} from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { EventStatus, PhotoProcessingStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatEventDate, formatPrice } from '@/components/dashboard/event-card';
import { SearchMyPhotosSection } from '@/components/public/search-my-photos-section';


interface PublicEventPageProps {
  params: {
    slug: string;
  };
}

export async function generateMetadata({ params }: PublicEventPageProps): Promise<Metadata> {
  const event = await prisma.event.findUnique({
    where: { slug: params.slug },
    select: { name: true, description: true, status: true }
  });

  if (!event || event.status !== EventStatus.PUBLISHED) {
    return {
      title: 'Event Not Found | SnapMarket AI',
      robots: { index: false, follow: false }
    };
  }

  return {
    title: `${event.name} | SnapMarket AI`,
    description: event.description ? event.description.slice(0, 160) : `Search photos from ${event.name} using AI face search.`,
    robots: {
      index: false,
      follow: false
    }
  };
}

export default async function PublicEventPage({ params }: PublicEventPageProps) {
  const event = await prisma.event.findUnique({
    where: {
      slug: params.slug
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      eventDate: true,
      pricingType: true,
      pricePerPhoto: true,
      currency: true,
      status: true,
      creator: {
        select: {
          name: true
        }
      }
    }
  });

  // Strict PUBLISHED-only access control
  if (!event || event.status !== EventStatus.PUBLISHED) {
    notFound();
  }

  // Count only photos that are processed and READY for customer searching
  const readyPhotoCount = await prisma.eventPhoto.count({
    where: {
      eventId: event.id,
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  const formattedDate = formatEventDate(event.eventDate);
  const priceDisplay = formatPrice(event.pricePerPhoto, event.pricingType as 'FREE' | 'PAID', event.currency);
  const isFree = event.pricingType === 'FREE';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white flex flex-col">
      {/* Top Brand Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-500/20">
              ⚡
            </div>
            <span className="font-bold text-lg text-white tracking-tight">SnapMarket AI</span>
          </div>

          <Badge variant="outline" className="border-slate-800 bg-slate-900 text-slate-400 text-xs px-3 py-1 font-medium">
            Public Event Page
          </Badge>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 md:py-12 space-y-8 md:space-y-12">
        {/* Hero Banner Card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 via-slate-900/60 to-slate-950 p-6 sm:p-10 shadow-2xl">
          {/* Subtle Background Glow Accent */}
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            {/* Badges Bar */}
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-950/40 text-emerald-300 text-xs px-3 py-1 font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Published Event
              </Badge>

              <Badge
                variant="outline"
                className={`text-xs px-3 py-1 font-semibold ${
                  isFree
                    ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200'
                    : 'border-indigo-500/40 bg-indigo-950/60 text-indigo-200'
                }`}
              >
                {priceDisplay}
              </Badge>
            </div>

            {/* Event Name */}
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
                {event.name}
              </h1>
              {event.creator?.name && (
                <p className="text-sm text-slate-400 flex items-center gap-1.5 pt-1">
                  <UserIcon className="h-4 w-4 text-indigo-400" />
                  <span>Photos by <strong className="text-slate-200">{event.creator.name}</strong></span>
                </p>
              )}
            </div>

            {/* Event Meta Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 max-w-xl">
              {/* Event Date */}
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <div className="p-2.5 rounded-lg bg-indigo-950/60 text-indigo-400 border border-indigo-900/50">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 font-medium">Event Date</div>
                  <div className="text-sm font-semibold text-white">{formattedDate}</div>
                </div>
              </div>

              {/* Photos Count */}
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <div className="p-2.5 rounded-lg bg-purple-950/60 text-purple-400 border border-purple-900/50">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 font-medium">Searchable Photos</div>
                  <div className="text-sm font-semibold text-white">
                    {readyPhotoCount > 0 ? `${readyPhotoCount} photos available` : 'Photos preparing'}
                  </div>
                </div>
              </div>
            </div>

            {/* Event Description */}
            {event.description && (
              <div className="pt-2 border-t border-slate-800/80">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">About this event</h3>
                <p className="text-sm sm:text-base text-slate-300 whitespace-pre-line leading-relaxed max-w-3xl">
                  {event.description}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Search My Photos Section (Phase 11 & Phase 2 Commerce) */}
        <SearchMyPhotosSection
          eventSlug={event.slug}
          readyPhotoCount={readyPhotoCount}
          pricingType={event.pricingType as 'FREE' | 'PAID'}
          priceDisplay={priceDisplay}
          pricePerPhoto={event.pricePerPhoto}
          currency={event.currency}
        />

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-8 bg-slate-950 mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">SnapMarket AI</span>
            <span>•</span>
            <span>Private Event Photography</span>
          </div>

          <p>© {new Date().getFullYear()} SnapMarket AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
