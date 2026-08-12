from typing import List, Optional
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    x1: int = Field(..., description="Top-left X coordinate in pixels")
    y1: int = Field(..., description="Top-left Y coordinate in pixels")
    x2: int = Field(..., description="Bottom-right X coordinate in pixels")
    y2: int = Field(..., description="Bottom-right Y coordinate in pixels")


class FaceDetection(BaseModel):
    bbox: BoundingBox
    confidence: float = Field(..., description="Detection confidence score from InsightFace")


class FaceEmbedding(BaseModel):
    bbox: BoundingBox
    confidence: float = Field(..., description="Detection confidence score from InsightFace")
    embedding: List[float] = Field(..., description="L2-normalized 512-dimensional vector embedding")


class FaceDetectResponse(BaseModel):
    face_count: int = Field(..., description="Number of detected faces in the image")
    faces: List[FaceDetection] = Field(..., description="List of detected faces")
    inference_ms: Optional[float] = Field(None, description="Inference latency in milliseconds")


class FaceEmbedResponse(BaseModel):
    face_count: int = Field(..., description="Number of detected faces in the image")
    faces: List[FaceEmbedding] = Field(..., description="List of detected faces with embeddings")
    inference_ms: Optional[float] = Field(None, description="Inference latency in milliseconds")


class FaceCompareResponse(BaseModel):
    image_a_face_count: int = Field(..., description="Faces detected in image A")
    image_b_face_count: int = Field(..., description="Faces detected in image B")
    similarity: Optional[float] = Field(None, description="Cosine similarity score between primary faces (0.0 to 1.0)")
    face_a_selected: bool = Field(False, description="Whether a primary face was selected from image A")
    face_b_selected: bool = Field(False, description="Whether a primary face was selected from image B")
    inference_ms: Optional[float] = Field(None, description="Total latency in milliseconds")
