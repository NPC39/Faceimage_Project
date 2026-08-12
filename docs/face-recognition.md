# Face Recognition Service Foundation Architecture (Phase 7)

## Overview

The Face Recognition Service is an independently testable Python FastAPI component utilizing InsightFace and ONNX Runtime to perform high-precision face detection, feature landmark extraction, and 512-dimensional vector embedding generation.

The foundation is designed CPU-first to ensure compatibility across standard development hardware without mandatory CUDA/GPU dependencies.

```mermaid
flowchart LR
    A[Image Upload] --> B[FastAPI Endpoint]
    B --> C[Image Validation & Decoding]
    C --> D[InsightFace Model Loader]
    D --> E[ONNX Runtime CPU Inference]
    E --> F[Face Detection & Bounding Boxes]
    F --> G[L2-Normalized Embedding Vector]
    G --> H[Pydantic Structured JSON Response]
```

---

## Technical AI Stack

* **Language**: Python 3.11+
* **Framework**: FastAPI + Uvicorn
* **AI Model Pipeline**: InsightFace Model Pack (`buffalo_l`)
* **Inference Engine**: ONNX Runtime (`CPUExecutionProvider`)
* **Computer Vision Tools**: OpenCV (headless) & NumPy & Pillow

---

## Model Selection & Cache Strategy

### Selected Model Pack: `buffalo_l`

* **Detector**: `det_10g.onnx` (SCRFD Face Detector)
* **Recognizer**: `w600k_r50.onnx` (ArcFace ResNet50)
* **Landmarks**: `2d106det.onnx`, `1k3d68.onnx`
* **Attribute Predictor**: `genderage.onnx`

### Model Download & Storage

* Model binaries are downloaded automatically on first initialization and cached in `~/.insightface/models/buffalo_l/`.
* Model files are **excluded** from Git version control (`.gitignore`).
* In Docker, model files are persisted using a dedicated named volume (`insightface_models:/root/.insightface`).

---

## Service Layer & Application Lifecycle

* **Single Instance Model Loading**: The model is loaded ONCE during application startup using a `FaceModelLoader` singleton class wrapped in FastAPI `lifespan`. Endpoint invocations do not reload or download the model per request.
* **Health Readiness**: `/health` and `/api/v1/health` include a `face_model` readiness status field ("ready" or "not_ready").

---

## Core Vision Conventions

### Bounding Boxes

Bounding boxes use integer pixel coordinates relative to original decoded image dimensions:

$$ \text{bbox} = \{ \text{x1}: \text{left}, \text{y1}: \text{top}, \text{x2}: \text{right}, \text{y2}: \text{bottom} \} $$

Coordinates are clamped to valid pixel ranges $[0, \text{width}]$ and $[0, \text{height}]$.

### Face Embeddings

* **Dimension**: 512-dimensional float vector ($d = 512$).
* **Normalization**: All embedding vectors are L2-normalized:
  $$\hat{\mathbf{v}} = \frac{\mathbf{v}}{\|\mathbf{v}\|_2} = \frac{\mathbf{v}}{\sqrt{\sum_{i=1}^{512} v_i^2}}$$
* **JSON Serialization**: Converted to standard Python `float` lists rounded to 6 decimal places.

### Zero-Face & Multi-Face Behavior

* If **0 faces** are detected, the service returns a `200 OK` response with `"face_count": 0` and `"faces": []`. Zero face detection is a valid computer vision result.
* If **multiple faces** are present, all detected faces are returned in the response array.
* **Primary Face Selection**: For single-face operations (e.g. selfie search in Phase 9), the primary face is deterministically selected using largest bounding box area:
  $$\text{Area} = (x_2 - x_1) \times (y_2 - y_1)$$

### Cosine Similarity Utility

Cosine similarity between two embedding vectors $\mathbf{a}$ and $\mathbf{b}$ is computed as:

$$\text{similarity}(\mathbf{a}, \mathbf{b}) = \frac{\mathbf{a} \cdot \mathbf{b}}{\|\mathbf{a}\|_2 \|\mathbf{b}\|_2}$$

* Handles dimension mismatch validation and divide-by-zero protection safely.
* Clamped strictly within $[-1.0, 1.0]$.

---

## Biometric Privacy & Security

* **No Image Storage**: Image bytes are decoded directly in memory and discarded after request completion.
* **No Biometric Logging**: Facial embeddings, image bytes, and raw face crops are NEVER printed to log files or persistent stdout.
* **Internal Service Scoping**: Embedding extraction endpoints (`/api/v1/faces/embed`) are internal service APIs protected by `X-Internal-API-Key`. In Phase 8, Next.js communicates server-to-server with these endpoints to populate `DetectedFace` records. Customer-facing web clients never receive raw biometric vectors. See [docs/photo-processing.md](file:///Users/nppn/Desktop/Project/docs/photo-processing.md).


---

## Development Performance Baseline (CPU)

* **Model Initialization**: ~1.5 – 3.0s (once at startup)
* **Single Image Inference**: ~80 – 180ms per photo (640x640 resolution on standard CPU)
* **Concurrency**: Thread-safe single process execution on FastAPI Uvicorn worker.
