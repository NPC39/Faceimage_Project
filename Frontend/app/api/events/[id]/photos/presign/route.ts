import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { prisma } from '@/lib/prisma';
import { getMaxUploadSizeBytes, getMaxUploadSizeMb } from '@/lib/photos/photo-processor';
import { createR2PresignedUploadUrl } from '@/lib/storage/r2-presigned-upload';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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

    const providerType = (process.env.STORAGE_PROVIDER || '').toLowerCase();
    if (providerType !== 'r2') {
      return NextResponse.json(
        {
          directUpload: false,
          message: 'Direct upload is only supported for R2 storage provider.',
        },
        { status: 200 }
      );
    }

    const body = await request.json();
    const { filename, contentType, size } = body || {};

    if (typeof size !== 'number' || size <= 0) {
      return NextResponse.json(
        { error: 'Invalid file size.' },
        { status: 400 }
      );
    }

    const maxBytes = getMaxUploadSizeBytes();
    if (size > maxBytes) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed limit of ${getMaxUploadSizeMb()} MB.` },
        { status: 400 }
      );
    }

    if (!contentType || typeof contentType !== 'string' || !ALLOWED_MIME_TYPES[contentType.toLowerCase()]) {
      return NextResponse.json(
        { error: 'Unsupported file type. Allowed formats: JPEG, PNG, WebP.' },
        { status: 400 }
      );
    }

    const normalizedMime = contentType.toLowerCase();
    const ext = ALLOWED_MIME_TYPES[normalizedMime];
    const presignedContentType = normalizedMime === 'image/jpg' ? 'image/jpeg' : normalizedMime;

    const photoId = `ph_${crypto.randomBytes(12).toString('hex')}`;
    const originalKey = `events/${event.id}/${photoId}/original.${ext}`;

    const presigned = await createR2PresignedUploadUrl(originalKey, presignedContentType, 300);

    return NextResponse.json(
      {
        photoId,
        originalKey,
        uploadUrl: presigned.uploadUrl,
        contentType: presignedContentType,
        expiresIn: presigned.expiresIn,
        directUpload: true,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in photo presign route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
