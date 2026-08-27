import time
import logging
from fastapi import APIRouter, File, UploadFile, HTTPException, Header, Depends, status
from app.core.config import settings
from app.schemas.face import (
    FaceDetectResponse,
    FaceEmbedResponse,
    FaceCompareResponse,
    FaceDetection,
    FaceEmbedding,
    BoundingBox,
    FaceServiceTimings,
)
from app.services.face_service import (
    analyze_image,
    analyze_image_detailed,
    select_primary_face,
    cosine_similarity,
    ImageValidationError,
    ModelUnavailableError,
)

logger = logging.getLogger(__name__)


def verify_internal_api_key(x_internal_api_key: str = Header(None)) -> None:
    """Verify internal service API key for face processing endpoints if configured."""
    if settings.FACE_SERVICE_API_KEY:
        if not x_internal_api_key or x_internal_api_key != settings.FACE_SERVICE_API_KEY:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing internal service API key."
            )


router = APIRouter(dependencies=[Depends(verify_internal_api_key)])


@router.post(
    "/detect",
    response_model=FaceDetectResponse,
    status_code=status.HTTP_200_OK,
    summary="Detect faces in an uploaded image",
    description="Validates the input image (JPEG, PNG, WebP) and returns bounding boxes and confidence scores for all detected faces."
)
async def detect_faces(file: UploadFile = File(...)) -> FaceDetectResponse:
    start_time = time.perf_counter()
    try:
        t_read_0 = time.perf_counter()
        image_bytes = await file.read()
        t_read_1 = time.perf_counter()
        request_read_ms = round((t_read_1 - t_read_0) * 1000, 2)

        faces_data, detailed_timings = analyze_image_detailed(image_bytes, include_embeddings=False)
        total_ms = round((time.perf_counter() - start_time) * 1000, 2)

        face_detections = [
            FaceDetection(
                bbox=BoundingBox(**f["bbox"]),
                confidence=f["confidence"]
            )
            for f in faces_data
        ]

        timings_obj = FaceServiceTimings(
            request_read_ms=request_read_ms,
            decode_ms=detailed_timings["decode_ms"],
            model_inference_ms=detailed_timings["model_inference_ms"],
            postprocess_ms=detailed_timings["postprocess_ms"],
            total_ms=total_ms
        )

        logger.info(f"Face detect: found {len(face_detections)} face(s) in {total_ms}ms")
        return FaceDetectResponse(
            face_count=len(face_detections),
            faces=face_detections,
            inference_ms=total_ms,
            timings=timings_obj
        )

    except ImageValidationError as e:
        logger.warning(f"Image validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except ModelUnavailableError as e:
        logger.error(f"Face model unavailable: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face recognition service is initializing or unavailable."
        )
    except Exception as e:
        logger.error(f"Internal face detection failure: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal face processing failure."
        )


@router.post(
    "/embed",
    response_model=FaceEmbedResponse,
    status_code=status.HTTP_200_OK,
    summary="Extract face embeddings from an uploaded image (Internal Service Endpoint)",
    description="Internal endpoint for service-to-service usage. Returns bounding boxes, confidence, and L2-normalized 512-dim embeddings for all detected faces."
)
async def embed_faces(file: UploadFile = File(...)) -> FaceEmbedResponse:
    start_time = time.perf_counter()
    try:
        t_read_0 = time.perf_counter()
        image_bytes = await file.read()
        t_read_1 = time.perf_counter()
        request_read_ms = round((t_read_1 - t_read_0) * 1000, 2)

        faces_data, detailed_timings = analyze_image_detailed(image_bytes, include_embeddings=True)
        total_ms = round((time.perf_counter() - start_time) * 1000, 2)

        face_embeddings = [
            FaceEmbedding(
                bbox=BoundingBox(**f["bbox"]),
                confidence=f["confidence"],
                embedding=f["embedding"]
            )
            for f in faces_data
        ]

        timings_obj = FaceServiceTimings(
            request_read_ms=request_read_ms,
            decode_ms=detailed_timings["decode_ms"],
            model_inference_ms=detailed_timings["model_inference_ms"],
            postprocess_ms=detailed_timings["postprocess_ms"],
            total_ms=total_ms
        )

        logger.info(
            f"Face embed: extracted {len(face_embeddings)} face(s) in total={total_ms}ms "
            f"(read={request_read_ms}ms, decode={detailed_timings['decode_ms']}ms, "
            f"inference={detailed_timings['model_inference_ms']}ms, postprocess={detailed_timings['postprocess_ms']}ms)"
        )
        return FaceEmbedResponse(
            face_count=len(face_embeddings),
            faces=face_embeddings,
            inference_ms=total_ms,
            timings=timings_obj
        )

    except ImageValidationError as e:
        logger.warning(f"Image validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except ModelUnavailableError as e:
        logger.error(f"Face model unavailable: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face recognition service is initializing or unavailable."
        )
    except Exception as e:
        logger.error(f"Internal face embedding failure: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal face processing failure."
        )


@router.post(
    "/compare",
    response_model=FaceCompareResponse,
    status_code=status.HTTP_200_OK,
    summary="Compare primary faces between two images (Internal Development Endpoint)",
    description="Selects the primary (largest) face from each image and calculates cosine similarity between their embeddings."
)
async def compare_faces(
    file_a: UploadFile = File(..., description="First image file"),
    file_b: UploadFile = File(..., description="Second image file")
) -> FaceCompareResponse:
    start_time = time.perf_counter()
    try:
        bytes_a = await file_a.read()
        bytes_b = await file_b.read()

        faces_a = analyze_image(bytes_a, include_embeddings=True)
        faces_b = analyze_image(bytes_b, include_embeddings=True)

        primary_a = select_primary_face(faces_a)
        primary_b = select_primary_face(faces_b)

        similarity_score = None
        if primary_a and primary_b and "embedding" in primary_a and "embedding" in primary_b:
            similarity_score = cosine_similarity(primary_a["embedding"], primary_b["embedding"])
            similarity_score = round(similarity_score, 4)

        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

        return FaceCompareResponse(
            image_a_face_count=len(faces_a),
            image_b_face_count=len(faces_b),
            similarity=similarity_score,
            face_a_selected=primary_a is not None,
            face_b_selected=primary_b is not None,
            inference_ms=elapsed_ms
        )

    except ImageValidationError as e:
        logger.warning(f"Image validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except ModelUnavailableError as e:
        logger.error(f"Face model unavailable: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face recognition service is initializing or unavailable."
        )
    except Exception as e:
        logger.error(f"Internal face comparison failure: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal face comparison failure."
        )
