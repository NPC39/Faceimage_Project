from datetime import datetime, timezone
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    timestamp: str


@router.get("", response_model=HealthResponse)
@router.get("/", response_model=HealthResponse)
def get_health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="photo-marketplace-backend",
        version="0.1.0",
        timestamp=datetime.now(timezone.utc).isoformat()
    )
