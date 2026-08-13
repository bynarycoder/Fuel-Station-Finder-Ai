"""
Local image storage for report photo uploads (Phase 6 + verification audit).

A small, swappable service: ``ImageStorage.save`` validates an uploaded image
and writes it under a base directory with a unique name, returning the public
URL it will be served from.

Validation (Phase 9, never trust the filename):
* allowed declared MIME type (JPEG/PNG/WebP) and size cap (default 5 MiB);
* **magic-byte sniffing** of the actual file content — a file whose bytes do
  not match its declared type is rejected, so renamed executables/scripts can
  never be stored as "images";
* empty/corrupt uploads are rejected.

The implementation is local disk today; it can be replaced with Supabase
Storage (or any object store) in a later deployment phase without touching the
reports API — only this module and ``get_image_storage`` need to change.
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

# Magic-byte signatures for the allowed formats (content sniffing).
_MAGIC_BYTES: dict[str, bytes] = {
    # JPEG: FF D8 FF
    "image/jpeg": b"\xff\xd8\xff",
    # PNG: 89 50 4E 47 0D 0A 1A 0A
    "image/png": b"\x89PNG\r\n\x1a\n",
}
# WebP: "RIFF" .... "WEBP" (bytes 0-3 and 8-11).
_WEBP_RIFF = b"RIFF"
_WEBP_MARK = b"WEBP"


def sniff_image_type(data: bytes) -> str | None:
    """Determine the real image type of ``data`` from its content.

    Returns a MIME type from ``_ALLOWED_CONTENT_TYPES`` or ``None`` when the
    bytes are not a JPEG/PNG/WebP image. Pure function — unit-testable.
    """
    if len(data) < 12:
        return None
    if data.startswith(_MAGIC_BYTES["image/jpeg"]):
        return "image/jpeg"
    if data.startswith(_MAGIC_BYTES["image/png"]):
        return "image/png"
    if data[:4] == _WEBP_RIFF and data[8:12] == _WEBP_MARK:
        return "image/webp"
    return None


class ImageStorage:
    """Persists uploaded images to a local directory and exposes their URL."""

    def __init__(self, base_dir: str | Path, url_prefix: str, max_bytes: int) -> None:
        self.base_dir = Path(base_dir)
        self.url_prefix = url_prefix.rstrip("/")
        self.max_bytes = max_bytes

    def save(self, upload: UploadFile) -> str:
        """Validate and persist ``upload``, returning its public URL.

        Validation pipeline: declared MIME type must be allowed → stream is
        read under the size cap → the *content* must match the declared type
        (magic bytes) and must not be empty. Raises ``HTTPException``
        (400 unsupported / corrupt / empty, 413 too large).
        """
        content_type = (upload.content_type or "").lower()
        if content_type not in _ALLOWED_CONTENT_TYPES:
            allowed = ", ".join(sorted(_ALLOWED_CONTENT_TYPES))
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported image type '{content_type}'. Allowed: {allowed}.",
            )

        data = self._read_with_size_limit(upload)

        if not data:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "The uploaded file is empty. Choose a valid image.",
            )

        # Never trust the declared type or the filename — verify the bytes.
        sniffed = sniff_image_type(data)
        if sniffed is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "The file does not appear to be a valid JPEG, PNG or WebP image.",
            )
        if sniffed != content_type:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"File content does not match its declared type "
                f"'{content_type}' (detected '{sniffed}').",
            )

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
