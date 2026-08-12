import os
import glob
from fastapi.testclient import TestClient
from PIL import Image
from io import BytesIO
from app.main import app

client = TestClient(app)


def create_test_image_bytes(width: int = 150, height: int = 150) -> bytes:
    img = Image.new("RGB", (width, height), color=(100, 150, 200))
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_privacy_no_disk_persistence(tmp_path):
    """Verify that calling /detect and /embed does not save raw uploads or face crops to disk."""
    initial_files = set(glob.glob("**/*", recursive=True))

    img_bytes = create_test_image_bytes(200, 200)
    files = {"file": ("privacy_test.jpg", img_bytes, "image/jpeg")}

    res_detect = client.post("/api/v1/faces/detect", files=files)
    assert res_detect.status_code == 200

    res_embed = client.post("/api/v1/faces/embed", files=files)
    assert res_embed.status_code == 200

    current_files = set(glob.glob("**/*", recursive=True))
    new_files = current_files - initial_files

    # Ensure no image or crop files (.jpg, .png, .crop) were created on disk
    image_extensions = (".jpg", ".jpeg", ".png", ".webp", ".crop", ".bin")
    created_images = [f for f in new_files if f.endswith(image_extensions)]
    assert len(created_images) == 0, f"Privacy violation: image files created on disk: {created_images}"


def test_strict_phase_7_boundary():
    """Verify Phase 7 does not import or execute database face record persistence."""
    import app.api.v1.endpoints.faces as faces_module
    import app.services.face_service as service_module

    # Verify no Prisma / Database imports in face endpoints or service layer
    assert not hasattr(faces_module, "prisma")
    assert not hasattr(service_module, "prisma")
    assert not hasattr(faces_module, "DetectedFace")
    assert not hasattr(service_module, "DetectedFace")
