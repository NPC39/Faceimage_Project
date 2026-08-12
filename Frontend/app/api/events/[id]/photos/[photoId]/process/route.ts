import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { processEventPhoto } from '@/lib/face-processing/process-photo';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; photoId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: eventId, photoId } = params;

  // 1. Verify Event ownership (privacy-preserving 404)
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, creatorId: true },
  });

  if (!event || event.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // 2. Verify Photo belongs to this Event (privacy-preserving 404)
  const photo = await prisma.eventPhoto.findUnique({
    where: { id: photoId },
    select: { id: true, eventId: true },
  });

  if (!photo || photo.eventId !== eventId) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  // 3. Process photo server-side
  try {
    const result = await processEventPhoto(photoId, session.user.id);
    return NextResponse.json({
      photo: {
        id: result.photoId,
        processingStatus: result.processingStatus,
        processingError: result.processingError,
        faceCount: result.faceCount,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Processing failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
