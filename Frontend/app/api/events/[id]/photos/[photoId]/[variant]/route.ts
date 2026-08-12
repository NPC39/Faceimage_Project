import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { prisma } from '@/lib/prisma';
import { getStorageProvider } from '@/lib/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; photoId: string; variant: string } }
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

    const photo = await prisma.eventPhoto.findFirst({
      where: {
        id: params.photoId,
        eventId: event.id,
      },
    });

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    let storageKey: string | null = null;
    if (params.variant === 'thumbnail') {
      storageKey = photo.thumbnailKey || photo.previewKey || photo.originalKey;
    } else if (params.variant === 'preview') {
      storageKey = photo.previewKey || photo.originalKey;
    } else if (params.variant === 'original') {
      storageKey = photo.originalKey;
    } else {
      return NextResponse.json({ error: 'Invalid variant requested' }, { status: 400 });
    }

    if (!storageKey) {
      return NextResponse.json({ error: 'Requested variant file missing' }, { status: 404 });
    }

    const storage = getStorageProvider();
    const fileBuffer = await storage.readObject(storageKey);

    let contentType = 'image/webp';
    if (storageKey.endsWith('.jpg') || storageKey.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (storageKey.endsWith('.png')) {
      contentType = 'image/png';
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    if (error.message && error.message.includes('Not Found')) {
      return NextResponse.json({ error: 'Image file not found on storage' }, { status: 404 });
    }
    console.error('Error serving private photo variant:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
