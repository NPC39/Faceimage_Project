import { prisma } from '@/lib/prisma';
import { EventStatus, PhotoProcessingStatus } from '@prisma/client';
import { faceServiceClient } from '@/lib/face-processing/face-service-client';
import { cosineSimilarity } from './cosine-similarity';

export class FaceSearchError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'FaceSearchError';
  }
}

export interface SearchResultItem {
  photoId: string;
  rank: number;
}

export interface SearchEventFacesResponse {
  event: {
    slug: string;
  };
  resultCount: number;
  results: SearchResultItem[];
}

/**
 * Executes an event-scoped face search using an ephemeral selfie image payload.
 *
 * Security & Privacy Guarantees:
 * - Search is strictly scoped to the target Event (`photo.eventId === event.id`).
 * - Only photos with `processingStatus === READY` participate in the candidate pool.
 * - Public search requires `event.status === PUBLISHED`. Draft/Archived events return 404.
 * - Selfie bytes and query embeddings are processed strictly in memory and discarded.
 * - No raw embeddings, storage keys, or private metadata are returned to the caller.
 */
export async function searchEventFaces(
  eventSlug: string,
  selfieBuffer: Buffer
): Promise<SearchEventFacesResponse> {
  if (!eventSlug || typeof eventSlug !== 'string') {
    throw new FaceSearchError('INVALID_SLUG', 'Event slug is required.', 400);
  }

  if (!selfieBuffer || !Buffer.isBuffer(selfieBuffer) || selfieBuffer.length === 0) {
    throw new FaceSearchError('INVALID_IMAGE', 'Selfie payload is empty or invalid.', 400);
  }

  const maxSelfieBytes = (parseInt(process.env.MAX_SELFIE_UPLOAD_MB || '10', 10)) * 1024 * 1024;
  if (selfieBuffer.length > maxSelfieBytes) {
    throw new FaceSearchError(
      'IMAGE_TOO_LARGE',
      `Selfie file size exceeds maximum limit of ${process.env.MAX_SELFIE_UPLOAD_MB || 10} MB.`,
      400
    );
  }

  // 1. Resolve Target Event (Strictly PUBLISHED)
  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    select: { id: true, slug: true, status: true }
  });

  if (!event || event.status !== EventStatus.PUBLISHED) {
    // Privacy-preserving 404 response for non-existent, DRAFT, or ARCHIVED events
    throw new FaceSearchError('EVENT_NOT_FOUND', 'Event not found or unavailable for search.', 404);
  }

  // 2. Extract Query Face Embedding Server-to-Server
  let faceResponse;
  try {
    faceResponse = await faceServiceClient.embedFaces(selfieBuffer, 'selfie.jpg');
  } catch (err: any) {
    if (err.name === 'FaceServiceClientError') {
      throw new FaceSearchError(err.code, err.message, err.statusCode >= 500 ? 503 : 400);
    }
    throw new FaceSearchError('SEARCH_UNAVAILABLE', 'Face recognition service failed to process selfie.', 503);
  }

  if (faceResponse.face_count === 0 || !faceResponse.faces || faceResponse.faces.length === 0) {
    throw new FaceSearchError(
      'NO_FACE_DETECTED',
      "We couldn't detect a face in this photo. Please upload a clear frontal portrait photo.",
      422
    );
  }

  // 3. Primary Face Selection (Largest Bounding Box Area)
  let primaryFace = faceResponse.faces[0];
  let maxArea = -1;

  for (const face of faceResponse.faces) {
    const width = Math.max(0, face.bbox.x2 - face.bbox.x1);
    const height = Math.max(0, face.bbox.y2 - face.bbox.y1);
    const area = width * height;
    if (area > maxArea) {
      maxArea = area;
      primaryFace = face;
    }
  }

  const queryEmbedding = primaryFace.embedding;

  if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 512) {
    throw new FaceSearchError('INVALID_FACE_RESPONSE', 'Query face embedding has invalid dimensions.', 500);
  }

  // 4. Candidate Querying, Cosine Similarity & Threshold Filtering
  const matchThreshold = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.60');
  const maxResults = parseInt(process.env.FACE_SEARCH_MAX_RESULTS || '100', 10);
  const batchSize = parseInt(process.env.FACE_SEARCH_BATCH_SIZE || '500', 10);

  const photoScores = new Map<string, number>();
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const candidateFaces = await prisma.detectedFace.findMany({
      where: {
        photo: {
          eventId: event.id,
          processingStatus: PhotoProcessingStatus.READY
        }
      },
      select: {
        photoId: true,
        embedding: true
      },
      take: batchSize,
      skip: skip
    });

    if (candidateFaces.length === 0) {
      hasMore = false;
      break;
    }

    for (const candidate of candidateFaces) {
      if (!Array.isArray(candidate.embedding) || candidate.embedding.length !== 512) {
        continue;
      }

      try {
        const simScore = cosineSimilarity(queryEmbedding, candidate.embedding);
        if (simScore >= matchThreshold) {
          const currentMax = photoScores.get(candidate.photoId) || -Infinity;
          if (simScore > currentMax) {
            photoScores.set(candidate.photoId, simScore);
          }
        }
      } catch {
        // Skip invalid candidates gracefully
        continue;
      }
    }

    skip += candidateFaces.length;
    if (candidateFaces.length < batchSize) {
      hasMore = false;
    }
  }

  // 5. Ranking & Deduplication
  const sortedPhotos = Array.from(photoScores.entries())
    .map(([photoId, score]) => ({ photoId, score }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.photoId.localeCompare(b.photoId); // Deterministic tie-breaking
    })
    .slice(0, maxResults);

  const results: SearchResultItem[] = sortedPhotos.map((item, index) => ({
    photoId: item.photoId,
    rank: index + 1
  }));

  return {
    event: {
      slug: event.slug
    },
    resultCount: results.length,
    results
  };
}
