'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Camera, 
  Sparkles, 
  ShieldCheck, 
  X, 
  Search, 
  Loader2, 
  AlertCircle,
  Lock,
  ImageIcon
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SearchResultsGallery } from './search-results-gallery';

interface SearchMyPhotosSectionProps {
  eventSlug: string;
  readyPhotoCount: number;
  pricingType: 'FREE' | 'PAID';
  priceDisplay: string;
  pricePerPhoto: number;
  currency: string;
}

interface SearchResultItem {
  photoId: string;
  rank: number;
}

interface SearchResponseData {
  event: {
    slug: string;
  };
  resultCount: number;
  results: SearchResultItem[];
}

export function SearchMyPhotosSection({
  eventSlug,
  readyPhotoCount,
  pricingType,
  priceDisplay,
  pricePerPhoto,
  currency
}: SearchMyPhotosSectionProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResponseData | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Revoke object URL on unmount or preview change to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [previewUrl]);

  const handleFileSelect = (file: File | null) => {
    setErrorMessage(null);
    setSearchResults(null);

    if (!file) {
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setErrorMessage('Please select a valid JPEG, PNG, or WebP image format.');
      return;
    }

    const maxBytes = 10 * 1024 * 1024; // 10 MB client safety check
    if (file.size > maxBytes) {
      setErrorMessage('This image exceeds the 10 MB size limit. Please select a smaller photo.');
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const newUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(newUrl);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setErrorMessage(null);
    setSearchResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleSearchSubmit = async () => {
    if (!selectedFile || isSearching || readyPhotoCount === 0) {
      return;
    }

    setErrorMessage(null);
    setIsSearching(true);
    setSearchResults(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('selfie', selectedFile);

      const response = await fetch(`/api/public/events/${eventSlug}/face-search`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      const data = await response.json();

      if (!response.ok) {
        // Map Phase 9 server error codes into customer-friendly messaging
        let mappedMsg = data.message || 'Face search failed. Please try again.';
        if (data.error === 'NO_FACE_DETECTED') {
          mappedMsg = "We couldn't detect a face in this photo. Please upload a clear frontal selfie.";
        } else if (data.error === 'UNSUPPORTED_FORMAT' || data.error === 'INVALID_IMAGE') {
          mappedMsg = 'Please select a valid JPEG, PNG, or WebP image.';
        } else if (data.error === 'IMAGE_TOO_LARGE') {
          mappedMsg = 'Image file size is too large. Please select a photo under 10 MB.';
        } else if (data.error === 'FACE_SERVICE_UNAVAILABLE' || data.error === 'SEARCH_UNAVAILABLE') {
          mappedMsg = 'Photo search service is temporarily unavailable. Please try again shortly.';
        } else if (data.error === 'FACE_SERVICE_TIMEOUT') {
          mappedMsg = 'Search timed out. Please try uploading your selfie again.';
        }

        setErrorMessage(mappedMsg);
        setIsSearching(false);
        return;
      }

      setSearchResults(data);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return; // Request was cancelled intentionally
      }
      setErrorMessage('An unexpected network error occurred. Please check your connection and try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // 1. Zero READY Photos State
  if (readyPhotoCount === 0) {
    return (
      <Card className="bg-slate-900/90 border-slate-800 text-white shadow-xl">
        <CardContent className="p-8 sm:p-10 text-center space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-amber-950/60 border border-amber-800/60 text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="h-7 w-7" />
          </div>

          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-lg font-bold text-white">Photos are being prepared</h3>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              The event organizer is currently processing photos. Face search will become available as soon as photos are ready.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hidden File & Camera Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        className="hidden"
        id="selfie-file-input"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleInputChange}
        className="hidden"
        id="selfie-camera-input"
      />

      {/* Main Selfie Search Form Card */}
      <Card className="bg-slate-900/90 border-slate-800 text-white shadow-xl overflow-hidden">
        <CardContent className="p-6 sm:p-10 space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span>Find My Photos</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Search by Selfie
            </h2>
            <p className="text-sm text-slate-400">
              Upload a clear photo of yourself to find all matching photos from this event.
            </p>
          </div>

          {/* Selfie Selection / Preview Area */}
          {!previewUrl ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 text-center space-y-5 transition-all ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-950/30'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950/50'
              }`}
            >
              <div className="h-16 w-16 rounded-2xl bg-indigo-950/60 border border-indigo-900/60 text-indigo-400 flex items-center justify-center mx-auto">
                <Upload className="h-8 w-8" />
              </div>

              <div className="space-y-1">
                <div className="text-sm font-semibold text-white">
                  Drag and drop your selfie here, or browse
                </div>
                <p className="text-xs text-slate-400">
                  Supports JPEG, PNG, WebP (Max 10 MB)
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold gap-2 px-5 py-2.5 rounded-xl"
                >
                  <Upload className="h-4 w-4 text-indigo-400" />
                  <span>Choose Photo</span>
                </Button>

                <Button
                  onClick={() => cameraInputRef.current?.click()}
                  variant="outline"
                  className="border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 text-xs font-semibold gap-2 px-5 py-2.5 rounded-xl"
                >
                  <Camera className="h-4 w-4 text-purple-400" />
                  <span>Take Selfie</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6 p-6 rounded-2xl bg-slate-950/80 border border-slate-800">
              {/* Selfie Image Local Object Preview */}
              <div className="relative h-32 w-32 rounded-xl overflow-hidden border-2 border-indigo-500/50 flex-shrink-0 shadow-lg">
                <img
                  src={previewUrl}
                  alt="Selected selfie preview"
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={handleRemoveFile}
                  disabled={isSearching}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-slate-950/80 text-slate-300 hover:text-white flex items-center justify-center border border-slate-700 transition-colors"
                  aria-label="Remove selfie"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* File details & Actions */}
              <div className="space-y-3 flex-1 text-center sm:text-left w-full">
                <div>
                  <div className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
                    {selectedFile?.name || 'Selected Selfie'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : ''} • Ready for search
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                  <Button
                    onClick={handleSearchSubmit}
                    disabled={isSearching}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 gap-2"
                  >
                    {isSearching ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Searching Event…</span>
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        <span>Search My Photos</span>
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={handleRemoveFile}
                    disabled={isSearching}
                    variant="ghost"
                    className="text-xs text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    Change Photo
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message Alert Banner */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-3 animate-fadeIn">
              <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold text-amber-300 block">Search Notice</span>
                <p className="leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Customer Biometric Privacy Guarantee */}
          <div className="pt-2 flex items-start gap-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60">
            <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              Your selfie is processed strictly in memory to search this event only and is never stored on our servers.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Render Results Gallery when search completes */}
      {searchResults && (
        <SearchResultsGallery
          eventSlug={eventSlug}
          resultCount={searchResults.resultCount}
          results={searchResults.results}
          pricingType={pricingType}
          priceDisplay={priceDisplay}
          pricePerPhoto={pricePerPhoto}
          currency={currency}
          onTryAnotherSelfie={handleRemoveFile}
        />
      )}
    </div>
  );
}
