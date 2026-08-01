"""
Local image storage for report photo uploads (Phase 6).

A small, swappable service: ``ImageStorage.save`` validates an uploaded image
(allowed type + size cap), writes it under a base directory with a unique name
and returns the public URL it will be served from. The implementation is local
disk today; it can be replaced with Supabase Storage (or any object store) in a
later deployment phase without touching the reports API — only this module and
``get_image_storage`` need to change.
"""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

# Accept the most common photographic formats.
_ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_READ_CHUNK = 64 * 1024  # 64 KiB


class ImageStorage:
    """Persists uploaded images to a local directory and exposes their URL."""

    def __init__(self, base_dir: str | Path, url_prefix: str, max_bytes: int) -> None:
        self.base_dir = Path(base_dir)
        self.url_prefix = url_prefix.rstrip("/")
        self.max_bytes = max_bytes

    def save(self, upload: UploadFile) -> str:
        """Validate and persist ``upload``, returning its public URL.

        Raises ``HTTPException`` (400 unsupported type / 413 too large).
        """
        content_type = (upload.content_type or "").lower()
        if content_type not in _ALLOWED_CONTENT_TYPES:
            allowed = ", ".join(sorted(_ALLOWED_CONTENT_TYPES))
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported image type '{content_type}'. Allowed: {allowed}.",
            )

        data = self._read_with_size_limit(upload)
        extension = _ALLOWED_CONTENT_TYPES[content_type]
        filename = f"{uuid4().hex}{extension}"

        self.base_dir.mkdir(parents=True, exist_ok=True)
        (self.base_dir / filename).write_bytes(data)

        return f"{self.url_prefix}/{filename}"

    def delete(self, url: str) -> None:
        """Remove a previously stored image (no-op if it is already gone)."""
        filename = url.rsplit("/", 1)[-1]
        target = self.base_dir / filename
        if target.is_file():
            target.unlink(missing_ok=True)

    _MIME_BY_EXT = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }

    def read_image(self, url: str) -> tuple[bytes, str]:
        """Read a stored image back as ``(bytes, mime_type)``.

        Raises ``FileNotFoundError`` if the file is missing (e.g. stored on a
        different node / cleaned up).
        """
        filename = url.rsplit("/", 1)[-1]
        path = self.base_dir / filename
        if not path.is_file():
            raise FileNotFoundError(f"Stored image not found: {url}")
        mime = self._MIME_BY_EXT.get(path.suffix.lower(), "application/octet-stream")
        return path.read_bytes(), mime

    def _read_with_size_limit(self, upload: UploadFile) -> bytes:
        total = 0
        chunks: list[bytes] = []
        # Reset in case the stream was already peeked (e.g. content-type sniffing).
        upload.file.seek(0)
        while True:
            chunk = upload.file.read(_READ_CHUNK)
            if not chunk:
                break
            total += len(chunk)
            if total > self.max_bytes:
                raise HTTPException(
                    status.HTTP_413_CONTENT_TOO_LARGE,
                    f"Image too large. Maximum size is {self.max_bytes // 1024} KiB.",
                )
            chunks.append(chunk)
        return b"".join(chunks)


# Default singleton, configured from application settings. Override the
# `get_image_storage` dependency in tests to point at a temporary directory.
_default_storage = ImageStorage(
    base_dir=settings.MEDIA_DIR,
    url_prefix=settings.MEDIA_URL,
    max_bytes=settings.MAX_UPLOAD_BYTES,
)


def get_image_storage() -> ImageStorage:
    """FastAPI dependency returning the configured image storage."""
    return _default_storage
