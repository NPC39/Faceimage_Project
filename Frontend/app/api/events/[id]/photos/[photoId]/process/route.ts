import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { processEventPhoto } from '@/lib/face-processing/process-photo';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; photoId: string } }
) {
  const tAuth0 = performance.now();
  const session = await getServerSession(authOptions);
  const tAuth1 = performance.now();

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: eventId, photoId } = params;

  // 1. Verify Event ownership (privacy-preserving 404)
  const tEvent0 = performance.now();
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, creatorId: true },
  });
  const tEvent1 = performance.now();

  if (!event || event.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // 2. Verify Photo belongs to this Event (privacy-preserving 404)
  const tPhoto0 = performance.now();
  const photo = await prisma.eventPhoto.findUnique({
    where: { id: photoId },
    select: { id: true, eventId: true },
  });
  const tPhoto1 = performance.now();

  if (!photo || photo.eventId !== eventId) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  // 3. Process photo server-side
  try {
    const routeTimings = {
      route_auth_ms: Math.round((tAuth1 - tAuth0) * 100) / 100,
      route_event_lookup_ms: Math.round((tEvent1 - tEvent0) * 100) / 100,
      route_photo_lookup_ms: Math.round((tPhoto1 - tPhoto0) * 100) / 100,
    };
    const result = await processEventPhoto(photoId, session.user.id, routeTimings);
    const tRouteEnd = performance.now();
    const routeTotalMs = Math.round((tRouteEnd - tAuth0) * 100) / 100;
    const timings = result.timings || {};

    const serverTimingValue = [
      `auth;dur=${timings.route_auth_ms || 0}`,
      `event_db;dur=${timings.route_event_lookup_ms || 0}`,
      `photo_db;dur=${timings.route_photo_lookup_ms || 0}`,
      `r2_read;dur=${timings.r2_original_read_ms || 0}`,
      `face_roundtrip;dur=${timings.face_service_roundtrip_ms || 0}`,
      `face_backend_total;dur=${timings.face_service_total_ms || 0}`,
      `model_inference;dur=${timings.face_service_inference_ms || 0}`,
      `decode;dur=${timings.face_service_decode_ms || 0}`,
      `postprocess;dur=${timings.face_service_postprocess_ms || 0}`,
      `transport_overhead;dur=${timings.network_transport_overhead_ms || 0}`,
      `db_tx;dur=${timings.ready_transaction_ms || 0}`,
      `route_total;dur=${routeTotalMs}`,
    ].join(', ');

    const res = NextResponse.json({
      photo: {
        id: result.photoId,
        processingStatus: result.processingStatus,
        processingError: result.processingError,
        faceCount: result.faceCount,
      },
    });

    res.headers.set('Server-Timing', serverTimingValue);
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Processing failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
