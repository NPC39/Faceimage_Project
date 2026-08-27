import { z } from 'zod';

export const BoundingBoxSchema = z.object({
  x1: z.number().int(),
  y1: z.number().int(),
  x2: z.number().int(),
  y2: z.number().int(),
});

export const FaceEmbeddingSchema = z.object({
  bbox: BoundingBoxSchema,
  confidence: z.number().min(0).max(1),
  embedding: z.array(z.number().refine((val) => Number.isFinite(val), { message: 'Embedding must contain finite numbers' })).length(512),
});

export const FaceEmbedResponseSchema = z.object({
  face_count: z.number().int().min(0),
  faces: z.array(FaceEmbeddingSchema),
  inference_ms: z.number().nonnegative(),
  roundtrip_ms: z.number().optional(),
});

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type FaceEmbedding = z.infer<typeof FaceEmbeddingSchema>;
export type FaceEmbedResponse = z.infer<typeof FaceEmbedResponseSchema>;

export class FaceServiceError extends Error {
  constructor(message: string, public code: string = 'FACE_SERVICE_ERROR', public statusCode?: number) {
    super(message);
    this.name = 'FaceServiceError';
  }
}

export class FaceServiceClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor() {
    this.baseUrl = process.env.FACE_SERVICE_URL || 'http://localhost:8000';
    this.apiKey = process.env.FACE_SERVICE_API_KEY || '';
    this.timeoutMs = parseInt(process.env.FACE_SERVICE_TIMEOUT_MS || '60000', 10);
  }

  async embedFaces(imageBuffer: Buffer, filename: string = 'photo.jpg'): Promise<FaceEmbedResponse> {
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new FaceServiceError('Image buffer is empty', 'INVALID_IMAGE', 400);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // Build multipart/form-data payload
      const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', blob, filename);

      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['X-Internal-API-Key'] = this.apiKey;
      }

      const endpointUrl = `${this.baseUrl.replace(/\/$/, '')}/api/v1/faces/embed`;
      const t0 = performance.now();
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });
      const t1 = performance.now();
      const roundtripMs = t1 - t0;

      if (!response.ok) {
        let errorDetail = response.statusText;
        try {
          const errJson = await response.json();
          if (errJson.detail) errorDetail = errJson.detail;
        } catch {
          // Fallback to HTTP status text
        }

        if (response.status === 401 || response.status === 403) {
          throw new FaceServiceError(`Face service authentication failed: ${errorDetail}`, 'FACE_SERVICE_UNAUTHORIZED', response.status);
        }
        if (response.status === 400) {
          throw new FaceServiceError(`Invalid image payload: ${errorDetail}`, 'INVALID_IMAGE', 400);
        }
        if (response.status === 503) {
          throw new FaceServiceError(`Face service unavailable: ${errorDetail}`, 'FACE_SERVICE_UNAVAILABLE', 503);
        }
        throw new FaceServiceError(`Face service error (${response.status}): ${errorDetail}`, 'FACE_SERVICE_ERROR', response.status);
      }

      const json = await response.json();
      const parseResult = FaceEmbedResponseSchema.safeParse(json);

      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new FaceServiceError(`Malformed face service response: ${issues}`, 'INVALID_FACE_RESPONSE');
      }

      return {
        ...parseResult.data,
        roundtrip_ms: Math.round(roundtripMs * 100) / 100,
      };

    } catch (err: unknown) {
      if (err instanceof FaceServiceError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new FaceServiceError(`Face service request timed out after ${this.timeoutMs}ms`, 'FACE_SERVICE_TIMEOUT', 504);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new FaceServiceError(`Failed to communicate with face service: ${msg}`, 'FACE_SERVICE_UNREACHABLE');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const faceServiceClient = new FaceServiceClient();
