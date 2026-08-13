"""
Real I/O tests for the image storage service (Phase 6).

Exercises actual file writing/validation with a temporary directory — no DB,
no mocks.
"""

from __future__ import annotations

from io import BytesIO

import pytest

from app.services.storage import ImageStorage

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f"
    b"\x00\x00\x01\x01\x00\x05\xfe\x02\xfe\xdc\xcc\x59\xe7\x00\x00\x00\x00"
    b"IEND\xaeB`\x82"
)


class _FakeUpload:
    """Minimal stand-in for Starlette's ``UploadFile`` exposing the two attributes
    ``ImageStorage`` actually reads (``content_type`` + a seekable ``file``)."""

    def __init__(self, data: bytes, content_type: str) -> None:
        self.content_type = content_type
        self.file = BytesIO(data)


def _upload(data: bytes, content_type: str) -> _FakeUpload:
    return _FakeUpload(data, content_type)


def test_save_writes_file_and_returns_url(tmp_path) -> None:
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=1024 * 1024)
    url = storage.save(_upload(PNG_BYTES, "image/png"))

    assert url.startswith("/media/")
    filename = url.rsplit("/", 1)[-1]
    assert filename.endswith(".png")
    assert (tmp_path / filename).read_bytes() == PNG_BYTES


def test_save_creates_base_directory_if_missing(tmp_path) -> None:
    target = tmp_path / "uploads"
    storage = ImageStorage(base_dir=target, url_prefix="/m", max_bytes=1024)
    url = storage.save(_upload(PNG_BYTES, "image/png"))
    assert target.is_dir()
    assert (target / url.rsplit("/", 1)[-1]).exists()


def test_save_rejects_unsupported_content_type(tmp_path) -> None:
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=1024)
    with pytest.raises(Exception):  # HTTPException(400)
        storage.save(_upload(b"not an image", "application/pdf"))


def test_save_rejects_oversized_upload(tmp_path) -> None:
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=64)
    with pytest.raises(Exception):  # HTTPException(413)
        storage.save(_upload(b"x" * 200, "image/png"))


def test_delete_removes_file(tmp_path) -> None:
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=1024)
    url = storage.save(_upload(PNG_BYTES, "image/png"))
    assert (tmp_path / url.rsplit("/", 1)[-1]).exists()

    storage.delete(url)
    assert not (tmp_path / url.rsplit("/", 1)[-1]).exists()


def test_delete_missing_file_is_noop(tmp_path) -> None:
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=1024)
    # Should not raise even though the file was never stored.
    storage.delete("/media/does-not-exist.png")


# --------------------------------------------------------------------------- #
# Content sniffing (Phase 9) — never trust the filename or declared type
# --------------------------------------------------------------------------- #
def test_sniff_recognises_jpeg_png_webp() -> None:
    from app.services.storage import sniff_image_type

    assert sniff_image_type(b"\xff\xd8\xff\xe0" + b"\x00" * 20) == "image/jpeg"
    assert sniff_image_type(PNG_BYTES) == "image/png"
    webp = b"RIFF" + b"\x00" * 4 + b"WEBP" + b"\x00" * 20
    assert sniff_image_type(webp) == "image/webp"


def test_sniff_rejects_non_images_and_short_files() -> None:
    from app.services.storage import sniff_image_type

    assert sniff_image_type(b"") is None
    assert sniff_image_type(b"short") is None
    assert sniff_image_type(b"MZ" + b"\x90\x00" * 10) is None  # PE executable
    assert sniff_image_type(b"#!/bin/sh\nrm -rf /\n" + b"\x00" * 20) is None


def test_save_rejects_content_mismatching_declared_type(tmp_path) -> None:
    """A file claiming to be an image but holding executable bytes must be
    rejected even though the MIME header and filename look fine."""
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=1024)
    evil = b"MZ" + b"\x90\x00" * 64  # fake DOS/PE header
    with pytest.raises(Exception) as exc_info:
        storage.save(_upload(evil, "image/png"))
    assert "does not appear to be a valid" in str(exc_info.value)


def test_save_rejects_empty_upload(tmp_path) -> None:
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=1024)
    with pytest.raises(Exception) as exc_info:
        storage.save(_upload(b"", "image/png"))
    assert "empty" in str(exc_info.value).lower()


def test_save_accepts_real_jpeg_bytes_with_declared_jpeg_type(tmp_path) -> None:
    """A genuine JPEG byte stream passes even with a generic filename."""
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=1024)
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 64
    url = storage.save(_upload(jpeg, "image/jpeg"))
    assert url.endswith(".jpg")


def test_save_rejects_real_png_declared_as_jpeg(tmp_path) -> None:
    """Type confusion: PNG bytes labelled image/jpeg must be rejected rather
    than stored under a misleading extension."""
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=1024)
    with pytest.raises(Exception) as exc_info:
        storage.save(_upload(PNG_BYTES, "image/jpeg"))
    assert "does not match its declared type" in str(exc_info.value)
