from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.api import api_router
from app.core.config import settings
from app.services.face_model import face_model_loader

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application starting up: Initializing face recognition model...")
    # Initialize face model on startup in non-blocking background or eager load
    face_model_loader.initialize()
    yield
    logger.info("Application shutting down.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    description="FastAPI Backend for Face Recognition Photo Marketplace",
    lifespan=lifespan
)

# Set up CORS middleware
if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# Top-level Health check endpoint for container orchestrators & simple pings
@app.get("/health", tags=["health"])
def top_level_health():
    face_status = "ready" if face_model_loader.is_ready() else "not_ready"
    return {
        "status": "ok",
        "service": "photo-marketplace-backend",
        "version": "0.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "face_model": face_status
    }


# Root info endpoint
@app.get("/", tags=["root"])
def root():
    return {
        "name": settings.PROJECT_NAME,
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health"
    }


# Include API v1 router
app.include_router(api_router, prefix=settings.API_V1_STR)

