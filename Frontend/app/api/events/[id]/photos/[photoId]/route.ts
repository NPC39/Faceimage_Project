import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { prisma } from '@/lib/prisma';
import { getStorageProvider } from '@/lib/storage';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; photoId: string } }
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

    // Delete DB record first
    await prisma.eventPhoto.delete({
      where: {
        id: photo.id,
      },
    });

    // Delete files from private storage provider
    const storage = getStorageProvider();
    const cleanupPromises: Promise<void>[] = [];

    if (photo.originalKey) {
      cleanupPromises.push(storage.deleteObject(photo.originalKey).catch((err) => {
        console.warn(`[Storage Warning] Failed to delete original key "${photo.originalKey}":`, err.message);
      }));
    }
    if (photo.previewKey) {
      cleanupPromises.push(storage.deleteObject(photo.previewKey).catch((err) => {
        console.warn(`[Storage Warning] Failed to delete preview key "${photo.previewKey}":`, err.message);
      }));
    }
    if (photo.thumbnailKey) {
      cleanupPromises.push(storage.deleteObject(photo.thumbnailKey).catch((err) => {
        console.warn(`[Storage Warning] Failed to delete thumbnail key "${photo.thumbnailKey}":`, err.message);
      }));
    }

    await Promise.all(cleanupPromises);

    return NextResponse.json({ success: true, message: 'Photo deleted successfully.' });
  } catch (error: any) {
    console.error('Error deleting photo:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
