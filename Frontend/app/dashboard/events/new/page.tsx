'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';

export default function NewEventPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [pricingType, setPricingType] = useState<'FREE' | 'PAID'>('FREE');
  const [pricePerPhoto, setPricePerPhoto] = useState<string>('49');
  const [currency, setCurrency] = useState('THB');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Event name is required.');
      return;
    }
    if (!eventDate) {
      setErrorMessage('Event date is required.');
      return;
    }

    const priceNum = pricingType === 'PAID' ? parseFloat(pricePerPhoto) : 0;
    if (pricingType === 'PAID' && (isNaN(priceNum) || priceNum <= 0)) {
      setErrorMessage('Price per photo must be a positive number for paid events.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          eventDate,
          pricingType,
          pricePerPhoto: priceNum,
          currency: currency.trim() || 'THB',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || 'Failed to create event.');
        setIsLoading(false);
        return;
      }

      router.push(`/dashboard/events/${data.event.id}`);
      router.refresh();
    } catch (err) {
      console.error('Create event error:', err);
      setErrorMessage('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Back button & Header */}
      <div>
        <Link
          href="/dashboard/events"
          className={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: 'text-xs text-slate-400 hover:text-white mb-3 gap-1.5 px-2 inline-flex',
          })}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Events</span>
        </Link>

        <DashboardHeader
          heading="Create Event"
          subheading="Set up a new photo event to organize and publish your photos."
        />
      </div>

      <Card className="bg-slate-900/80 border-slate-800 text-white shadow-xl">
        <CardHeader className="border-b border-slate-800/80 pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <span>Event Details</span>
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Fill in the information below. A unique shareable URL slug will be generated automatically.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {errorMessage && (
              <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-sm">
                {errorMessage}
              </div>
            )}

            {/* Event Name */}
            <div className="space-y-2">
              <label htmlFor="eventName" className="block text-sm font-medium text-slate-200">
                Event Name <span className="text-rose-400">*</span>
              </label>
              <input
                id="eventName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Chulalongkorn Graduation 2026"
                disabled={isLoading}
                required
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm transition-all"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label htmlFor="eventDescription" className="block text-sm font-medium text-slate-200">
                Description <span className="text-slate-500 text-xs font-normal">(Optional)</span>
              </label>
              <textarea
                id="eventDescription"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide details about the location, schedule, or photographer notes..."
                disabled={isLoading}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm transition-all"
              />
            </div>

            {/* Event Date */}
            <div className="space-y-2">
              <label htmlFor="eventDate" className="block text-sm font-medium text-slate-200">
                Event Date <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="eventDate"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  disabled={isLoading}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm transition-all"
                />
              </div>
            </div>

            {/* Pricing Model */}
            <div className="space-y-3 pt-2">
              <label className="block text-sm font-medium text-slate-200">
                Pricing Model <span className="text-rose-400">*</span>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setPricingType('FREE')}
                  disabled={isLoading}
                  className={`p-4 rounded-lg border text-left flex flex-col justify-between transition-all ${
                    pricingType === 'FREE'
                      ? 'bg-indigo-950/40 border-indigo-500 text-white ring-1 ring-indigo-500'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-sm">FREE</div>
                  <div className="text-xs text-slate-400 mt-1">
                    All event photos can be downloaded free of charge.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPricingType('PAID')}
                  disabled={isLoading}
                  className={`p-4 rounded-lg border text-left flex flex-col justify-between transition-all ${
                    pricingType === 'PAID'
                      ? 'bg-indigo-950/40 border-indigo-500 text-white ring-1 ring-indigo-500'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-sm">PAID</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Customers pay a fixed price per photo.
                  </div>
                </button>
              </div>
            </div>

            {/* Paid Details (Conditional) */}
            {pricingType === 'PAID' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg bg-slate-950/70 border border-slate-800">
                <div className="space-y-2">
                  <label htmlFor="pricePerPhoto" className="block text-sm font-medium text-slate-200">
                    Price Per Photo <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="pricePerPhoto"
                    type="number"
                    min="1"
                    step="1"
                    value={pricePerPhoto}
                    onChange={(e) => setPricePerPhoto(e.target.value)}
                    placeholder="49"
                    disabled={isLoading}
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="currency" className="block text-sm font-medium text-slate-200">
                    Currency
                  </label>
                  <input
                    id="currency"
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    placeholder="THB"
                    disabled={isLoading}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Submit & Cancel Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <Link
                href="/dashboard/events"
                className={buttonVariants({
                  variant: 'outline',
                  className: 'border-slate-700 text-slate-300 hover:bg-slate-800',
                })}
              >
                Cancel
              </Link>

              <Button
                type="submit"
                disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium gap-2 min-w-[130px]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create Event</span>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
