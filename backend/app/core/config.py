from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
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
    # Supabase Auth currently uses asymmetric ES256 signing for this project.
    # The verifier accepts only this algorithm and obtains public keys from JWKS.
    SUPABASE_JWT_ALGORITHM: str = "ES256"
    SUPABASE_JWT_AUDIENCE: str = "authenticated"
    # These can be left empty to derive the issuer/JWKS URL from SUPABASE_URL.
    SUPABASE_JWT_ISSUER: str = ""
    SUPABASE_JWKS_URL: str = ""
    SUPABASE_JWKS_CACHE_TTL_SECONDS: int = 300

    # AI APIs
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"
    GROQ_MODEL: str = "llama-3.1-8b-instant"
    # Per-call timeout for AI HTTP calls (seconds). Failures degrade to the
    # deterministic intent parser / template answers instead of erroring.
    AI_TIMEOUT_SECONDS: float = 12.0
    # In-memory TTL for computed AI recommendations (seconds). Keyed by
    # (query, rounded lat/lon) so repeated asks don't re-invoke the LLM.
    AI_RECOMMEND_CACHE_TTL_SECONDS: int = 300

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
    def supabase_jwt_issuer(self) -> str:
        """Return the exact Supabase Auth issuer used by access tokens."""
        configured = self.SUPABASE_JWT_ISSUER.strip().rstrip("/")
        if configured:
            return configured

        project_url = self.SUPABASE_URL.strip().rstrip("/")
        if not project_url:
            return ""
        if project_url.endswith("/auth/v1"):
            return project_url
        return f"{project_url}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        """Return the trusted Supabase project JWKS discovery URL."""
        configured = self.SUPABASE_JWKS_URL.strip().rstrip("/")
        if configured:
            return configured

        issuer = self.supabase_jwt_issuer
        return f"{issuer}/.well-known/jwks.json" if issuer else ""

    @property
    def cors_origins_list(self) -> List[str]:
        """CORS origins parsed from the comma-separated ``CORS_ORIGINS`` value."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
