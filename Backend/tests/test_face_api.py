from io import BytesIO
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def create_test_image_bytes(width: int = 100, height: int = 100) -> bytes:
    img = Image.new("RGB", (width, height), color=(200, 200, 200))
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_health_includes_face_model():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "face_model" in data
    assert data["face_model"] in ["ready", "not_ready"]


def test_api_v1_health_includes_face_model():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert "face_model" in data
    assert data["face_model"] in ["ready", "not_ready"]


def test_detect_faces_corrupt_file():
    files = {"file": ("corrupt.txt", b"not an image", "text/plain")}
    response = client.post("/api/v1/faces/detect", files=files)
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data


def test_detect_faces_valid_image():
    img_bytes = create_test_image_bytes(200, 200)
    files = {"file": ("test.jpg", img_bytes, "image/jpeg")}
    response = client.post("/api/v1/faces/detect", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "face_count" in data
    assert isinstance(data["face_count"], int)
    assert "faces" in data
    assert isinstance(data["faces"], list)


def test_embed_faces_corrupt_file():
    files = {"file": ("corrupt.txt", b"not an image", "text/plain")}
    response = client.post("/api/v1/faces/embed", files=files)
    assert response.status_code == 400


def test_embed_faces_valid_image():
    img_bytes = create_test_image_bytes(200, 200)
    files = {"file": ("test.jpg", img_bytes, "image/jpeg")}
    response = client.post("/api/v1/faces/embed", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "face_count" in data
    assert "faces" in data


def test_compare_faces_valid_images():
    img_a = create_test_image_bytes(200, 200)
    img_b = create_test_image_bytes(200, 200)
    files = {
        "file_a": ("a.jpg", img_a, "image/jpeg"),
        "file_b": ("b.jpg", img_b, "image/jpeg")
    }
    response = client.post("/api/v1/faces/compare", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "image_a_face_count" in data
    assert "image_b_face_count" in data


def test_internal_api_key_auth(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "FACE_SERVICE_API_KEY", "secret_key_123")

    # Health remains public
    health_resp = client.get("/health")
    assert health_resp.status_code == 200

    # Face endpoint without header -> 401
    files = {"file": ("test.jpg", create_test_image_bytes(), "image/jpeg")}
    unauth_resp = client.post("/api/v1/faces/detect", files=files)
    assert unauth_resp.status_code == 401

    # Face endpoint with wrong header -> 401
    wrong_resp = client.post("/api/v1/faces/detect", files=files, headers={"X-Internal-API-Key": "wrong_key"})
    assert wrong_resp.status_code == 401

    # Face endpoint with correct header -> 200
    valid_resp = client.post("/api/v1/faces/detect", files=files, headers={"X-Internal-API-Key": "secret_key_123"})
    assert valid_resp.status_code == 200

