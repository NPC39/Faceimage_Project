import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EventStatus, PhotoProcessingStatus } from '@prisma/client';
import { getStorageProvider } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; photoId: string; variant: string } }
) {
  try {
    const { slug, photoId, variant } = params;

    // 1. Validate variant type (ONLY preview and thumbnail variants allowed publicly)
    if (!variant || (variant !== 'preview' && variant !== 'thumbnail')) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED_VARIANT', message: 'Original images and unauthorized variants cannot be accessed publicly.' },
        { status: 404 }
      );
    }

    if (!slug || !photoId) {
      return NextResponse.json(
        { error: 'INVALID_PARAMETERS', message: 'Event slug and photoId are required.' },
        { status: 400 }
      );
    }

    // 2. Resolve target PUBLISHED Event
    const event = await prisma.event.findUnique({
      where: { slug },
      select: { id: true, status: true }
    });

    if (!event || event.status !== EventStatus.PUBLISHED) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Event not found or unavailable.' },
        { status: 404 }
      );
    }

    // 3. Resolve target EventPhoto (Must belong to Event AND be in READY processing status)
    const photo = await prisma.eventPhoto.findFirst({
      where: {
        id: photoId,
        eventId: event.id,
        processingStatus: PhotoProcessingStatus.READY
      },
      select: {
        id: true,
        previewKey: true,
        thumbnailKey: true
      }
    });

    if (!photo) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Photo not found or unavailable for preview.' },
        { status: 404 }
      );
    }

    const storageKey = variant === 'thumbnail' ? (photo.thumbnailKey || photo.previewKey) : photo.previewKey;

    if (!storageKey) {
      return NextResponse.json(
        { error: 'FILE_NOT_FOUND', message: 'Photo preview file is not available.' },
        { status: 404 }
      );
    }

    // 4. Retrieve derivative bytes from StorageProvider
    const storageProvider = getStorageProvider();
    const imageBuffer = await storageProvider.readObject(storageKey);


    if (!imageBuffer || imageBuffer.length === 0) {
      return NextResponse.json(
        { error: 'FILE_NOT_FOUND', message: 'Image payload unavailable.' },
        { status: 404 }
      );
    }

    // 5. Determine Content-Type safely
    const contentType = storageKey.endsWith('.png')
      ? 'image/png'
      : storageKey.endsWith('.jpg') || storageKey.endsWith('.jpeg')
      ? 'image/jpeg'
      : 'image/webp';

    // 6. Return image stream with privacy-conscious Cache-Control
    return new NextResponse(new Uint8Array(imageBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff'
      }
    });

  } catch (err) {
    console.error('[PublicPhotoDeliveryError]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred while delivering photo preview.' },
      { status: 500 }
    );
  }
}
