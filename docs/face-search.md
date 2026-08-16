# Event-Scoped Face Search Architecture (Phase 9)

## Overview & Privacy Boundary

Phase 9 introduces the **Event-Scoped Face Search API**, allowing customers to search for their photos within a specific `PUBLISHED` Event by uploading a single selfie image.

```mermaid
flowchart LR
    A[Customer Selfie] --> B[Next.js Search API]
    B --> C[FastAPI InsightFace Service]
    C --> D[512D Query Embedding]
    D --> E[Event-Scoped DetectedFace Query]
    E --> F[Cosine Similarity Calculation]
    F --> G[Threshold Filter >= 0.40]
    G --> H[Deduplicate EventPhoto]
    H --> I[Ranked Safe Result Payload]
```

### Core Privacy Guarantees

1. **Strict Event Isolation**: Searches are strictly bounded to candidate faces belonging to the target Event (`photo.eventId === targetEvent.id`). Cross-event matching, global person profiles, and identity clustering across events are strictly prohibited.
2. **Ephemeral Selfie Processing**: Uploaded selfie bytes and extracted query face embeddings are processed strictly in memory and discarded when the request completes. Selfies are NEVER saved to disk, private photo storage, or database.
3. **Safe DTO Payload**: Search responses return only safe `photoId` references and result counts. Facial embedding vectors, private storage keys, and internal service credentials are NEVER exposed to the client.
4. **Searchable Event Policy**: Face search is enabled ONLY for `PUBLISHED` events. Searching `DRAFT` or `ARCHIVED` events returns a privacy-preserving `404 Event Not Found`.

---

## Technical Stack & Configuration

* **Query Embedding Engine**: InsightFace `buffalo_l` (ArcFace ResNet50) via FastAPI server-to-server HTTP API
* **Embedding Vector**: 512-dimensional L2-normalized float32 vector ($d = 512$)
* **Similarity Metric**: Cosine Similarity / Dot Product ($S = \mathbf{q} \cdot \mathbf{c}$)
* **Match Threshold**: `FACE_MATCH_THRESHOLD` (Production value: `0.40`, validated on Stage A & held-out Stage B datasets)
* **Max Upload Size**: `MAX_SELFIE_UPLOAD_MB` (Default: `10 MB`)
* **Result Limit**: `FACE_SEARCH_MAX_RESULTS` (Default: `100`)
* **Memory Batch Size**: `FACE_SEARCH_BATCH_SIZE` (Default: `500` candidate faces per DB read batch)

---

## Processing Workflow

1. **Event Resolution**: Next.js receives `POST /api/public/events/[slug]/face-search` and queries `prisma.event.findUnique({ where: { slug } })`. Rejects if `status !== 'PUBLISHED'`.
2. **Server-to-Server Embedding**: Selfie image buffer is sent to FastAPI `POST /api/v1/faces/embed` using `FaceServiceClient`.
3. **Primary Face Selection**: If multiple faces exist in the selfie, the service deterministically selects the **primary face** based on largest bounding box area:
   $$\text{Area} = (x_2 - x_1) \times (y_2 - y_1)$$
   If zero faces are detected, the API returns HTTP `422 Unprocessable Entity` (`NO_FACE_DETECTED`).
4. **Memory-Bounded Candidate Querying**:
   Loads candidate `DetectedFace` rows in batches of 500 where `photo.eventId === event.id` and `photo.processingStatus === READY`.
5. **Similarity, Ambiguity Guard & Deduplication**:
   - Computes `cosineSimilarity(queryVector, candidateVector)` for all detected faces in candidate photos.
   - For each candidate photo, identifies highest similarity score ($\text{top}_1$) and second highest score ($\text{top}_2$, if present).
   - Requires $\text{top}_1 \ge 0.40$.
   - **Multi-Face Ambiguity Guard**: If both $\text{top}_1 \ge 0.40$ AND $\text{top}_2 \ge 0.40$, requires $\text{margin} = (\text{top}_1 - \text{top}_2) \ge 0.002$. Rejects ambiguous multi-face matches where $\text{margin} < 0.002$ (`AMBIGUOUS_REJECT`) to protect identity precision.
   - For accepted photos, uses $\text{top}_1$ similarity score as the photo score.
6. **Ranking & Truncation**:
   Sorts matching photos by score descending (tie-broken deterministically by `photoId ASC`) and returns the top 100 photo IDs.

---

## API Endpoints

### `POST /api/public/events/[slug]/face-search`

**Request**: `multipart/form-data`
* `selfie`: Image file (`image/jpeg`, `image/png`, `image/webp`, max 10 MB)

**Response `200 OK`**:
```json
{
  "event": {
    "slug": "graduation-2026-a487ee"
  },
  "resultCount": 2,
  "results": [
    {
      "photoId": "ph_cmspzu9e80003kad5y9cvpvvw",
      "rank": 1
    },
    {
      "photoId": "ph_cmspzu9e80004kad5y9cvpvvx",
      "rank": 2
    }
  ]
}
```

**Error Responses**:
* `404 Not Found` (`EVENT_NOT_FOUND`): Event slug does not exist, or event is `DRAFT` / `ARCHIVED`.
* `422 Unprocessable Entity` (`NO_FACE_DETECTED`): No face detected in uploaded selfie.
* `400 Bad Request` (`INVALID_IMAGE` / `IMAGE_TOO_LARGE` / `UNSUPPORTED_FORMAT`): Invalid image payload.
* `503 Service Unavailable` (`FACE_SERVICE_UNAVAILABLE`): FastAPI recognition service unreachable or timed out.
