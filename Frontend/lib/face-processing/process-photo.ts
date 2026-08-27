import { prisma } from '@/lib/prisma';
import { getStorageProvider } from '@/lib/storage';
import { faceServiceClient, FaceServiceError } from './face-service-client';
import { PhotoProcessingStatus } from '@prisma/client';

export interface ProcessPhotoResult {
  success: boolean;
  photoId: string;
  processingStatus: PhotoProcessingStatus;
  processingError: string | null;
  faceCount: number;
  timings?: Record<string, number>;
}

export async function processEventPhoto(
  photoId: string,
  creatorId: string,
  routeTimings?: { route_auth_ms?: number; route_event_lookup_ms?: number; route_photo_lookup_ms?: number }
): Promise<ProcessPhotoResult> {
  const tProcStart = performance.now();

  // 1. Verify photo existence and creator ownership
  const tPhotoLookup0 = performance.now();
  const photo = await prisma.eventPhoto.findUnique({
    where: { id: photoId },
    include: { event: { select: { creatorId: true, id: true } } },
  });
  const tPhotoLookup1 = performance.now();

  if (!photo || photo.event.creatorId !== creatorId) {
    throw new Error('Photo not found or unauthorized');
  }

  // 2. Atomic process claim: only transition if status is UPLOADED or FAILED
  const tClaim0 = performance.now();
  const claimResult = await prisma.eventPhoto.updateMany({
    where: {
      id: photoId,
      processingStatus: { in: [PhotoProcessingStatus.UPLOADED, PhotoProcessingStatus.FAILED] },
    },
    data: {
      processingStatus: PhotoProcessingStatus.PROCESSING,
      processingError: null,
    },
  });
  const tClaim1 = performance.now();

  if (claimResult.count === 0) {
    // Re-query current state to return exact status
    const currentPhoto = await prisma.eventPhoto.findUnique({
      where: { id: photoId },
      include: { _count: { select: { detectedFaces: true } } },
    });

    if (!currentPhoto) {
      throw new Error('Photo not found');
    }

    return {
      success: currentPhoto.processingStatus === PhotoProcessingStatus.READY,
      photoId: currentPhoto.id,
      processingStatus: currentPhoto.processingStatus,
      processingError: currentPhoto.processingError,
      faceCount: currentPhoto._count.detectedFaces,
    };
  }

  // 3. Process private original image
  try {
    const storageProvider = getStorageProvider();
    const tR2Read0 = performance.now();
    const originalBuffer = await storageProvider.readObject(photo.originalKey);
    const tR2Read1 = performance.now();

    if (!originalBuffer || originalBuffer.length === 0) {
      await prisma.eventPhoto.update({
        where: { id: photoId },
        data: {
          processingStatus: PhotoProcessingStatus.FAILED,
          processingError: 'ORIGINAL_NOT_FOUND',
        },
      });
      return {
        success: false,
        photoId,
        processingStatus: PhotoProcessingStatus.FAILED,
        processingError: 'ORIGINAL_NOT_FOUND',
        faceCount: 0,
      };
    }

    // 4. Send image bytes to FastAPI Face Service (server-to-server)
    const tAi0 = performance.now();
    const aiResponse = await faceServiceClient.embedFaces(originalBuffer, 'original.jpg');
    const tAi1 = performance.now();

    const faceRoundtripMs = aiResponse.roundtrip_ms ?? (tAi1 - tAi0);
    const faceServiceTotalMs = aiResponse.timings?.total_ms ?? aiResponse.inference_ms;
    const faceInferenceMs = aiResponse.timings?.model_inference_ms ?? aiResponse.inference_ms;
    const faceDecodeMs = aiResponse.timings?.decode_ms ?? 0;
    const facePostprocessMs = aiResponse.timings?.postprocess_ms ?? 0;
    const faceReadMs = aiResponse.timings?.request_read_ms ?? 0;
    const serverNonModelMs = Math.max(0, faceServiceTotalMs - faceInferenceMs);
    const networkTransportOverheadMs = Math.max(0, faceRoundtripMs - faceServiceTotalMs);

    // Invariant check: model_inference <= face_service_total <= face_service_roundtrip
    const invariantViolated =
      faceInferenceMs > faceServiceTotalMs + 5.0 ||
      faceServiceTotalMs > faceRoundtripMs + 5.0;

    if (invariantViolated) {
      try {
        console.warn('[TIMING_INVARIANT_VIOLATION]', JSON.stringify({
          photoLabel: photoId.slice(-8),
          faceInferenceMs,
          faceServiceTotalMs,
          faceRoundtripMs,
        }));
      } catch {}
    }

    // 5. Persist face records & mark READY inside transaction
    const faceCount = aiResponse.face_count;
    const detectedFacesData = aiResponse.faces.map((face) => ({
      photoId,
      boundingBox: face.bbox,
      confidence: face.confidence,
      embedding: face.embedding,
    }));

    const tTx0 = performance.now();
    await prisma.$transaction(async (tx) => {
      // Clear previous faces on retry for idempotency
      await tx.detectedFace.deleteMany({
        where: { photoId },
      });

      if (detectedFacesData.length > 0) {
        await tx.detectedFace.createMany({
          data: detectedFacesData,
        });
      }

      await tx.eventPhoto.update({
        where: { id: photoId },
        data: {
          processingStatus: PhotoProcessingStatus.READY,
          processingError: null,
        },
      });
    });
    const tTx1 = performance.now();

    const tProcEnd = performance.now();

    const timings = {
      route_auth_ms: routeTimings?.route_auth_ms ?? 0,
      route_event_lookup_ms: routeTimings?.route_event_lookup_ms ?? 0,
      route_photo_lookup_ms: routeTimings?.route_photo_lookup_ms ?? 0,
      photo_lookup_ms: Math.round((tPhotoLookup1 - tPhotoLookup0) * 100) / 100,
      atomic_claim_ms: Math.round((tClaim1 - tClaim0) * 100) / 100,
      r2_original_read_ms: Math.round((tR2Read1 - tR2Read0) * 100) / 100,
      face_service_roundtrip_ms: Math.round(faceRoundtripMs * 100) / 100,
      face_service_total_ms: Math.round(faceServiceTotalMs * 100) / 100,
      face_service_inference_ms: Math.round(faceInferenceMs * 100) / 100,
      face_service_decode_ms: Math.round(faceDecodeMs * 100) / 100,
      face_service_postprocess_ms: Math.round(facePostprocessMs * 100) / 100,
      face_service_read_ms: Math.round(faceReadMs * 100) / 100,
      server_non_model_ms: Math.round(serverNonModelMs * 100) / 100,
      network_transport_overhead_ms: Math.round(networkTransportOverheadMs * 100) / 100,
      ready_transaction_ms: Math.round((tTx1 - tTx0) * 100) / 100,
      process_total_ms: Math.round((tProcEnd - tProcStart) * 100) / 100,
      timing_invariant_violated: invariantViolated ? 1 : 0,
    };

    // Safe structured log
    try {
      console.log('[PHOTO_PERF]', JSON.stringify({
        stage: 'process',
        photoLabel: photoId.slice(-8),
        ...timings,
      }));
    } catch {}

    return {
      success: true,
      photoId,
      processingStatus: PhotoProcessingStatus.READY,
      processingError: null,
      faceCount,
      timings,
    };

  } catch (err: unknown) {
    const errorCode = err instanceof FaceServiceError ? err.code : 'PROCESSING_FAILED';

    await prisma.eventPhoto.update({
      where: { id: photoId },
      data: {
        processingStatus: PhotoProcessingStatus.FAILED,
        processingError: errorCode,
      },
    }).catch(() => {});

    return {
      success: false,
      photoId,
      processingStatus: PhotoProcessingStatus.FAILED,
      processingError: errorCode,
      faceCount: 0,
    };
  }
}
