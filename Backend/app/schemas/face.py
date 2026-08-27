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


class FaceServiceTimings(BaseModel):
    request_read_ms: float = Field(..., description="Duration to read UploadFile payload in ms")
    decode_ms: float = Field(..., description="Duration to decode image & convert RGB/BGR in ms")
    model_inference_ms: float = Field(..., description="Pure InsightFace app.get(img) execution in ms")
    postprocess_ms: float = Field(..., description="Duration for bbox, confidence, and embedding normalization in ms")
    total_ms: float = Field(..., description="Total backend face service endpoint execution duration in ms")


class FaceDetectResponse(BaseModel):
    face_count: int = Field(..., description="Number of detected faces in the image")
    faces: List[FaceDetection] = Field(..., description="List of detected faces")
    inference_ms: Optional[float] = Field(None, description="Inference latency in milliseconds")
    timings: Optional[FaceServiceTimings] = Field(None, description="Detailed backend stage timings in ms")


class FaceEmbedResponse(BaseModel):
    face_count: int = Field(..., description="Number of detected faces in the image")
    faces: List[FaceEmbedding] = Field(..., description="List of detected faces with embeddings")
    inference_ms: Optional[float] = Field(None, description="Inference latency in milliseconds")
    timings: Optional[FaceServiceTimings] = Field(None, description="Detailed backend stage timings in ms")


class FaceCompareResponse(BaseModel):
    image_a_face_count: int = Field(..., description="Faces detected in image A")
    image_b_face_count: int = Field(..., description="Faces detected in image B")
    similarity: Optional[float] = Field(None, description="Cosine similarity score between primary faces (0.0 to 1.0)")
    face_a_selected: bool = Field(False, description="Whether a primary face was selected from image A")
    face_b_selected: bool = Field(False, description="Whether a primary face was selected from image B")
    inference_ms: Optional[float] = Field(None, description="Total latency in milliseconds")
