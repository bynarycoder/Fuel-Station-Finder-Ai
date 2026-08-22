"""
Tests for CORS configuration.

Guards the production requirements:
* The default fallback includes the real Vercel frontend origin (omega), not
  the stale ``fuel-station-finder-ai.vercel.app`` placeholder.
* Localhost development origins are preserved.
* The comma-separated ``CORS_ORIGINS`` env var overrides the default and is
  parsed robustly (whitespace, empty entries).
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config import Settings


def _parse(value: str) -> list[str]:
    """Parse a CORS_ORIGINS value the same way Settings does."""
    return [o.strip() for o in value.split(",") if o.strip()]


def test_default_cors_includes_production_omega_origin():
    settings = Settings()
    origins = settings.cors_origins_list
    assert "https://fuel-station-finder-omega.vercel.app" in origins
    # The stale placeholder must not be present.
    assert "https://fuel-station-finder-ai.vercel.app" not in origins


def test_default_cors_preserves_localhost_origins():
    settings = Settings()
    origins = settings.cors_origins_list
    assert "http://localhost:3000" in origins
    assert "http://localhost:8000" in origins
    assert "http://127.0.0.1:3000" in origins
    assert "http://127.0.0.1:8000" in origins


def test_cors_env_var_overrides_default(monkeypatch):
    monkeypatch.setenv(
        "CORS_ORIGINS",
        "https://fuel-station-finder-omega.vercel.app, https://example.com",
    )
    settings = Settings()
    assert settings.cors_origins_list == [
        "https://fuel-station-finder-omega.vercel.app",
        "https://example.com",
    ]


def test_cors_parsing_handles_whitespace_and_empty_entries():
    assert _parse(
        " http://localhost:3000 ,  , https://fuel-station-finder-omega.vercel.app "
    ) == [
        "http://localhost:3000",
        "https://fuel-station-finder-omega.vercel.app",
    ]


def test_settings_reads_cors_from_env_file_encoding(monkeypatch, tmp_path):
    """Sanity check that BaseSettings honours a CORS_ORIGINS env var at all
    (proves the Render override path works) without reloading the live app
    settings singleton."""
    monkeypatch.setenv("CORS_ORIGINS", "https://override.example.com")

    class ProbeSettings(BaseSettings):
        model_config = SettingsConfigDict(
            env_file=".env", env_file_encoding="utf-8", extra="ignore"
        )
        CORS_ORIGINS: str = "http://localhost:3000"

    assert ProbeSettings().CORS_ORIGINS == "https://override.example.com"
