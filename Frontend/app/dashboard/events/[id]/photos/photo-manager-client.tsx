'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  UploadCloud,
  ImageIcon,
  Trash2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
  FileImage,
  Loader2,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants, Button } from '@/components/ui/button';

interface EventData {
  id: string;
  name: string;
  slug: string;
}

interface PhotoRecord {
  id: string;
  eventId: string;
  originalKey: string;
  previewKey: string | null;
  thumbnailKey: string | null;
  width: number | null;
  height: number | null;
  processingStatus: string;
  processingError?: string | null;
  createdAt: string;
  _count?: {
    detectedFaces: number;
  };
}

interface UploadItem {
  id: string;
  file: File;
  filename: string;
  sizeFormatted: string;
  progress: number;
  status: 'QUEUED' | 'UPLOADING' | 'COMPLETE' | 'FAILED';
  error?: string;
}

interface PhotoManagerClientProps {
  event: EventData;
  initialPhotos: PhotoRecord[];
}

const MAX_CONCURRENT_UPLOADS = 3;

export function PhotoManagerClient({ event, initialPhotos }: PhotoManagerClientProps) {
  const [photos, setPhotos] = useState<PhotoRecord[]>(initialPhotos);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedPreviewPhoto, setSelectedPreviewPhoto] = useState<PhotoRecord | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [processingPhotoIds, setProcessingPhotoIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getStatusBadge = (status: string, faceCount?: number, error?: string | null) => {
    switch (status) {
      case 'UPLOADED':
        return (
          <Badge variant="outline" className="bg-slate-950/80 border-slate-700 text-slate-300 text-[10px] backdrop-blur-sm px-2 py-0.5 font-medium">
            Uploaded
          </Badge>
        );
      case 'PROCESSING':
        return (
          <Badge variant="outline" className="bg-slate-950/80 border-blue-500/40 text-blue-300 text-[10px] backdrop-blur-sm px-2 py-0.5 flex items-center gap-1 font-medium">
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
            <span>Processing...</span>
          </Badge>
        );
      case 'READY':
        const count = faceCount ?? 0;
        return (
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="bg-slate-950/80 border-emerald-500/40 text-emerald-400 text-[10px] backdrop-blur-sm px-2 py-0.5 font-medium">
              Ready
            </Badge>
            <Badge variant="outline" className="bg-slate-950/80 border-purple-500/40 text-purple-300 text-[10px] backdrop-blur-sm px-1.5 py-0.5 font-mono">
              {count} {count === 1 ? 'face' : 'faces'}
            </Badge>
          </div>
        );
      case 'FAILED':
        return (
          <Badge variant="outline" className="bg-slate-950/80 border-rose-500/40 text-rose-400 text-[10px] backdrop-blur-sm px-2 py-0.5 font-medium flex items-center gap-1" title={error || 'Processing error'}>
            <AlertCircle className="h-3 w-3" />
            <span>Failed</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-slate-950/80 border-slate-700 text-slate-300 text-[10px] backdrop-blur-sm px-2 py-0.5 font-medium">
            {status}
          </Badge>
        );
    }
  };


  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const processSinglePhoto = useCallback(async (photoId: string) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, processingStatus: 'PROCESSING', processingError: null } : p))
    );
    try {
      const res = await fetch(`/api/events/${event.id}/photos/${photoId}/process`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.photo) {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photoId
              ? {
                  ...p,
                  processingStatus: data.photo.processingStatus,
                  processingError: data.photo.processingError,
                  _count: { detectedFaces: data.photo.faceCount },
                }
              : p
          )
        );
      } else {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photoId
              ? { ...p, processingStatus: 'FAILED', processingError: data.error || 'PROCESSING_FAILED' }
              : p
          )
        );
      }
    } catch {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? { ...p, processingStatus: 'FAILED', processingError: 'NETWORK_ERROR' }
            : p
        )
      );
    }
  }, [event.id]);

  const processAllPhotos = useCallback(async () => {
    setIsBatchProcessing(true);
    try {
      const res = await fetch(`/api/events/${event.id}/photos/process-all`, {
        method: 'POST',
      });
      if (res.ok) {
        const listRes = await fetch(`/api/events/${event.id}/photos`);
        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.photos) {
            setPhotos(listData.photos);
          }
        }
      }
    } catch (err) {
      console.error('Batch processing error:', err);
    } finally {
      setIsBatchProcessing(false);
    }
  }, [event.id]);

  // Polling loop while any photo is PROCESSING
  useEffect(() => {
    const hasProcessing = photos.some((p) => p.processingStatus === 'PROCESSING');
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/events/${event.id}/photos`);
        if (res.ok) {
          const data = await res.json();
          if (data.photos) {
            setPhotos(data.photos);
          }
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [event.id, photos]);

  const executeMultipartUpload = useCallback(
    (item: UploadItem) => {
      const formData = new FormData();
      formData.append('file', item.file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/events/${event.id}/photos`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, progress: percent } : q))
          );
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            const newPhotos: PhotoRecord[] = data.photos || [];

            setUploadQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, status: 'COMPLETE', progress: 100 } : q))
            );

            setPhotos((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const filteredNew = newPhotos.filter((p) => !existingIds.has(p.id));
              return [...filteredNew, ...prev];
            });

            newPhotos.forEach((p) => {
              processSinglePhoto(p.id);
            });
          } catch {
            setUploadQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, status: 'FAILED', error: 'Failed to parse response' } : q))
            );
          }
        } else {
          let errorMsg = 'Upload failed';
          try {
            const errData = JSON.parse(xhr.responseText);
            errorMsg = errData.error || errorMsg;
          } catch {}
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: 'FAILED', error: errorMsg } : q))
          );
        }
      };

      xhr.onerror = () => {
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'FAILED', error: 'Network error' } : q))
        );
      };

      xhr.send(formData);
    },
    [event.id, processSinglePhoto]
  );

  const uploadSingleFile = useCallback(
    async (item: UploadItem) => {
      setUploadQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'UPLOADING', progress: 0, error: undefined } : q))
      );

      let presignData: any;
      try {
        const presignRes = await fetch(`/api/events/${event.id}/photos/presign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: item.file.name,
            contentType: item.file.type,
            size: item.file.size,
          }),
        });

        if (!presignRes.ok) {
          const errData = await presignRes.json().catch(() => ({}));
          const errorMsg = errData.error || 'Failed to request upload authorization.';
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: 'FAILED', error: errorMsg } : q))
          );
          return;
        }

        presignData = await presignRes.json();
      } catch {
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'FAILED', error: 'Presign request failed.' } : q))
        );
        return;
      }

      if (presignData.directUpload === false || !presignData.uploadUrl) {
        executeMultipartUpload(item);
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignData.uploadUrl);
      xhr.setRequestHeader('Content-Type', presignData.contentType || item.file.type || 'application/octet-stream');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, progress: percent } : q))
          );
        }
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const finalizeRes = await fetch(`/api/events/${event.id}/photos/finalize`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                photoId: presignData.photoId,
                originalKey: presignData.originalKey,
              }),
            });

            const finalizeData = await finalizeRes.json().catch(() => ({}));

            if (finalizeRes.ok && finalizeData.photo) {
              const newPhoto: PhotoRecord = finalizeData.photo;

              setUploadQueue((prev) =>
                prev.map((q) => (q.id === item.id ? { ...q, status: 'COMPLETE', progress: 100 } : q))
              );

              setPhotos((prev) => {
                const existingIds = new Set(prev.map((p) => p.id));
                if (existingIds.has(newPhoto.id)) return prev;
                return [newPhoto, ...prev];
              });

              processSinglePhoto(newPhoto.id);
            } else {
              const errorMsg = finalizeData.error || 'Failed to finalize photo processing.';
              setUploadQueue((prev) =>
                prev.map((q) => (q.id === item.id ? { ...q, status: 'FAILED', error: errorMsg } : q))
              );
            }
          } catch {
            setUploadQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, status: 'FAILED', error: 'Finalize request failed.' } : q))
            );
          }
        } else {
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: 'FAILED', error: `R2 Upload failed with status ${xhr.status}` } : q))
          );
        }
      };

      xhr.onerror = () => {
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'FAILED', error: 'R2 Direct Upload network error.' } : q))
        );
      };

      xhr.send(item.file);
    },
    [event.id, executeMultipartUpload, processSinglePhoto]
  );



  // Concurrency Queue Loop
  useEffect(() => {
    const activeUploadsCount = uploadQueue.filter((q) => q.status === 'UPLOADING').length;
    const queuedItems = uploadQueue.filter((q) => q.status === 'QUEUED');

    if (activeUploadsCount < MAX_CONCURRENT_UPLOADS && queuedItems.length > 0) {
      const itemsToStart = queuedItems.slice(0, MAX_CONCURRENT_UPLOADS - activeUploadsCount);
      itemsToStart.forEach((item) => {
        uploadSingleFile(item);
      });
    }
  }, [uploadQueue, uploadSingleFile]);

  const addFilesToQueue = (filesList: FileList | File[]) => {
    const newItems: UploadItem[] = [];
    Array.from(filesList).forEach((file) => {
      if (!file.type.match(/^image\/(jpeg|png|webp)$/i)) {
        alert(`File "${file.name}" is not a supported format. Please choose JPEG, PNG, or WebP.`);
        return;
      }
      newItems.push({
        id: `upload_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        filename: file.name,
        sizeFormatted: formatFileSize(file.size),
        progress: 0,
        status: 'QUEUED',
      });
    });

    if (newItems.length > 0) {
      setUploadQueue((prev) => [...newItems, ...prev]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
      e.target.value = '';
    }
  };

  const retryUpload = (id: string) => {
    setUploadQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: 'QUEUED', progress: 0, error: undefined } : q))
    );
  };

  const removeQueueItem = (id: string) => {
    setUploadQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const handleDeletePhoto = async (photoId: string) => {
    setDeletingPhotoId(photoId);
    try {
      const res = await fetch(`/api/events/${event.id}/photos/${photoId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      } else {
        const data = await res.json();
        alert(`Failed to delete photo: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    } finally {
      setDeletingPhotoId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Navigation Header */}
      <div className="space-y-3">
        <Link
          href={`/dashboard/events/${event.id}`}
          className={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: 'text-xs text-slate-400 hover:text-white px-2 gap-1.5 inline-flex',
          })}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Event Details</span>
        </Link>

        <DashboardHeader
          heading={`Manage Photos: ${event.name}`}
          subheading={`Upload and organize high-resolution photos for event "${event.slug}"`}
        >
          <div className="flex items-center gap-3">
            {photos.some((p) => p.processingStatus === 'UPLOADED' || p.processingStatus === 'FAILED') && (
              <Button
                type="button"
                size="sm"
                onClick={processAllPhotos}
                disabled={isBatchProcessing}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5 h-8"
              >
                {isBatchProcessing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>Process Uploaded Photos</span>
              </Button>
            )}
            <Badge variant="outline" className="border-indigo-500/30 bg-indigo-950/30 text-indigo-300 px-3 py-1 text-xs">
              <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
              <span>{photos.length} Photos Uploaded</span>
            </Badge>
          </div>
        </DashboardHeader>
      </div>

      {/* Drag & Drop Upload Zone */}
      <Card className="bg-slate-900/80 border-slate-800 text-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UploadCloud className="h-4 w-4 text-indigo-400" />
            <span>Upload New Event Photos</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Drag and drop multiple images or click browse. Supported formats: JPEG, PNG, WebP (Up to 20MB per photo).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
              isDragging
                ? 'border-indigo-500 bg-indigo-950/20'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="p-3.5 rounded-full bg-slate-900 border border-slate-800 text-indigo-400 shadow-inner">
                <UploadCloud className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">
                  Drag and drop images here, or <span className="text-indigo-400 underline">browse files</span>
                </p>
                <p className="text-xs text-slate-500">Supports JPEG, PNG, WebP • Max 20MB per photo</p>
              </div>
            </div>
          </div>

          {/* Upload Queue Progress List */}
          {uploadQueue.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
                <span>Upload Progress ({uploadQueue.filter((q) => q.status === 'COMPLETE').length} / {uploadQueue.length})</span>
                <button
                  type="button"
                  onClick={() => setUploadQueue((prev) => prev.filter((q) => q.status !== 'COMPLETE'))}
                  className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Clear Completed
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {uploadQueue.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileImage className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-200 truncate">{item.filename}</span>
                          <span className="text-[11px] text-slate-500 shrink-0">{item.sizeFormatted}</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-200 ${
                              item.status === 'FAILED'
                                ? 'bg-rose-500'
                                : item.status === 'COMPLETE'
                                ? 'bg-emerald-500'
                                : 'bg-indigo-500'
                            }`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>

                        {item.error && (
                          <p className="text-[11px] text-rose-400 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            <span>{item.error}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === 'QUEUED' && (
                        <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">
                          Queued
                        </Badge>
                      )}
                      {item.status === 'UPLOADING' && (
                        <Badge variant="outline" className="text-[10px] border-indigo-500/40 text-indigo-300 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>{item.progress}%</span>
                        </Badge>
                      )}
                      {item.status === 'COMPLETE' && (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Done</span>
                        </Badge>
                      )}
                      {item.status === 'FAILED' && (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => retryUpload(item.id)}
                            className="h-7 px-2 text-xs text-indigo-400 hover:text-indigo-300"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => removeQueueItem(item.id)}
                        className="text-slate-500 hover:text-slate-300 p-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uploaded Photos Gallery Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-purple-400" />
            <span>Event Photos ({photos.length})</span>
          </h2>
        </div>

        {photos.length === 0 ? (
          <Card className="bg-slate-900/40 border-slate-800 text-white">
            <CardContent className="p-12 text-center space-y-3">
              <ImageIcon className="h-10 w-10 text-slate-600 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-300">No photos uploaded yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Drag & drop your event images above to start building the photo gallery.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => {
              const previewUrl = `/api/events/${event.id}/photos/${photo.id}/preview`;
              const thumbnailUrl = `/api/events/${event.id}/photos/${photo.id}/thumbnail`;
              const isDeleting = deletingPhotoId === photo.id;
              const isConfirming = confirmDeleteId === photo.id;

              return (
                <div
                  key={photo.id}
                  className="group relative rounded-xl bg-slate-900/80 border border-slate-800 overflow-hidden hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  {/* Card Image Aspect Frame */}
                  <div
                    onClick={() => setSelectedPreviewPhoto(photo)}
                    className="relative aspect-[4/3] bg-slate-950 overflow-hidden flex items-center justify-center cursor-pointer"
                  >
                    <img
                      src={previewUrl}
                      alt={`Photo ${photo.id}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />

                    {/* Status Badge */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                      {getStatusBadge(photo.processingStatus, photo._count?.detectedFaces, photo.processingError)}
                    </div>

                    {/* Delete & Retry Action Triggers */}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {photo.processingStatus === 'FAILED' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            processSinglePhoto(photo.id);
                          }}
                          className="h-7 px-2 bg-slate-950/80 hover:bg-indigo-950 text-indigo-300 hover:text-indigo-200 border border-slate-800 rounded-md backdrop-blur-sm text-[11px] gap-1"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Retry</span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(photo.id);
                        }}
                        className="h-7 w-7 p-0 bg-slate-950/80 hover:bg-rose-950 text-slate-300 hover:text-rose-400 border border-slate-800 rounded-md backdrop-blur-sm"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Photo Info Footer */}
                  <div
                    onClick={() => setSelectedPreviewPhoto(photo)}
                    className="p-3 bg-slate-900 text-xs space-y-1 border-t border-slate-800/60 cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="font-mono text-[11px] text-slate-300 truncate">
                        ID: {photo.id.slice(-8)}
                      </span>
                      {photo.width && photo.height && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {photo.width} × {photo.height}
                        </span>
                      )}
                    </div>
                    {photo.processingError && (
                      <p className="text-[10px] text-rose-400 font-mono truncate">
                        Error: {photo.processingError}
                      </p>
                    )}
                  </div>

                  {/* Delete Confirmation Overlay */}
                  {isConfirming && (
                    <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm p-4 flex flex-col items-center justify-center text-center space-y-3 z-10 animate-in fade-in duration-150">
                      <AlertCircle className="h-6 w-6 text-rose-400" />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-white">Delete this photo?</p>
                        <p className="text-[11px] text-slate-400">This action cannot be undone.</p>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={isDeleting}
                          className="h-7 text-xs text-slate-400 hover:text-white"
                        >
                          Cancel
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleDeletePhoto(photo.id)}
                          disabled={isDeleting}
                          className="h-7 text-xs bg-rose-600 hover:bg-rose-500 text-white gap-1"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          <span>Confirm</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* High-Resolution Photo Preview Lightbox Modal */}
      {selectedPreviewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md p-4 flex flex-col items-center justify-center animate-in fade-in duration-200"
          onClick={() => setSelectedPreviewPhoto(null)}
        >
          <div
            className="relative max-w-5xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <FileImage className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Photo Preview</span>
                    <span className="font-mono text-xs text-slate-400">({selectedPreviewPhoto.id})</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Dimensions: {selectedPreviewPhoto.width} × {selectedPreviewPhoto.height} px
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {getStatusBadge(selectedPreviewPhoto.processingStatus, selectedPreviewPhoto._count?.detectedFaces, selectedPreviewPhoto.processingError)}


                <button
                  type="button"
                  onClick={() => setSelectedPreviewPhoto(null)}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal High-Res Image Display */}
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-950">
              <img
                src={`/api/events/${event.id}/photos/${selectedPreviewPhoto.id}/preview`}
                alt={`High-res preview of photo ${selectedPreviewPhoto.id}`}
                className="max-h-[75vh] w-auto object-contain rounded-lg shadow-lg border border-slate-800"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
