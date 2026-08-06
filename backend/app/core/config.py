import os
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8", 
        extra="ignore"
    )

    PROJECT_NAME: str = "Fuel Station Finder AI"
    ENVIRONMENT: str = "development"
    PORT: int = 8000

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@db:5432/fuel_station_db"
    ASYNC_DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/fuel_station_db"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""
    # JWT verification knobs. Supabase signs access tokens with HS256 using the
    # project JWT secret by default; set SUPABASE_JWT_AUDIENCE to "authenticated"
    # to additionally require that the token is a genuine user-session token.
    SUPABASE_JWT_ALGORITHM: str = "HS256"
    SUPABASE_JWT_AUDIENCE: str = ""

    # AI APIs
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"
    GROQ_MODEL: str = "llama-3.1-8b-instant"

    # Report photo uploads (local storage; swappable for object storage later)
    MEDIA_DIR: str = "media"
    MEDIA_URL: str = "/media"
    MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024  # 5 MiB

    # CORS configuration. A comma-separated string so it can be set verbatim
    # from any host's env vars. Access the parsed list via `cors_origins_list`.
    CORS_ORIGINS: str = (
        "http://localhost:3000,"
        "http://localhost:8000,"
        "http://127.0.0.1:3000,"
        "http://127.0.0.1:8000,"
        "https://fuel-station-finder-omega.vercel.app"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        """CORS origins parsed from the comma-separated ``CORS_ORIGINS`` value."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

settings = Settings()
