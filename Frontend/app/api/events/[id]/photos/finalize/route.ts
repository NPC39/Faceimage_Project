import { NextRequest, NextResponse } from 'next/server';
import { PhotoProcessingStatus } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { prisma } from '@/lib/prisma';
import { getStorageProvider } from '@/lib/storage';
import { processAndValidateImage } from '@/lib/photos/photo-processor';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const tStart = performance.now();
  try {
    const tAuth0 = performance.now();
    const user = await getCurrentUser();
    const tAuth1 = performance.now();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tEvent0 = performance.now();
    const event = await prisma.event.findFirst({
      where: {
        id: params.id,
        creatorId: user.id,
      },
    });
    const tEvent1 = performance.now();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body = await request.json();
    const { photoId, originalKey } = body || {};

    if (!photoId || typeof photoId !== 'string') {
      return NextResponse.json({ error: 'Invalid or missing photoId.' }, { status: 400 });
    }

    if (!originalKey || typeof originalKey !== 'string') {
      return NextResponse.json({ error: 'Invalid or missing originalKey.' }, { status: 400 });
    }

    // Key security & ownership validation
    const expectedPrefix = `events/${event.id}/${photoId}/`;
    const normalizedKey = originalKey.replace(/\\/g, '/');

    if (
      normalizedKey.startsWith('/') ||
      normalizedKey.includes('..') ||
      !normalizedKey.startsWith(expectedPrefix)
    ) {
      return NextResponse.json(
        { error: 'Security Violation: Key ownership validation failed.' },
        { status: 400 }
      );
    }

    const allowedOriginals = new Set([
      `${expectedPrefix}original.jpg`,
      `${expectedPrefix}original.png`,
      `${expectedPrefix}original.webp`,
    ]);

    if (!allowedOriginals.has(normalizedKey)) {
      return NextResponse.json(
        { error: 'Security Violation: Invalid original key filename.' },
        { status: 400 }
      );
    }

    // Idempotency check: If already finalized, return existing record
    const tPhotoLookup0 = performance.now();
    const existingPhoto = await prisma.eventPhoto.findUnique({
      where: { id: photoId },
    });
    const tPhotoLookup1 = performance.now();

    if (existingPhoto) {
      return NextResponse.json({ photo: existingPhoto }, { status: 200 });
    }

    const storage = getStorageProvider();

    // Verify object exists in storage
    const tExists0 = performance.now();
    const exists = await storage.exists(originalKey);
    const tExists1 = performance.now();

    if (!exists) {
      return NextResponse.json(
        { error: 'Original photo upload not found in storage.' },
        { status: 400 }
      );
    }

    // Read original buffer from storage
    let rawBuffer: Buffer;
    const tRead0 = performance.now();
    try {
      rawBuffer = await storage.readObject(originalKey);
    } catch (readErr: any) {
      return NextResponse.json(
        { error: `Failed to read original object from storage: ${readErr.message}` },
        { status: 400 }
      );
    }
    const tRead1 = performance.now();

    // Image processing (sharp validation, size check, preview & thumbnail generation)
    let processed;
    const tGen0 = performance.now();
    try {
      processed = await processAndValidateImage(rawBuffer);
    } catch (procErr: any) {
      return NextResponse.json(
        { error: procErr.message || 'Image validation and processing failed.' },
        { status: 400 }
      );
    }
    const tGen1 = performance.now();

    const previewKey = `events/${event.id}/${photoId}/preview.webp`;
    const thumbnailKey = `events/${event.id}/${photoId}/thumbnail.webp`;

    const createdDerivedKeys: string[] = [];
    try {
      const tPrevWrite0 = performance.now();
      await storage.saveObject(previewKey, processed.previewBuffer, 'image/webp');
      const tPrevWrite1 = performance.now();
      createdDerivedKeys.push(previewKey);

      const tThumbWrite0 = performance.now();
      await storage.saveObject(thumbnailKey, processed.thumbnailBuffer, 'image/webp');
      const tThumbWrite1 = performance.now();
      createdDerivedKeys.push(thumbnailKey);

      const tDbCreate0 = performance.now();
      const photoRecord = await prisma.eventPhoto.create({
        data: {
          id: photoId,
          eventId: event.id,
          originalKey,
          previewKey,
          thumbnailKey,
          width: processed.width,
          height: processed.height,
          processingStatus: PhotoProcessingStatus.UPLOADED,
        },
      });
      const tDbCreate1 = performance.now();

      const tEnd = performance.now();

      // Safe structured log
      try {
        const perfData = {
          stage: 'finalize',
          photoLabel: photoId.slice(-8),
          auth_ms: Math.round((tAuth1 - tAuth0) * 100) / 100,
          event_lookup_ms: Math.round((tEvent1 - tEvent0) * 100) / 100,
          existing_photo_lookup_ms: Math.round((tPhotoLookup1 - tPhotoLookup0) * 100) / 100,
          storage_exists_ms: Math.round((tExists1 - tExists0) * 100) / 100,
          r2_original_read_ms: Math.round((tRead1 - tRead0) * 100) / 100,
          derived_image_generation_ms: Math.round((tGen1 - tGen0) * 100) / 100,
          preview_storage_write_ms: Math.round((tPrevWrite1 - tPrevWrite0) * 100) / 100,
          thumbnail_storage_write_ms: Math.round((tThumbWrite1 - tThumbWrite0) * 100) / 100,
          db_photo_create_ms: Math.round((tDbCreate1 - tDbCreate0) * 100) / 100,
          finalize_total_ms: Math.round((tEnd - tStart) * 100) / 100,
        };
        console.log('[PHOTO_PERF]', JSON.stringify(perfData));
      } catch {}

      return NextResponse.json({ photo: photoRecord }, { status: 201 });
    } catch (err: any) {
      // Cleanup derived preview/thumbnail on DB failure (do NOT delete original)
      for (const key of createdDerivedKeys) {
        await storage.deleteObject(key).catch(() => {});
      }
      console.error('Error finalizing photo upload:', err);
      return NextResponse.json(
        { error: err.message || 'Failed to finalize photo upload.' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in photo finalize route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
