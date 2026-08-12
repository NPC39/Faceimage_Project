from datetime import datetime, timezone
from fastapi import APIRouter
from pydantic import BaseModel, Field
from app.services.face_model import face_model_loader

router = APIRouter()


class HealthResponse(BaseModel):
    status: str = Field("ok", description="Overall service status")
    service: str = Field("photo-marketplace-backend", description="Service name")
    version: str = Field("0.1.0", description="Service version")
    timestamp: str = Field(..., description="ISO timestamp")
    face_model: str = Field("ready", description="Face model status: ready or not_ready")


@router.get("", response_model=HealthResponse)
@router.get("/", response_model=HealthResponse)
def get_health() -> HealthResponse:
    face_status = "ready" if face_model_loader.is_ready() else "not_ready"
    return HealthResponse(
        status="ok",
        service="photo-marketplace-backend",
        version="0.1.0",
        timestamp=datetime.now(timezone.utc).isoformat(),
        face_model=face_status
    )

