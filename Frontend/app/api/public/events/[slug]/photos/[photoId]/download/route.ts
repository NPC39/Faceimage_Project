import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { EventStatus, PhotoProcessingStatus } from '@prisma/client';
import { getStorageProvider } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string; photoId: string } }
) {
  try {
    const { slug, photoId } = params;

    if (!slug || !photoId) {
      return NextResponse.json(
        { error: 'INVALID_PARAMETERS', message: 'Event slug and photoId are required.' },
        { status: 400 }
      );
    }

    // 1. Resolve target Event by slug
    const event = await prisma.event.findUnique({
      where: { slug },
      select: { id: true, status: true, pricingType: true }
    });

    // 2. Strict PUBLISHED-only access control
    if (!event || event.status !== EventStatus.PUBLISHED) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Event not found or unavailable.' },
        { status: 404 }
      );
    }

    // 3. Backend FREE Event Verification — PAID events block direct public original download
    if (event.pricingType !== 'FREE') {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Original photo downloads require a purchase for PAID events.' },
        { status: 403 }
      );
    }

    // 4. Resolve target EventPhoto (Must belong to THIS exact Event AND be READY)
    const photo = await prisma.eventPhoto.findFirst({
      where: {
        id: photoId,
        eventId: event.id, // Strictly enforces photo.eventId === event.id (Cross-event protection)
        processingStatus: PhotoProcessingStatus.READY
      },
      select: {
        id: true,
        originalKey: true
      }
    });

    if (!photo || !photo.originalKey) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Photo not found or unavailable for download.' },
        { status: 404 }
      );
    }

    // 5. Retrieve original photo bytes from StorageProvider
    const storageProvider = getStorageProvider();
    let imageBuffer: Buffer;
    try {
      imageBuffer = await storageProvider.readObject(photo.originalKey);
    } catch (storageErr) {
      console.error('[PublicPhotoDownloadStorageError]', storageErr);
      return NextResponse.json(
        { error: 'FILE_NOT_FOUND', message: 'Original image payload unavailable.' },
        { status: 404 }
      );
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return NextResponse.json(
        { error: 'FILE_NOT_FOUND', message: 'Original image payload unavailable.' },
        { status: 404 }
      );
    }

    // 6. Determine MIME type and safe download filename
    const ext = path.extname(photo.originalKey).toLowerCase() || '.jpg';
    let contentType = 'image/jpeg';
    if (ext === '.png') {
      contentType = 'image/png';
    } else if (ext === '.webp') {
      contentType = 'image/webp';
    } else if (ext === '.jpg' || ext === '.jpeg') {
      contentType = 'image/jpeg';
    }

    // Derive safe download filename without internal path structure
    const rawFilename = path.basename(photo.originalKey);
    const downloadFilename = rawFilename && !rawFilename.includes('/') && !rawFilename.includes('\\')
      ? rawFilename
      : `photo_${photo.id}${ext}`;

    // 7. Stream original photo file as Content-Disposition attachment
    return new NextResponse(new Uint8Array(imageBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff'
      }
    });

  } catch (err) {
    console.error('[PublicPhotoDownloadError]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred while processing download.' },
      { status: 500 }
    );
  }
}
