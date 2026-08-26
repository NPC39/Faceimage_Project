import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { processEventPhoto } from '@/lib/face-processing/process-photo';
import { PhotoProcessingStatus } from '@prisma/client';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: eventId } = params;

  // 1. Verify Event ownership (404)
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, creatorId: true },
  });

  if (!event || event.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // 2. Query all UPLOADED or FAILED photos in event
  const photos = await prisma.eventPhoto.findMany({
    where: {
      eventId,
      processingStatus: { in: [PhotoProcessingStatus.UPLOADED, PhotoProcessingStatus.FAILED] },
    },
    select: { id: true },
  });

  if (photos.length === 0) {
    return NextResponse.json({
      message: 'No photos awaiting processing',
      total: 0,
      processed: 0,
      successCount: 0,
      failedCount: 0,
    });
  }

  // 3. Process with bounded concurrency (default 1)
  const rawConcurrency = parseInt(process.env.FACE_PROCESSING_CONCURRENCY || '1', 10);
  const concurrency = isNaN(rawConcurrency) || rawConcurrency < 1 ? 1 : Math.min(rawConcurrency, 4);
  let successCount = 0;
  let failedCount = 0;

  // Process in chunks of size `concurrency`
  for (let i = 0; i < photos.length; i += concurrency) {
    const chunk = photos.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map((p) => processEventPhoto(p.id, session.user.id).catch(() => null))
    );

    for (const res of results) {
      if (res && res.success) {
        successCount++;
      } else {
        failedCount++;
      }
    }
  }

  return NextResponse.json({
    message: `Batch processing complete. ${successCount} succeeded, ${failedCount} failed.`,
    total: photos.length,
    processed: successCount + failedCount,
    successCount,
    failedCount,
  });
}
