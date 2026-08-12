'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, Trash2, AlertTriangle, Settings, ShieldAlert } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';

interface EventSettingsPageProps {
  params: {
    id: string;
  };
}

interface EventDetails {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  eventDate: string;
  pricingType: 'FREE' | 'PAID';
  pricePerPhoto: number;
  currency: string;
  status: 'DRAFT' | 'PROCESSING' | 'PUBLISHED' | 'ARCHIVED';
}

export default function EventSettingsPage({ params }: EventSettingsPageProps) {
  const router = useRouter();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [pricingType, setPricingType] = useState<'FREE' | 'PAID'>('FREE');
  const [pricePerPhoto, setPricePerPhoto] = useState<string>('49');
  const [currency, setCurrency] = useState('THB');
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvent() {
      try {
        const response = await fetch(`/api/events/${params.id}`);
        if (!response.ok) {
          router.push('/dashboard/events');
          return;
        }
        const data = await response.json();
        const ev = data.event;
        setEvent(ev);

        setName(ev.name);
        setDescription(ev.description || '');
        const d = new Date(ev.eventDate);
        const formattedDateStr = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
        setEventDate(formattedDateStr);

        setPricingType(ev.pricingType);
        const priceInThb = ev.pricePerPhoto >= 100 && ev.pricePerPhoto % 100 === 0
          ? ev.pricePerPhoto / 100
          : ev.pricePerPhoto;
        setPricePerPhoto(priceInThb.toString());

        setCurrency(ev.currency || 'THB');
        setStatus(ev.status === 'PROCESSING' ? 'DRAFT' : ev.status);
      } catch (err) {
        console.error('Fetch event settings error:', err);
        setErrorMessage('Failed to load event settings.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchEvent();
  }, [params.id, router]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

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

    setIsSaving(true);

    try {
      const response = await fetch(`/api/events/${params.id}`, {
        method: 'PATCH',
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
          status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || 'Failed to update event settings.');
        setIsSaving(false);
        return;
      }

      setSuccessMessage('Event settings updated successfully.');
      setIsSaving(false);
      router.refresh();
    } catch (err) {
      console.error('Update event error:', err);
      setErrorMessage('An unexpected error occurred while saving.');
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setErrorMessage(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/events/${params.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        setErrorMessage(data.error || 'Failed to delete event.');
        setIsDeleting(false);
        return;
      }

      router.push('/dashboard/events');
      router.refresh();
    } catch (err) {
      console.error('Delete event error:', err);
      setErrorMessage('An unexpected error occurred while deleting.');
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Back button & Header */}
      <div>
        <Link
          href={`/dashboard/events/${params.id}`}
          className={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: 'text-xs text-slate-400 hover:text-white mb-3 gap-1.5 px-2 inline-flex',
          })}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Event Overview</span>
        </Link>

        <DashboardHeader
          heading="Event Settings"
          subheading={`Manage settings and status for ${event?.name || 'this event'}.`}
        />
      </div>

      {/* Main Settings Form Card */}
      <Card className="bg-slate-900/80 border-slate-800 text-white shadow-xl">
        <CardHeader className="border-b border-slate-800/80 pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4 text-indigo-400" />
            <span>General Settings</span>
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Stable URL slug: <span className="font-mono text-indigo-300">{event?.slug}</span> (slug is preserved)
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={handleUpdate} className="space-y-6">
            {errorMessage && (
              <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-sm">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-sm">
                {successMessage}
              </div>
            )}

            {/* Event Name */}
            <div className="space-y-2">
              <label htmlFor="name" className="block text-sm font-medium text-slate-200">
                Event Name <span className="text-rose-400">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSaving}
                required
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label htmlFor="description" className="block text-sm font-medium text-slate-200">
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSaving}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
              />
            </div>

            {/* Event Date */}
            <div className="space-y-2">
              <label htmlFor="eventDate" className="block text-sm font-medium text-slate-200">
                Event Date <span className="text-rose-400">*</span>
              </label>
              <input
                id="eventDate"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                disabled={isSaving}
                required
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
              />
            </div>

            {/* Event Status Control */}
            <div className="space-y-2 pt-1">
              <label htmlFor="status" className="block text-sm font-medium text-slate-200">
                Event Status
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED')}
                disabled={isSaving}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
              >
                <option value="DRAFT">DRAFT (Hidden from storefront)</option>
                <option value="PUBLISHED">PUBLISHED (Active)</option>
                <option value="ARCHIVED">ARCHIVED (Closed)</option>
              </select>
              <p className="text-xs text-slate-500 pt-0.5">
                Note: PROCESSING is reserved for automated photo processing in Phase 8.
              </p>
            </div>

            {/* Pricing Model */}
            <div className="space-y-3 pt-2">
              <label className="block text-sm font-medium text-slate-200">
                Pricing Model
              </label>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setPricingType('FREE')}
                  disabled={isSaving}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    pricingType === 'FREE'
                      ? 'bg-indigo-950/40 border-indigo-500 text-white ring-1 ring-indigo-500'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-sm">FREE</div>
                  <div className="text-xs text-slate-400 mt-1">Free downloads</div>
                </button>

                <button
                  type="button"
                  onClick={() => setPricingType('PAID')}
                  disabled={isSaving}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    pricingType === 'PAID'
                      ? 'bg-indigo-950/40 border-indigo-500 text-white ring-1 ring-indigo-500'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-sm">PAID</div>
                  <div className="text-xs text-slate-400 mt-1">Fixed price per photo</div>
                </button>
              </div>
            </div>

            {/* Paid Details */}
            {pricingType === 'PAID' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg bg-slate-950/70 border border-slate-800">
                <div className="space-y-2">
                  <label htmlFor="pricePerPhoto" className="block text-sm font-medium text-slate-200">
                    Price Per Photo
                  </label>
                  <input
                    id="pricePerPhoto"
                    type="number"
                    min="1"
                    step="1"
                    value={pricePerPhoto}
                    onChange={(e) => setPricePerPhoto(e.target.value)}
                    disabled={isSaving}
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
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
                    disabled={isSaving}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex items-center justify-end pt-4 border-t border-slate-800">
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium gap-2 min-w-[140px]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Danger Zone: Delete Event Card */}
      <Card className="bg-rose-950/20 border-rose-900/50 text-white shadow-xl">
        <CardHeader className="border-b border-rose-900/40 pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-rose-400">
            <ShieldAlert className="h-5 w-5 text-rose-400" />
            <span>Danger Zone</span>
          </CardTitle>
          <CardDescription className="text-rose-300/80 text-xs">
            Permanently delete this event and all associated configuration.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6 space-y-4">
          {!showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm text-slate-200">Delete this Event</div>
                <div className="text-xs text-slate-400">Once deleted, this action cannot be undone.</div>
              </div>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                className="bg-rose-600 hover:bg-rose-700 text-white gap-2 font-medium text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Event</span>
              </Button>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-rose-950/60 border border-rose-800 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-sm text-rose-200">Are you absolutely sure?</div>
                  <div className="text-xs text-rose-300/90 leading-relaxed">
                    This will permanently delete <span className="font-bold underline">{event?.name}</span>.
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-rose-900/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Permanently Delete</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
