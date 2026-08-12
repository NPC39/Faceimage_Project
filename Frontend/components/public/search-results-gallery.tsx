'use client';

import React from 'react';
import { Sparkles, RefreshCw, Tag, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface SearchResultItem {
  photoId: string;
  rank: number;
}

interface SearchResultsGalleryProps {
  eventSlug: string;
  resultCount: number;
  results: SearchResultItem[];
  pricingType: 'FREE' | 'PAID';
  priceDisplay: string;
  onTryAnotherSelfie: () => void;
}

export function SearchResultsGallery({
  eventSlug,
  resultCount,
  results,
  pricingType,
  priceDisplay,
  onTryAnotherSelfie
}: SearchResultsGalleryProps) {
  if (resultCount === 0 || results.length === 0) {
    return (
      <div className="p-8 sm:p-12 rounded-2xl bg-slate-900/90 border border-slate-800 text-center space-y-5 shadow-xl">
        <div className="h-16 w-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center mx-auto text-slate-400">
          <ImageIcon className="h-8 w-8 text-indigo-400" />
        </div>

        <div className="space-y-2 max-w-md mx-auto">
          <h3 className="text-xl font-bold text-white tracking-tight">No matching photos found</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            We couldn&apos;t find any matching photos of you in this event. Try uploading a clearer, well-lit frontal portrait.
          </p>

        </div>

        <div className="pt-2">
          <Button
            onClick={onTryAnotherSelfie}
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 font-medium px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Try Another Selfie</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Results Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-950/80 border border-indigo-800/80 text-indigo-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              {resultCount} {resultCount === 1 ? 'photo' : 'photos'} found
            </h3>
            <p className="text-xs text-slate-400">
              Ranked by similarity to your selfie
            </p>
          </div>
        </div>

        <Button
          onClick={onTryAnotherSelfie}
          variant="outline"
          className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium gap-2 self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
          <span>Try Another Selfie</span>
        </Button>
      </div>

      {/* Results Photo Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {results.map((item) => {
          const previewUrl = `/api/public/events/${eventSlug}/photos/${item.photoId}/preview`;

          return (
            <div
              key={item.photoId}
              className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 transition-all duration-300 hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10 flex flex-col"
            >
              {/* Image Container */}
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-950">
                <img
                  src={previewUrl}
                  alt={`Matched event photo rank #${item.rank}`}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />

                {/* Rank Badge overlay */}
                <div className="absolute top-3 left-3">
                  <Badge className="bg-slate-950/80 backdrop-blur-md border border-slate-700 text-slate-200 text-xs font-bold px-2.5 py-1">
                    Match #{item.rank}
                  </Badge>
                </div>

                {/* Pricing Badge overlay */}
                <div className="absolute top-3 right-3">
                  <Badge
                    variant="outline"
                    className={`text-xs px-2.5 py-1 font-semibold backdrop-blur-md ${
                      pricingType === 'FREE'
                        ? 'border-emerald-500/40 bg-emerald-950/80 text-emerald-300'
                        : 'border-indigo-500/40 bg-indigo-950/80 text-indigo-300'
                    }`}
                  >
                    {priceDisplay}
                  </Badge>
                </div>
              </div>

              {/* Card Footer Info */}
              <div className="p-4 bg-slate-900 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 mt-auto">
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                  <Tag className="h-3.5 w-3.5 text-indigo-400" />
                  <span>ID: {item.photoId.slice(-8)}</span>
                </div>

                {pricingType === 'PAID' && (
                  <span className="text-[11px] text-indigo-300 font-medium">
                    Purchase options coming next
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
