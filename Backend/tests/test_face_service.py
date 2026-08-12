import pytest
import numpy as np
from io import BytesIO
from PIL import Image
from unittest.mock import patch, MagicMock

from app.core.config import settings
from app.services.face_service import (
    decode_image,
    l2_normalize,
    cosine_similarity,
    select_primary_face,
    analyze_image,
    ImageValidationError,
    ModelUnavailableError,
)
from app.services.face_model import FaceModelLoader


def create_test_image_bytes(width: int = 100, height: int = 100, format_name: str = "JPEG") -> bytes:
    """Helper to create valid image bytes in memory."""
    img = Image.new("RGB", (width, height), color=(128, 128, 128))
    buf = BytesIO()
    img.save(buf, format=format_name)
    return buf.getvalue()


# 1. Image Validation Tests

def test_decode_image_empty_bytes():
    with pytest.raises(ImageValidationError, match="empty"):
        decode_image(b"")


def test_decode_image_corrupt_bytes():
    with pytest.raises(ImageValidationError, match="Corrupt or unsupported"):
        decode_image(b"invalid corrupt header data 12345")


def test_decode_image_fake_extension():
    with pytest.raises(ImageValidationError, match="Corrupt or unsupported"):
        decode_image(b"GIF89a; not real image")


def test_decode_image_oversized_payload(monkeypatch):
    monkeypatch.setattr(settings, "MAX_FACE_IMAGE_MB", 1)
    fake_large_bytes = b"0" * (2 * 1024 * 1024)  # 2 MB > 1 MB limit
    with pytest.raises(ImageValidationError, match="exceeds maximum allowed size"):
        decode_image(fake_large_bytes)


def test_decode_image_excessive_dimensions(monkeypatch):
    monkeypatch.setattr(settings, "MAX_IMAGE_PIXELS", 1000)  # max 1000 pixels
    large_img_bytes = create_test_image_bytes(50, 50, "JPEG")  # 2500 pixels > 1000 limit
    with pytest.raises(ImageValidationError, match="exceed maximum allowed limit"):
        decode_image(large_img_bytes)



def test_decode_image_valid_jpeg():
    img_bytes = create_test_image_bytes(100, 100, "JPEG")
    arr = decode_image(img_bytes)
    assert isinstance(arr, np.ndarray)
    assert arr.shape == (100, 100, 3)


def test_decode_image_valid_png():
    img_bytes = create_test_image_bytes(120, 80, "PNG")
    arr = decode_image(img_bytes)
    assert isinstance(arr, np.ndarray)
    assert arr.shape == (80, 120, 3)


def test_decode_image_valid_webp():
    img_bytes = create_test_image_bytes(64, 64, "WEBP")
    arr = decode_image(img_bytes)
    assert isinstance(arr, np.ndarray)
    assert arr.shape == (64, 64, 3)


# 2. L2 Normalization Tests

def test_l2_normalize_zero_vector():
    vec = np.zeros(512, dtype=np.float32)
    normed = l2_normalize(vec)
    assert np.all(normed == 0)


def test_l2_normalize_unit_vector():
    vec = np.array([3.0, 4.0], dtype=np.float32)
    normed = l2_normalize(vec)
    assert pytest.approx(np.linalg.norm(normed), 1e-6) == 1.0
    assert pytest.approx(normed[0], 1e-6) == 0.6
    assert pytest.approx(normed[1], 1e-6) == 0.8


def test_l2_normalize_no_nan_or_inf():
    vec = np.array([np.nan, np.inf, 1.0], dtype=np.float32)
    normed = l2_normalize(vec)
    assert not np.isnan(normed).any()
    assert not np.isinf(normed).any()


# 3. Cosine Similarity Tests

def test_cosine_similarity_identical():
    vec_a = [0.6, 0.8, 0.0]
    vec_b = [0.6, 0.8, 0.0]
    sim = cosine_similarity(vec_a, vec_b)
    assert isinstance(sim, float)
    assert pytest.approx(sim, 1e-5) == 1.0


def test_cosine_similarity_orthogonal():
    vec_a = [1.0, 0.0, 0.0]
    vec_b = [0.0, 1.0, 0.0]
    sim = cosine_similarity(vec_a, vec_b)
    assert isinstance(sim, float)
    assert pytest.approx(sim, 1e-5) == 0.0


def test_cosine_similarity_opposite():
    vec_a = [1.0, 0.0]
    vec_b = [-1.0, 0.0]
    sim = cosine_similarity(vec_a, vec_b)
    assert isinstance(sim, float)
    assert pytest.approx(sim, 1e-5) == -1.0


def test_cosine_similarity_dimension_mismatch():
    with pytest.raises(ValueError, match="dimension mismatch"):
        cosine_similarity([1.0, 2.0], [1.0, 2.0, 3.0])


def test_cosine_similarity_empty_vector():
    with pytest.raises(ValueError, match="cannot be empty"):
        cosine_similarity([], [1.0, 2.0])


def test_cosine_similarity_zero_vector():
    sim = cosine_similarity([0.0, 0.0], [1.0, 1.0])
    assert isinstance(sim, float)
    assert sim == 0.0


# 4. Primary Face Selection Tests

def test_select_primary_face_empty():
    assert select_primary_face([]) is None


def test_select_primary_face_single():
    face = {"bbox": {"x1": 10, "y1": 10, "x2": 50, "y2": 50}}
    selected = select_primary_face([face])
    assert selected == face


def test_select_primary_face_multiple():
    small_face = {"bbox": {"x1": 10, "y1": 10, "x2": 30, "y2": 30}}  # area = 400
    large_face = {"bbox": {"x1": 100, "y1": 100, "x2": 200, "y2": 200}}  # area = 10000
    selected = select_primary_face([small_face, large_face])
    assert selected == large_face


# 5. Model Singleton & Availability Tests

def test_model_loader_singleton_behavior():
    instance1 = FaceModelLoader.get_instance()
    instance2 = FaceModelLoader.get_instance()
    assert instance1 is instance2


def test_analyze_image_model_unavailable(monkeypatch):
    with patch("app.services.face_service.face_model_loader") as mock_loader:
        mock_loader.is_ready.return_value = False
        mock_loader.initialize.return_value = False
        mock_loader.get_error.return_value = "Model load test failure"

        img_bytes = create_test_image_bytes(100, 100, "JPEG")
        with pytest.raises(ModelUnavailableError, match="Model load test failure"):
            analyze_image(img_bytes)


# 6. Face Bounding Box & NumPy JSON Serialization Tests

def test_analyze_image_bbox_bounds_and_types():
    img_bytes = create_test_image_bytes(200, 200, "JPEG")

    mock_face = MagicMock()
    mock_face.bbox = np.array([-10.7, 5.2, 250.8, 190.1])  # Out of bounds float bbox
    mock_face.det_score = np.float32(0.991234)
    mock_face.normed_embedding = np.ones(512, dtype=np.float32)
    mock_face.embedding = np.ones(512, dtype=np.float32)


    mock_app = MagicMock()
    mock_app.get.return_value = [mock_face]

    with patch("app.services.face_service.face_model_loader") as mock_loader:
        mock_loader.is_ready.return_value = True
        mock_loader.get_model.return_value = mock_app

        faces = analyze_image(img_bytes, include_embeddings=True)

        assert len(faces) == 1
        bbox = faces[0]["bbox"]
        # Verify clamped bounding box ints
        assert bbox["x1"] == 0
        assert bbox["y1"] == 5
        assert bbox["x2"] == 200  # Clamped to image width 200
        assert bbox["y2"] == 190
        assert type(bbox["x1"]) is int

        # Verify confidence float
        assert isinstance(faces[0]["confidence"], float)
        assert pytest.approx(faces[0]["confidence"], 1e-4) == 0.991234

        # Verify embedding conversion
        emb = faces[0]["embedding"]
        assert isinstance(emb, list)
        assert len(emb) == 512
        assert isinstance(emb[0], float)
