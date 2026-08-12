import logging
import threading
from typing import Optional, Any
from app.core.config import settings

logger = logging.getLogger(__name__)


class FaceModelLoader:
    _instance: Optional["FaceModelLoader"] = None
    _lock: threading.Lock = threading.Lock()

    def __init__(self):
        self._app: Optional[Any] = None
        self._is_initialized: bool = False
        self._init_error: Optional[str] = None

    @classmethod
    def get_instance(cls) -> "FaceModelLoader":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = FaceModelLoader()
        return cls._instance

    def initialize(self) -> bool:
        """Initialize the InsightFace model pack once."""
        if self._is_initialized and self._app is not None:
            return True

        with self._lock:
            if self._is_initialized and self._app is not None:
                return True

            try:
                import insightface

                providers = settings.FACE_MODEL_PROVIDERS
                if isinstance(providers, str):
                    providers = [p.strip() for p in providers.split(",") if p.strip()]

                logger.info(
                    f"Initializing InsightFace model '{settings.FACE_MODEL_NAME}' "
                    f"with providers {providers}..."
                )

                app = insightface.app.FaceAnalysis(
                    name=settings.FACE_MODEL_NAME,
                    providers=providers
                )
                app.prepare(ctx_id=0, det_size=(640, 640), det_thresh=settings.FACE_DET_THRESH)

                self._app = app
                self._is_initialized = True
                self._init_error = None
                logger.info(f"InsightFace model '{settings.FACE_MODEL_NAME}' initialized successfully.")
                return True
            except Exception as e:
                self._init_error = str(e)
                self._is_initialized = False
                self._app = None
                logger.error(f"Failed to initialize InsightFace model: {e}", exc_info=True)
                return False

    def get_model(self) -> Optional[Any]:

        """Return the initialized InsightFace app instance or None."""
        if not self._is_initialized:
            self.initialize()
        return self._app

    def is_ready(self) -> bool:
        """Return True if face recognition model is initialized and ready for inference."""
        return self._is_initialized and self._app is not None

    def get_error(self) -> Optional[str]:
        return self._init_error


# Global singleton instance
face_model_loader = FaceModelLoader.get_instance()
