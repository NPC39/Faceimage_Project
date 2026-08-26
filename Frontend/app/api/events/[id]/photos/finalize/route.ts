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
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = await prisma.event.findFirst({
      where: {
        id: params.id,
        creatorId: user.id,
      },
    });

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
    const existingPhoto = await prisma.eventPhoto.findUnique({
      where: { id: photoId },
    });

    if (existingPhoto) {
      return NextResponse.json({ photo: existingPhoto }, { status: 200 });
    }

    const storage = getStorageProvider();

    // Verify object exists in storage
    const exists = await storage.exists(originalKey);
    if (!exists) {
      return NextResponse.json(
        { error: 'Original photo upload not found in storage.' },
        { status: 400 }
      );
    }

    // Read original buffer from storage
    let rawBuffer: Buffer;
    try {
      rawBuffer = await storage.readObject(originalKey);
    } catch (readErr: any) {
      return NextResponse.json(
        { error: `Failed to read original object from storage: ${readErr.message}` },
        { status: 400 }
      );
    }

    // Image processing (sharp validation, size check, preview & thumbnail generation)
    let processed;
    try {
      processed = await processAndValidateImage(rawBuffer);
    } catch (procErr: any) {
      return NextResponse.json(
        { error: procErr.message || 'Image validation and processing failed.' },
        { status: 400 }
      );
    }

    const previewKey = `events/${event.id}/${photoId}/preview.webp`;
    const thumbnailKey = `events/${event.id}/${photoId}/thumbnail.webp`;

    const createdDerivedKeys: string[] = [];
    try {
      await storage.saveObject(previewKey, processed.previewBuffer, 'image/webp');
      createdDerivedKeys.push(previewKey);

      await storage.saveObject(thumbnailKey, processed.thumbnailBuffer, 'image/webp');
      createdDerivedKeys.push(thumbnailKey);

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
