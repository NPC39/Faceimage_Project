'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
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

  // Camera Modal & Webcam States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop camera stream tracks helper
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraReady(false);
    setIsCameraLoading(false);
  }, []);

  const closeCamera = useCallback(() => {
    stopCamera();
    setIsCameraOpen(false);
    setCameraError(null);
    setIsCapturing(false);
  }, [stopCamera]);

  // Revoke object URL on preview change or unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Cleanup camera streams and ongoing search request ONLY on component unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [stopCamera]);

  // Bind media stream to video element when camera becomes ready
  useEffect(() => {
    if (isCameraOpen && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraOpen, isCameraReady]);

  // Support closing camera modal with ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCameraOpen) {
        closeCamera();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCameraOpen, closeCamera]);

  const startCamera = async () => {
    setErrorMessage(null);
    setCameraError(null);

    // Fallback if mediaDevices API is not supported by browser environment
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    setIsCameraOpen(true);
    setIsCameraLoading(true);
    setIsCameraReady(false);

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' } },
          audio: false,
        });
      } catch (idealErr) {
        // Fallback if ideal facingMode constraint fails on specific hardware
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setIsCameraReady(true);
    } catch (err: any) {
      console.error('Camera access error:', err);
      let msg = 'Unable to access camera. Please choose a photo instead.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera access was denied. Please allow camera access in your browser settings or choose a photo instead.';
      } else if (
        err.name === 'NotFoundError' ||
        err.name === 'DevicesNotFoundError' ||
        err.name === 'NotReadableError' ||
        err.name === 'OverconstrainedError'
      ) {
        msg = 'Camera is unavailable on this device. Please choose a photo instead.';
      }
      setCameraError(msg);
    } finally {
      setIsCameraLoading(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || isCapturing || isSearching) return;

    setIsCapturing(true);

    const video = videoRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsCapturing(false);
      setErrorMessage('Failed to capture photo from camera.');
      closeCamera();
      return;
    }

    // Capture original unmirrored video frame for face recognition accuracy
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setIsCapturing(false);
          setErrorMessage('Failed to create photo image file.');
          closeCamera();
          return;
        }

        const selfieFile = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });

        // Stop camera stream & close modal immediately after capture
        stopCamera();
        setIsCameraOpen(false);
        setIsCapturing(false);

        // Automatically start search pipeline with captured selfie
        await executeFaceSearch(selfieFile);
      },
      'image/jpeg',
      0.90
    );
  };

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

  const executeFaceSearch = async (fileToSearch: File) => {
    if (!fileToSearch || isSearching || readyPhotoCount === 0) {
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(fileToSearch.type.toLowerCase())) {
      setErrorMessage('Please select a valid JPEG, PNG, or WebP image format.');
      return;
    }

    const maxBytes = 10 * 1024 * 1024; // 10 MB client safety check
    if (fileToSearch.size > maxBytes) {
      setErrorMessage('This image exceeds the 10 MB size limit. Please select a smaller photo.');
      return;
    }

    if (selectedFile !== fileToSearch) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      const newUrl = URL.createObjectURL(fileToSearch);
      setSelectedFile(fileToSearch);
      setPreviewUrl(newUrl);
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
      formData.append('selfie', fileToSearch);

      const response = await fetch(`/api/public/events/${eventSlug}/face-search`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      const data = await response.json();

      if (!response.ok) {
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

  const handleSearchSubmit = async () => {
    if (selectedFile) {
      await executeFaceSearch(selectedFile);
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
      {/* Hidden File & Fallback Camera Inputs */}
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
              Upload or take a photo of yourself to find all matching photos from this event.
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
                  onClick={startCamera}
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

          {/* Active Search Banner Indicator */}
          {isSearching && (
            <div className="p-4 rounded-xl bg-indigo-950/50 border border-indigo-800/60 text-indigo-200 text-xs flex items-center gap-3 animate-pulse">
              <Loader2 className="h-5 w-5 text-indigo-400 animate-spin flex-shrink-0" />
              <div>
                <span className="font-semibold text-indigo-300 block">Searching for your photos...</span>
                <span className="text-slate-300">Analyzing selfie and finding matches in this event.</span>
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

      {/* Live Camera Capture Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div
            className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-5 text-white"
            role="dialog"
            aria-modal="true"
            aria-labelledby="camera-modal-title"
          >
            {/* Modal Header */}
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-950/60 text-purple-400 border border-purple-900/50">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="camera-modal-title" className="text-lg font-bold text-white leading-none">Take Selfie</h3>
                  <p className="text-xs text-slate-400 mt-1">Center your face within the frame</p>
                </div>
              </div>
              <button
                onClick={closeCamera}
                className="h-9 w-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center border border-slate-700 transition-colors"
                aria-label="Close camera modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Camera Preview / Error Banner */}
            {cameraError ? (
              <div className="w-full p-6 rounded-2xl bg-amber-950/40 border border-amber-800/60 text-center space-y-4 my-2">
                <div className="h-12 w-12 rounded-full bg-amber-900/50 text-amber-400 flex items-center justify-center mx-auto border border-amber-700/50">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-amber-300">Camera Access Issue</h4>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
                    {cameraError}
                  </p>
                </div>
                <div className="pt-2 flex justify-center gap-3">
                  <Button
                    onClick={() => {
                      closeCamera();
                      fileInputRef.current?.click();
                    }}
                    variant="outline"
                    className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl"
                  >
                    Choose Photo Instead
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center shadow-inner">
                {/* Loading indicator while stream initializes */}
                {isCameraLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 z-10 text-slate-400">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                    <span className="text-xs">Starting camera…</span>
                  </div>
                )}

                {/* Video Stream Preview (Mirrored via CSS for natural selfie view) */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />

                {/* Face Positioning Overlay */}
                {isCameraReady && !cameraError && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    <div className="w-48 h-60 sm:w-56 sm:h-72 rounded-[50%] border-2 border-dashed border-purple-400/60 shadow-[0_0_30px_rgba(168,85,247,0.15)] flex items-center justify-center">
                      <div className="w-full text-center text-xs text-purple-200/70 font-medium px-4 bg-slate-950/40 backdrop-blur-[2px] py-1 rounded-full border border-purple-500/20">
                        Center your face
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal Shutter Action Control */}
            {!cameraError && (
              <div className="w-full flex flex-col items-center justify-center gap-2 pt-1 pb-1">
                <button
                  onClick={capturePhoto}
                  disabled={!isCameraReady || isCapturing || isSearching}
                  className={`group relative h-16 w-16 rounded-full flex items-center justify-center transition-all ${
                    !isCameraReady || isCapturing || isSearching
                      ? 'opacity-50 cursor-not-allowed bg-slate-800 border-2 border-slate-700'
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border-4 border-slate-900 shadow-xl shadow-indigo-600/40 hover:scale-105 active:scale-95'
                  }`}
                  aria-label="Take Photo"
                >
                  {isCapturing ? (
                    <Loader2 className="h-7 w-7 text-white animate-spin" />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-white group-hover:scale-90 transition-transform" />
                  )}
                </button>
                <span className="text-[11px] font-medium text-slate-400">Take Photo</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
