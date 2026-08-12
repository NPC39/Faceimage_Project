from typing import List, Union
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Face Recognition Photo Marketplace API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # CORS Origins
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    DATABASE_URL: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/photomarket",
        description="PostgreSQL Database Connection String"
    )

    # Face Recognition Settings
    FACE_MODEL_NAME: str = "buffalo_l"
    FACE_MODEL_PROVIDERS: Union[List[str], str] = ["CPUExecutionProvider"]
    MAX_FACE_IMAGE_MB: int = 20
    FACE_DET_THRESH: float = 0.5
    MAX_IMAGE_PIXELS: int = 40_000_000  # Protection against image decompression bombs (~40 Megapixels)
    FACE_SERVICE_API_KEY: str = ""  # Internal service API key for server-to-server security


    @field_validator("FACE_MODEL_PROVIDERS", mode="before")
    @classmethod
    def assemble_face_model_providers(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("["):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return ["CPUExecutionProvider"]


    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
