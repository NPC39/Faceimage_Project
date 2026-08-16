'use client';

import React, { useState } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  Tag, 
  Image as ImageIcon, 
  CheckCircle2, 
  Circle, 
  ShoppingBag, 
  X, 
  Check, 
  Loader2, 
  ShieldCheck, 
  AlertCircle 
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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
  pricePerPhoto: number; // Integer minor currency units (satang or minor unit)
  currency: string;
  onTryAnotherSelfie: () => void;
}

interface OrderResponseData {
  id: string;
  eventId: string;
  eventSlug: string;
  eventName: string;
  status: string;
  subtotal: number;
  total: number;
  currency: string;
  quantity: number;
  createdAt: string;
  items: Array<{
    id: string;
    photoId: string;
    unitPrice: number;
  }>;
}

export function SearchResultsGallery({
  eventSlug,
  resultCount,
  results,
  pricingType,
  priceDisplay,
  pricePerPhoto,
  currency,
  onTryAnotherSelfie
}: SearchResultsGalleryProps) {
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<OrderResponseData | null>(null);

  const toggleSelectPhoto = (photoId: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const selectAllPhotos = () => {
    const allIds = results.map((r) => r.photoId);
    setSelectedPhotoIds(new Set(allIds));
  };

  const clearSelection = () => {
    setSelectedPhotoIds(new Set());
  };

  // Format currency display helper
  const formatAmount = (minorUnits: number, curr: string = 'THB') => {
    if (minorUnits === 0 || pricingType === 'FREE') return 'FREE';
    const majorUnits = minorUnits >= 100 && minorUnits % 100 === 0 ? minorUnits / 100 : minorUnits;
    return `${majorUnits.toLocaleString('en-US', { minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2 })} ${curr}`;
  };

  const selectedCount = selectedPhotoIds.size;
  const unitPriceAmount = pricingType === 'FREE' ? 0 : pricePerPhoto;
  const estimatedTotal = selectedCount * unitPriceAmount;

  const handleCreatePendingOrder = async () => {
    if (selectedCount === 0) return;
    setIsCreatingOrder(true);
    setOrderError(null);

    try {
      const res = await fetch(`/api/public/events/${eventSlug}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoIds: Array.from(selectedPhotoIds)
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to create order.');
      }

      setCreatedOrder(data.order);
      setIsReviewOpen(false);
    } catch (err: any) {
      setOrderError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsCreatingOrder(false);
    }
  };

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
    <div className="space-y-6 relative">
      {/* Results Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-950/80 border border-indigo-800/80 text-indigo-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              {resultCount} {resultCount === 1 ? 'photo' : 'photos'} found
            </h3>
            <p className="text-xs text-slate-400">
              Select photos to review or purchase
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <Button
              onClick={clearSelection}
              variant="ghost"
              size="sm"
              className="text-xs text-slate-400 hover:text-white"
            >
              Deselect All
            </Button>
          )}

          <Button
            onClick={selectAllPhotos}
            variant="outline"
            size="sm"
            className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium"
          >
            Select All ({results.length})
          </Button>

          <Button
            onClick={onTryAnotherSelfie}
            variant="outline"
            size="sm"
            className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
            <span>New Search</span>
          </Button>
        </div>
      </div>

      {/* Results Photo Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-24">
        {results.map((item) => {
          const isSelected = selectedPhotoIds.has(item.photoId);
          const previewUrl = `/api/public/events/${eventSlug}/photos/${item.photoId}/preview`;

          return (
            <div
              key={item.photoId}
              onClick={() => toggleSelectPhoto(item.photoId)}
              className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-950/20 shadow-xl shadow-indigo-500/20 ring-2 ring-indigo-500/50'
                  : 'border-slate-800 bg-slate-900/80 hover:border-slate-700 hover:shadow-xl'
              }`}
            >
              {/* Image Container */}
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-950">
                <img
                  src={previewUrl}
                  alt={`Matched event photo rank #${item.rank}`}
                  className={`h-full w-full object-cover transition-transform duration-500 ${
                    isSelected ? 'scale-105 opacity-90' : 'group-hover:scale-105'
                  }`}
                  loading="lazy"
                />

                {/* Selection Checkmark Button Overlay */}
                <div className="absolute top-3 right-3 z-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelectPhoto(item.photoId);
                    }}
                    className={`h-8 w-8 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                      isSelected
                        ? 'bg-indigo-600 text-white scale-110 shadow-indigo-600/50'
                        : 'bg-slate-950/70 border border-slate-700 text-slate-300 hover:bg-slate-900 hover:text-white backdrop-blur-md'
                    }`}
                  >
                    {isSelected ? <Check className="h-4 w-4 stroke-[3]" /> : <Circle className="h-4 w-4" />}
                  </button>
                </div>

                {/* Rank Badge overlay */}
                <div className="absolute top-3 left-3">
                  <Badge className="bg-slate-950/80 backdrop-blur-md border border-slate-700 text-slate-200 text-xs font-bold px-2.5 py-1">
                    Match #{item.rank}
                  </Badge>
                </div>
              </div>

              {/* Card Footer Info */}
              <div className="p-4 bg-slate-900 border-t border-slate-800/80 flex items-center justify-between text-xs mt-auto">
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                  <Tag className="h-3.5 w-3.5 text-indigo-400" />
                  <span>ID: {item.photoId.slice(-8)}</span>
                </div>

                <Badge
                  variant="outline"
                  className={`text-xs px-2.5 py-0.5 font-semibold ${
                    pricingType === 'FREE'
                      ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
                      : 'border-indigo-500/40 bg-indigo-950/60 text-indigo-300'
                  }`}
                >
                  {priceDisplay}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Sticky Bottom Bar for Selected Photos */}
      {selectedCount > 0 && !createdOrder && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4">
          <div className="p-4 rounded-2xl bg-slate-900/95 border border-indigo-500/50 backdrop-blur-xl shadow-2xl flex items-center justify-between gap-4 ring-1 ring-indigo-500/20">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-indigo-600/30">
                {selectedCount}
              </div>
              <div>
                <div className="text-sm font-bold text-white">
                  {selectedCount} {selectedCount === 1 ? 'photo' : 'photos'} selected
                </div>
                <div className="text-xs text-indigo-300 font-semibold">
                  Est. Total: {formatAmount(estimatedTotal, currency)}
                </div>
              </div>
            </div>

            <Button
              onClick={() => setIsReviewOpen(true)}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 gap-2"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Review Order</span>
            </Button>
          </div>
        </div>
      )}

      {/* Review Selection Modal */}
      {isReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-6 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-900">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Review Selection</h3>
                  <p className="text-xs text-slate-400">{selectedCount} photos chosen</p>
                </div>
              </div>

              <Button
                onClick={() => setIsReviewOpen(false)}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Selected Photos List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-60">
              {Array.from(selectedPhotoIds).map((photoId) => {
                const previewUrl = `/api/public/events/${eventSlug}/photos/${photoId}/preview`;
                return (
                  <div
                    key={photoId}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={previewUrl}
                        alt="Selected thumbnail"
                        className="h-12 w-12 rounded-lg object-cover bg-slate-900 border border-slate-800"
                      />
                      <div className="text-xs font-mono text-slate-300">
                        ID: {photoId.slice(-8)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-indigo-300">
                        {priceDisplay}
                      </span>
                      <Button
                        onClick={() => toggleSelectPhoto(photoId)}
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Price Breakdown */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Quantity</span>
                <span className="font-semibold text-slate-200">{selectedCount}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Price per Photo</span>
                <span className="font-semibold text-slate-200">{priceDisplay}</span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-bold text-white">
                <span>Total Amount</span>
                <span className="text-indigo-400">{formatAmount(estimatedTotal, currency)}</span>
              </div>
            </div>

            {orderError && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-900 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{orderError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={() => setIsReviewOpen(false)}
                variant="outline"
                className="flex-1 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium py-2.5"
              >
                Continue Selecting
              </Button>

              <Button
                onClick={handleCreatePendingOrder}
                disabled={isCreatingOrder || selectedCount === 0}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2.5 gap-2 shadow-lg shadow-indigo-600/20"
              >
                {isCreatingOrder ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Creating Order...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Create Pending Order</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Order Created Success View */}
      {createdOrder && (
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-2xl space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-emerald-950 text-emerald-400 border border-emerald-800">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-950/60 text-emerald-300 text-xs px-2.5 py-0.5 font-semibold">
                Status: {createdOrder.status}
              </Badge>
              <h3 className="text-xl font-bold text-white">Pending Order Created</h3>
              <p className="text-xs text-slate-400 font-mono">Order ID: {createdOrder.id}</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
            <div className="flex justify-between text-slate-300">
              <span>Event</span>
              <span className="font-semibold text-white">{createdOrder.eventName}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Photos Selected</span>
              <span className="font-semibold text-white">{createdOrder.quantity}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Authoritative Total</span>
              <span className="font-bold text-indigo-400 text-sm">
                {formatAmount(createdOrder.total, createdOrder.currency)}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-900/60 text-indigo-300 text-xs flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-indigo-400 shrink-0" />
            <span>
              Payment gateway integration coming in next phase. Your selection of {createdOrder.quantity} photos has been saved safely with ID: <strong className="font-mono text-white">{createdOrder.id}</strong>.
            </span>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => {
                setCreatedOrder(null);
                setSelectedPhotoIds(new Set());
              }}
              variant="outline"
              className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium"
            >
              Done / Start New Search
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
