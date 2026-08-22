"""
Image storage for report photo uploads (Phase 6 + verification audit + durability).

A small, swappable service: ``ImageStorage.save`` validates an uploaded image
and persists it (returning the public URL it will be served from), while
``ImageStorage.read_image`` retrieves stored bytes for verification.

Validation (Phase 9, never trust the filename):
* allowed declared MIME type (JPEG/PNG/WebP) and size cap (default 5 MiB);
* **magic-byte sniffing** of the actual file content — a file whose bytes do
  not match its declared type is rejected, so renamed executables/scripts can
  never be stored as "images";
* empty/corrupt uploads are rejected.

Storage durability (see docs/STORAGE_MIGRATION_REPORT.md):
Report photos were originally written only to Render's ephemeral local
``/media`` disk, which is wiped on restart/redeploy. That is the root cause of
the production 404 on ``POST /api/v1/reports/{id}/verify`` ("Stored image not
found"). To fix it, NEW uploads are stored in Supabase Storage (public bucket)
when ``SUPABASE_SERVICE_ROLE_KEY`` is configured, while legacy ``/media/...``
photos keep reading from local disk unchanged — all behind the same
``ImageStorage`` interface. No DB migration, no API change.

Dispatch rules (``save``/``read_image``/``delete``):
* local URLs start with ``url_prefix`` (``/media``) → local disk, exactly as
  before;
* everything else is treated as a Supabase Storage object → object store.
* A storage OUTAGE is reported as ``StorageUnavailableError`` (→ HTTP 503) so
  it is never misread as a lost image; only a true 404 (object missing) maps to
  ``FileNotFoundError`` (→ HTTP 404).
"""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import httpx
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


class StorageUnavailableError(RuntimeError):
    """Raised when the configured storage backend cannot be reached.

    Maps to HTTP 503 in the API so an outage is never mistaken for a missing
    image (which would otherwise surface as a misleading 404).
    """


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
    """Persists uploaded images and exposes their URL.

    Backward compatible constructor: ``base_dir``, ``url_prefix`` and
    ``max_bytes`` remain required; the Supabase parameters are optional. When
    none of the Supabase parameters are provided (or the service role key is
    empty) behavior is identical to the original local-disk-only backend.
    """

    def __init__(
        self,
        base_dir: str | Path,
        url_prefix: str,
        max_bytes: int,
        supabase_url: str = "",
        supabase_service_role_key: str = "",
        supabase_bucket: str = "",
        supabase_timeout: float = 30.0,
    ) -> None:
        self.base_dir = Path(base_dir)
        self.url_prefix = url_prefix.rstrip("/")
        self.max_bytes = max_bytes

        self._supabase_url = (supabase_url or "").strip().rstrip("/")
        self._service_role_key = supabase_service_role_key or ""
        self._bucket = supabase_bucket or ""
        self._timeout = supabase_timeout

        # Lazy, once-per-process bucket provisioning.
        self._bucket_ensured = False

    # ------------------------------------------------------------------ #
    # Configuration helpers
    # ------------------------------------------------------------------ #
    @property
    def _supabase_configured(self) -> bool:
        """True when every Supabase value needed for object storage is set."""
        return bool(self._supabase_url and self._service_role_key and self._bucket)

    def _is_local_url(self, url: str) -> bool:
        """True when ``url`` refers to the local-disk backend (``/media/...``)."""
        return url.startswith(f"{self.url_prefix}/")

    # ------------------------------------------------------------------ #
    # save
    # ------------------------------------------------------------------ #
    def save(self, upload: UploadFile) -> str:
        """Validate and persist ``upload``, returning its public URL.

        Validation pipeline: declared MIME type must be allowed → stream is
        read under the size cap → the *content* must match the declared type
        (magic bytes) and must not be empty. Raises ``HTTPException``
        (400 unsupported / corrupt / empty, 413 too large).

        Storage: when Supabase is configured the validated bytes are uploaded
        to the public bucket and the full ``https://...`` URL is returned;
        otherwise they are written to local disk and ``/media/...`` is
        returned (unchanged). A Supabase upload failure raises ``HTTPException``
        503 — it NEVER silently falls back to the ephemeral disk.
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

        if self._supabase_configured:
            self._save_to_supabase(data, filename, content_type)
            return self._public_url(filename)

        self.base_dir.mkdir(parents=True, exist_ok=True)
        (self.base_dir / filename).write_bytes(data)
        return f"{self.url_prefix}/{filename}"

    def _save_to_supabase(self, data: bytes, filename: str, content_type: str) -> None:
        """Upload validated bytes to the Supabase public bucket (503 on failure)."""
        try:
            self._ensure_bucket()
            url = f"{self._supabase_url}/storage/v1/object/{self._bucket}/{filename}"
            headers = {
                "Authorization": f"Bearer {self._service_role_key}",
                "Content-Type": content_type,
            }
            response = httpx.post(url, content=data, headers=headers, timeout=self._timeout)
        except httpx.HTTPError as exc:  # network / timeout
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Photo storage is temporarily unavailable (upload failed). Please try again.",
            ) from exc

        if response.status_code not in (200, 201):
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                f"Failed to upload photo to storage (status {response.status_code}). "
                "Please try again.",
            )

    def _public_url(self, filename: str) -> str:
        """Public object URL for ``filename`` in the configured bucket."""
        return (
            f"{self._supabase_url}/storage/v1/object/public/{self._bucket}/{filename}"
        )

    # ------------------------------------------------------------------ #
    # _ensure_bucket
    # ------------------------------------------------------------------ #
    def _ensure_bucket(self) -> None:
        """Create the public bucket once per process; confirm if it exists.

        - POST /storage/v1/bucket {"id","name","public":true}
        - 200/201 → provisioned
        - 400/409 → likely already exists → confirm via GET and proceed
        - any other failure (incl. network error) → HTTPException(503)
        """
        if self._bucket_ensured:
            return

        url = f"{self._supabase_url}/storage/v1/bucket"
        headers = {"Authorization": f"Bearer {self._service_role_key}"}
        body = {"id": self._bucket, "name": self._bucket, "public": True}

        try:
            response = httpx.post(url, json=body, headers=headers, timeout=self._timeout)
        except httpx.HTTPError as exc:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Photo storage is temporarily unavailable (cannot provision bucket).",
            ) from exc

        if response.status_code in (200, 201):
            self._bucket_ensured = True
            return

        if response.status_code in (400, 409):
            # Bucket probably already exists — confirm before proceeding.
            try:
                check = httpx.get(
                    f"{url}/{self._bucket}",
                    headers=headers,
                    timeout=self._timeout,
                )
            except httpx.HTTPError as exc:
                raise HTTPException(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "Photo storage is temporarily unavailable (cannot confirm bucket).",
                ) from exc
            if check.status_code == 200:
                self._bucket_ensured = True
                return
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                f"Cannot access photo storage bucket '{self._bucket}' "
                f"(status {check.status_code}).",
            )

        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"Failed to provision photo storage bucket "
            f"(status {response.status_code}).",
        )

    # ------------------------------------------------------------------ #
    # delete
    # ------------------------------------------------------------------ #
    def delete(self, url: str) -> None:
        """Remove a previously stored image (no-op if it is already gone).

        Local ``/media`` refs are unlinked; Supabase objects are deleted
        best-effort (a failed remove is swallowed so it never breaks a request).
        """
        if self._is_local_url(url):
            filename = url.rsplit("/", 1)[-1]
            target = self.base_dir / filename
            if target.is_file():
                target.unlink(missing_ok=True)
            return

        if not self._supabase_configured:
            return

        try:
            key = self._object_key(url)
            del_url = f"{self._supabase_url}/storage/v1/object/{self._bucket}/{key}"
            headers = {"Authorization": f"Bearer {self._service_role_key}"}
            httpx.delete(del_url, headers=headers, timeout=self._timeout)
        except httpx.HTTPError:
            # Best-effort cleanup — report creation must not fail on a stale ref.
            return

    def _object_key(self, url: str) -> str:
        """Extract the object key (``bucket/filename``) from a Supabase URL/path."""
        marker = f"/object/public/{self._bucket}/"
        if marker in url:
            return url.split(marker, 1)[1].split("?", 1)[0]
        # Bare storage path (e.g. "abc.png" or "report-photos/abc.png").
        return url.strip("/").split("?", 1)[0]

    # ------------------------------------------------------------------ #
    # read_image
    # ------------------------------------------------------------------ #
    _MIME_BY_EXT = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }

    def read_image(self, url: str) -> tuple[bytes, str]:
        """Read a stored image back as ``(bytes, mime_type)``.

        Local ``/media`` URLs read from disk exactly as before. Supabase URLs
        (absolute https:// or bare storage paths) are fetched over HTTP.

        Raises ``FileNotFoundError`` (→ 404) when the object is truly missing;
        raises ``StorageUnavailableError`` (→ 503) when the storage backend is
        unreachable or returns a non-404 error, so an outage is never misread
        as a lost image.
        """
        if self._is_local_url(url):
            filename = url.rsplit("/", 1)[-1]
            path = self.base_dir / filename
            if not path.is_file():
                raise FileNotFoundError(f"Stored image not found: {url}")
            mime = self._MIME_BY_EXT.get(
                path.suffix.lower(), "application/octet-stream"
            )
            return path.read_bytes(), mime

        if not self._supabase_configured:
            raise FileNotFoundError(f"Stored image not found: {url}")

        return self._read_from_supabase(url)

    def _read_from_supabase(self, url: str) -> tuple[bytes, str]:
        """Fetch an object from Supabase Storage (full URL or bare path)."""
        fetch_url = url if url.startswith(("http://", "https://")) else self._public_url(url)
        try:
            response = httpx.get(fetch_url, timeout=self._timeout)
        except httpx.HTTPError as exc:
            raise StorageUnavailableError(
                f"Photo storage is temporarily unavailable: {exc}"
            ) from exc

        if response.status_code == 404:
            raise FileNotFoundError(f"Stored image not found: {url}")

        if response.status_code != 200:
            raise StorageUnavailableError(
                f"Photo storage returned status {response.status_code} for {url}"
            )

        mime = (
            response.headers.get("content-type")
            or self._mime_by_filename(url)
            or "application/octet-stream"
        )
        return response.content, mime

    @classmethod
    def _mime_by_filename(cls, url: str) -> str | None:
        ext = Path(url.rsplit("?", 1)[0]).suffix.lower()
        return cls._MIME_BY_EXT.get(ext)

    # ------------------------------------------------------------------ #
    # shared validation helper
    # ------------------------------------------------------------------ #
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
    supabase_url=settings.SUPABASE_URL,
    supabase_service_role_key=settings.SUPABASE_SERVICE_ROLE_KEY,
    supabase_bucket=settings.SUPABASE_STORAGE_BUCKET,
    supabase_timeout=settings.SUPABASE_STORAGE_TIMEOUT_SECONDS,
)


def get_image_storage() -> ImageStorage:
    """FastAPI dependency returning the configured image storage."""
    return _default_storage
