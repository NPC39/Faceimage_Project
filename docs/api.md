# API Specification — Face Recognition Service (Phase 7)

## Base URL

* Local Development: `http://localhost:8000`
* API Path Prefix: `/api/v1`

---

## Endpoints Summary

| Method | Path | Summary | Access |
|---|---|---|---|
| `GET` | `/health` | Top-level system health & model status | Public |
| `GET` | `/api/v1/health` | Versioned system health & model status | Public |
| `POST` | `/api/v1/faces/detect` | Detect faces & bounding boxes in an image | Internal / Service |
| `POST` | `/api/v1/faces/embed` | Extract face detection & 512-dim embeddings | Internal / Service |
| `POST` | `/api/v1/faces/compare` | Compare primary faces from two images | Internal / Dev |

---

## 1. GET /health

Returns current application status and face recognition model readiness.

### Response `200 OK`

```json
{
  "status": "ok",
  "service": "photo-marketplace-backend",
  "version": "0.1.0",
  "timestamp": "2026-08-12T12:00:00.000000+00:00",
  "face_model": "ready"
}
```

---

## 2. POST /api/v1/faces/detect

Detects all faces in an uploaded image and returns bounding box coordinates and detection confidence.

### Request Body (`multipart/form-data`)

* `file`: Image file (`image/jpeg`, `image/png`, `image/webp`, max 20 MB)

### Response `200 OK`

```json
{
  "face_count": 2,
  "faces": [
    {
      "bbox": {
        "x1": 120,
        "y1": 85,
        "x2": 250,
        "y2": 240
      },
      "confidence": 0.998245
    },
    {
      "bbox": {
        "x1": 340,
        "y1": 110,
        "x2": 460,
        "y2": 260
      },
      "confidence": 0.984112
    }
  ],
  "inference_ms": 112.45
}
```

---

## 3. POST /api/v1/faces/embed

Internal service endpoint for face detection and L2-normalized 512-dimensional vector embedding extraction.

> [!NOTE]
> Internal service endpoint only. Facial embeddings are never exposed directly to end-user clients.

### Request Body (`multipart/form-data`)

* `file`: Image file (`image/jpeg`, `image/png`, `image/webp`, max 20 MB)

### Response `200 OK`

```json
{
  "face_count": 1,
  "faces": [
    {
      "bbox": {
        "x1": 100,
        "y1": 80,
        "x2": 260,
        "y2": 270
      },
      "confidence": 0.997812,
      "embedding": [
        0.012345,
        -0.087123,
        0.045612,
        "... truncated 509 dimensions ..."
      ]
    }
  ],
  "inference_ms": 145.20
}
```

---

## 4. POST /api/v1/faces/compare

Internal development endpoint that compares the primary (largest) face from two uploaded images and returns a cosine similarity score.

### Request Body (`multipart/form-data`)

* `file_a`: First image file
* `file_b`: Second image file

### Response `200 OK`

```json
{
  "image_a_face_count": 1,
  "image_b_face_count": 2,
  "similarity": 0.8452,
  "face_a_selected": true,
  "face_b_selected": true,
  "inference_ms": 235.10
}
```

---

## Error Handling

| Status Code | Error Condition | Detail Example |
|---|---|---|
| `400 Bad Request` | Empty, corrupt, or unsupported image | `"Corrupt or unsupported image format."` |
| `400 Bad Request` | File size exceeds max limit | `"Image file size exceeds maximum allowed size of 20 MB."` |
| `503 Service Unavailable` | Face model fails to initialize | `"Face recognition service is initializing or unavailable."` |
| `500 Internal Server Error` | Model inference crash | `"Internal face processing failure."` |
