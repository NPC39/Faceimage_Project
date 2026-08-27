import logging
import math
from typing import List, Dict, Optional, Tuple, Any
import numpy as np
from io import BytesIO
from PIL import Image, ImageOps


from app.core.config import settings
from app.services.face_model import face_model_loader

logger = logging.getLogger(__name__)


class ImageValidationError(ValueError):
    """Exception raised when uploaded image fails validation."""
    pass


class ModelUnavailableError(RuntimeError):
    """Exception raised when face recognition model is not available."""
    pass


def decode_image(image_bytes: bytes) -> np.ndarray:
    """Validate and decode image bytes into a BGR numpy array suitable for InsightFace.

    Validates:
    - Non-empty payload
    - Max size limit (MAX_FACE_IMAGE_MB)
    - Decodable JPEG/PNG/WebP format
    - Maximum pixel count safety (MAX_IMAGE_PIXELS)
    """
    if not image_bytes:
        raise ImageValidationError("Uploaded image file is empty.")

    max_bytes = settings.MAX_FACE_IMAGE_MB * 1024 * 1024
    if len(image_bytes) > max_bytes:
        raise ImageValidationError(
            f"Image file size ({len(image_bytes) / (1024*1024):.1f} MB) exceeds maximum allowed size of {settings.MAX_FACE_IMAGE_MB} MB."
        )

    try:
        pil_img = Image.open(BytesIO(image_bytes))
        pil_img = ImageOps.exif_transpose(pil_img)
        pil_img = pil_img.convert("RGB")
        rgb_arr = np.array(pil_img, dtype=np.uint8)
    except Exception as e:
        raise ImageValidationError("Corrupt or unsupported image format. Supported formats are JPEG, PNG, and WebP.") from e

    if rgb_arr is None or rgb_arr.size == 0:
        raise ImageValidationError("Corrupt or unsupported image format. Unable to decode image pixels.")

    height, width = rgb_arr.shape[:2]
    total_pixels = height * width
    if total_pixels > settings.MAX_IMAGE_PIXELS:
        raise ImageValidationError(
            f"Image dimensions ({width}x{height} = {total_pixels} pixels) exceed maximum allowed limit of {settings.MAX_IMAGE_PIXELS} pixels."
        )

    # Convert RGB numpy array to BGR for InsightFace
    bgr_arr = rgb_arr[:, :, ::-1].copy()
    return bgr_arr



def l2_normalize(embedding: np.ndarray) -> np.ndarray:
    """L2-normalize a numpy embedding vector."""
    if embedding is None:
        return np.zeros(512, dtype=np.float32)

    vec = np.asarray(embedding, dtype=np.float32)
    norm = np.linalg.norm(vec)
    if norm == 0 or np.isnan(norm) or np.isinf(norm):
        return np.zeros_like(vec)
    return vec / norm


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Calculate cosine similarity between two float vectors.

    Requirements:
    - Equal dimensions
    - Division by zero protection
    - Returns float in [-1.0, 1.0] (clamped)
    """
    if not vec_a or not vec_b:
        raise ValueError("Vectors cannot be empty for cosine similarity calculation.")
    if len(vec_a) != len(vec_b):
        raise ValueError(f"Vector dimension mismatch: {len(vec_a)} vs {len(vec_b)}.")

    a = np.asarray(vec_a, dtype=np.float32)
    b = np.asarray(vec_b, dtype=np.float32)

    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)

    if norm_a == 0 or norm_b == 0 or np.isnan(norm_a) or np.isnan(norm_b):
        return 0.0

    similarity = float(np.dot(a, b) / (norm_a * norm_b))
    # Clamp to valid cosine range
    return max(-1.0, min(1.0, similarity))


def select_primary_face(faces: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Select the primary face from a list of face dictionaries based on largest bounding box area.

    Each face dictionary must contain a 'bbox' field with keys: x1, y1, x2, y2.
    """
    if not faces:
        return None

    def get_area(face: Dict[str, Any]) -> float:
        bbox = face.get("bbox", {})
        if isinstance(bbox, dict):
            w = max(0, bbox.get("x2", 0) - bbox.get("x1", 0))
            h = max(0, bbox.get("y2", 0) - bbox.get("y1", 0))
            return float(w * h)
        return 0.0

    return max(faces, key=get_area)


import time


def analyze_image_detailed(image_bytes: bytes, include_embeddings: bool = False) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    """Decode image bytes, measure stage timings, and perform InsightFace detection/embedding extraction.

    Returns tuple of (list of face dictionaries, dict of stage timings in milliseconds).
    Timings include: decode_ms, model_inference_ms, postprocess_ms.
    """
    t_decode_0 = time.perf_counter()
    img = decode_image(image_bytes)
    t_decode_1 = time.perf_counter()
    decode_ms = round((t_decode_1 - t_decode_0) * 1000, 2)

    if not face_model_loader.is_ready():
        success = face_model_loader.initialize()
        if not success or not face_model_loader.is_ready():
            err_msg = face_model_loader.get_error() or "Face recognition service is currently unavailable."
            raise ModelUnavailableError(err_msg)

    app = face_model_loader.get_model()
    if app is None:
        raise ModelUnavailableError("Face recognition model is not loaded.")

    t_inf_0 = time.perf_counter()
    try:
        raw_faces = app.get(img)
    except Exception as e:
        logger.error(f"Inference error during InsightFace detection: {e}", exc_info=True)
        raise RuntimeError("Internal face detection inference failure.") from e
    t_inf_1 = time.perf_counter()
    model_inference_ms = round((t_inf_1 - t_inf_0) * 1000, 2)

    t_post_0 = time.perf_counter()
    height, width = img.shape[:2]
    faces_output: List[Dict[str, Any]] = []

    for face in raw_faces:
        bbox = face.bbox.astype(int)
        x1 = max(0, min(int(bbox[0]), width))
        y1 = max(0, min(int(bbox[1]), height))
        x2 = max(0, min(int(bbox[2]), width))
        y2 = max(0, min(int(bbox[3]), height))

        confidence = float(face.det_score)

        face_dict: Dict[str, Any] = {
            "bbox": {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2
            },
            "confidence": round(confidence, 6)
        }

        if include_embeddings:
            raw_emb = getattr(face, "normed_embedding", None)
            if raw_emb is None:
                raw_emb = getattr(face, "embedding", None)

            if raw_emb is not None:
                norm_emb = l2_normalize(raw_emb)
                face_dict["embedding"] = [round(float(val), 6) for val in norm_emb.tolist()]
            else:
                face_dict["embedding"] = [0.0] * 512

        faces_output.append(face_dict)
    t_post_1 = time.perf_counter()
    postprocess_ms = round((t_post_1 - t_post_0) * 1000, 2)

    timings = {
        "decode_ms": decode_ms,
        "model_inference_ms": model_inference_ms,
        "postprocess_ms": postprocess_ms,
    }

    return faces_output, timings


def analyze_image(image_bytes: bytes, include_embeddings: bool = False) -> List[Dict[str, Any]]:
    """Decode image bytes and perform InsightFace detection/embedding extraction.

    Returns list of face dictionaries.
    """
    faces_output, _ = analyze_image_detailed(image_bytes, include_embeddings=include_embeddings)
    return faces_output
