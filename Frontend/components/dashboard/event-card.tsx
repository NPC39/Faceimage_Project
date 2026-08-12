import React from 'react';
import Link from 'next/link';
import { Calendar, Tag, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';

export interface EventData {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  eventDate: Date | string;
  pricingType: 'FREE' | 'PAID';
  pricePerPhoto: number; // in satang or integer THB
  currency: string;
  status: 'DRAFT' | 'PROCESSING' | 'PUBLISHED' | 'ARCHIVED';
  createdAt: Date | string;
  updatedAt?: Date | string;
  photoCount?: number;
}

interface EventCardProps {
  event: EventData;
}

export function formatPrice(pricePerPhoto: number, pricingType: 'FREE' | 'PAID', currency = 'THB'): string {
  if (pricingType === 'FREE' || pricePerPhoto === 0) {
    return 'FREE';
  }
  const thbValue = pricePerPhoto >= 100 && pricePerPhoto % 100 === 0 ? pricePerPhoto / 100 : pricePerPhoto;
  const symbol = currency === 'THB' ? '฿' : '$';
  return `${symbol}${thbValue}`;
}

export function formatEventDate(dateInput: Date | string): string {
  const date = new Date(dateInput);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getStatusBadgeVariant(status: EventData['status']) {
  switch (status) {
    case 'PUBLISHED':
      return 'border-emerald-500/30 bg-emerald-950/30 text-emerald-400';
    case 'ARCHIVED':
      return 'border-amber-500/30 bg-amber-950/30 text-amber-400';
    case 'PROCESSING':
      return 'border-blue-500/30 bg-blue-950/30 text-blue-400';
    case 'DRAFT':
    default:
      return 'border-slate-700 bg-slate-800/60 text-slate-300';
  }
}

export function EventCard({ event }: EventCardProps) {
  const formattedDate = formatEventDate(event.eventDate);
  const priceDisplay = formatPrice(event.pricePerPhoto, event.pricingType, event.currency);
  const statusBadgeStyle = getStatusBadgeVariant(event.status);

  return (
    <Card className="bg-slate-900/60 border-slate-800 hover:border-slate-700 transition-all duration-200 flex flex-col justify-between">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="outline" className={`px-2.5 py-0.5 text-xs font-medium ${statusBadgeStyle}`}>
            {event.status}
          </Badge>

          <Badge variant="outline" className="border-indigo-500/30 bg-indigo-950/30 text-indigo-300 px-2.5 py-0.5 text-xs font-semibold">
            {priceDisplay}
          </Badge>
        </div>

        <CardTitle className="text-lg font-semibold text-white tracking-tight line-clamp-1">
          {event.name}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-sm text-slate-400 pb-4">
        {event.description && (
          <p className="line-clamp-2 text-xs text-slate-400/90 leading-relaxed">
            {event.description}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-indigo-400" />
            <span>{formattedDate}</span>
          </div>

          {typeof event.photoCount === 'number' && (
            <span className="text-[11px] text-slate-400 font-medium">
              {event.photoCount} {event.photoCount === 1 ? 'photo' : 'photos'}
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
        <span className="text-[11px] text-slate-500 flex items-center gap-1">
          <Tag className="h-3 w-3 text-slate-600" />
          {event.slug}
        </span>

        <Link
          href={`/dashboard/events/${event.id}`}
          className={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: 'text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/40 gap-1.5 h-8 px-3',
          })}
        >
          <span>Manage</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardFooter>
    </Card>
  );
}
