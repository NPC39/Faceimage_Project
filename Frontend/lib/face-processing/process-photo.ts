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
}

export async function processEventPhoto(
  photoId: string,
  creatorId: string
): Promise<ProcessPhotoResult> {
  // 1. Verify photo existence and creator ownership
  const photo = await prisma.eventPhoto.findUnique({
    where: { id: photoId },
    include: { event: { select: { creatorId: true, id: true } } },
  });

  if (!photo || photo.event.creatorId !== creatorId) {
    throw new Error('Photo not found or unauthorized');
  }

  // 2. Atomic process claim: only transition if status is UPLOADED or FAILED
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
    const originalBuffer = await storageProvider.readObject(photo.originalKey);


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
    const aiResponse = await faceServiceClient.embedFaces(originalBuffer, 'original.jpg');

    // 5. Persist face records & mark READY inside transaction
    const faceCount = aiResponse.face_count;
    const detectedFacesData = aiResponse.faces.map((face) => ({
      photoId,
      boundingBox: face.bbox,
      confidence: face.confidence,
      embedding: face.embedding,
    }));

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

    return {
      success: true,
      photoId,
      processingStatus: PhotoProcessingStatus.READY,
      processingError: null,
      faceCount,
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
