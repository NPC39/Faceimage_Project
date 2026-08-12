import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
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

    const formData = await request.formData();
    const files: File[] = [];

    const fileEntries = formData.getAll('file').concat(formData.getAll('files'));
    for (const entry of fileEntries) {
      if (entry instanceof File) {
        files.push(entry);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided for upload.' }, { status: 400 });
    }

    const storage = getStorageProvider();
    const createdPhotos = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuffer);

      // Validate & Process Image (sharp decoding, size limit, variant creation)
      let processed;
      try {
        processed = await processAndValidateImage(rawBuffer);
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Image processing failed.' }, { status: 400 });
      }

      const photoId = `ph_${crypto.randomBytes(12).toString('hex')}`;
      const ext = processed.format === 'jpeg' ? 'jpg' : processed.format;
      const originalKey = `events/${event.id}/${photoId}/original.${ext}`;
      const previewKey = `events/${event.id}/${photoId}/preview.webp`;
      const thumbnailKey = `events/${event.id}/${photoId}/thumbnail.webp`;

      const savedKeys: string[] = [];
      try {
        await storage.saveObject(originalKey, processed.originalBuffer, `image/${processed.format}`);
        savedKeys.push(originalKey);

        await storage.saveObject(previewKey, processed.previewBuffer, 'image/webp');
        savedKeys.push(previewKey);

        await storage.saveObject(thumbnailKey, processed.thumbnailBuffer, 'image/webp');
        savedKeys.push(thumbnailKey);

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

        createdPhotos.push(photoRecord);
      } catch (dbError) {
        // Cleanup storage on failure
        for (const key of savedKeys) {
          await storage.deleteObject(key).catch(() => {});
        }
        throw dbError;
      }
    }

    return NextResponse.json({ photos: createdPhotos }, { status: 201 });
  } catch (error: any) {
    console.error('Error in photo upload route:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
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

    const photos = await prisma.eventPhoto.findMany({
      where: {
        eventId: event.id,
      },
      include: {
        _count: {
          select: { detectedFaces: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ photos });
  } catch (error: any) {
    console.error('Error fetching event photos:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
