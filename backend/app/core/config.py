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

    # Report-photo object storage (Supabase Storage).
    #
    # When SUPABASE_SERVICE_ROLE_KEY is set, NEW report-photo uploads are stored
    # in the public ``SUPABASE_STORAGE_BUCKET`` (auto-created on first upload)
    # instead of the local ``MEDIA_DIR``, which lives on Render's ephemeral disk
    # and is wiped on every restart/redeploy (the root cause of the production
    # 404 on report-photo verification). When the service role key is empty,
    # uploads fall back to local storage, keeping behavior unchanged.
    #
    # SECURITY: SUPABASE_SERVICE_ROLE_KEY bypasses RLS and is SERVER-ONLY. It
    # must never be exposed to the browser — never set it in a NEXT_PUBLIC_* var.
    SUPABASE_STORAGE_BUCKET: str = "report-photos"
    SUPABASE_SERVICE_ROLE_KEY: str = ""  # server-side only
    SUPABASE_STORAGE_TIMEOUT_SECONDS: float = 30.0

    # AI APIs
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    # Gemini model used for report-photo verification (multimodal).
    #
    # IMPORTANT: gemini-1.5-flash (the previous default) was SHUT DOWN on
    # 29 Sep 2025 and now returns 404 for every request, which silently broke
    # photo verification in production. Keep this pointed at a currently
    # supported multimodal Flash model; override per environment when Google
    # retires a generation (see https://ai.google.dev/gemini-api/docs/models).
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"
    # Groq model powering Fuel Intelligence intent extraction, conversational
    # answers and (optional) factual explanation generation, plus
    # natural-language station search.
    GROQ_MODEL: str = "openai/gpt-oss-20b"
    # Per-call timeout for AI HTTP calls (seconds). Failures degrade to the
    # deterministic intent parser / template answers instead of erroring.
    AI_TIMEOUT_SECONDS: float = 12.0
    # SDK-level retry attempts for transient provider failures (connection
    # errors, 408/429/5xx). Set on the CLIENT CONSTRUCTOR only — passing
    # max_retries to Groq's chat.completions.create() raises TypeError.
    # Worst-case latency stays AI_TIMEOUT_SECONDS * (AI_MAX_RETRIES + 1).
    AI_MAX_RETRIES: int = 1
    # In-memory TTL for computed AI recommendations (seconds). Keyed by
    # (query, rounded lat/lon) so repeated asks don't re-invoke the LLM.
    AI_RECOMMEND_CACHE_TTL_SECONDS: int = 300

    # Geocoding (location search for the manual location picker)
    #
    # Nominatim (OpenStreetMap) is the provider. The BACKEND proxies the
    # browser's search requests so no third-party API key ever reaches the
    # frontend, and so we can set the identification headers Nominatim's
    # usage policy requires (a valid User-Agent / Referer identifying the
    # application). See https://operations.osmfoundation.org/policies/nominatim/
    NOMINATIM_BASE_URL: str = "https://nominatim.openstreetmap.org"
    NOMINATIM_USER_AGENT: str = (
        "FuelStationFinderAI/1.0 (https://fuel-station-finder-omega.vercel.app)"
    )
    NOMINATIM_REFERER: str = "https://fuel-station-finder-omega.vercel.app"
    NOMINATIM_TIMEOUT_SECONDS: float = 5.0
    # Max results returned per search (Nominatim allows more; keep it snappy).
    NOMINATIM_SEARCH_LIMIT: int = 6

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
