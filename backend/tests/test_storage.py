"""
Real I/O tests for the image storage service (Phase 6).

Exercises actual file writing/validation with a temporary directory — no DB,
no mocks.
"""

from __future__ import annotations

from io import BytesIO

import httpx
import pytest
from fastapi import HTTPException

from app.services.storage import (
    ImageStorage,
    StorageUnavailableError,
    sniff_image_type,
)

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


# --------------------------------------------------------------------------- #
# Supabase Storage durability — dispatch, upload, bucket ensure, outage→503
# --------------------------------------------------------------------------- #
class _FakeResp:
    def __init__(self, status_code: int, content: bytes = b"", headers: dict | None = None):
        self.status_code = status_code
        self.content = content
        self.headers = headers or {}


class _SupabaseHTTPMock:
    """Routes mocked httpx calls by URL fragment and records every call."""

    def __init__(self, monkeypatch) -> None:
        self.post_responses: dict[str, _FakeResp] = {}
        self.get_responses: dict[str, _FakeResp] = {}
        self.delete_responses: dict[str, _FakeResp] = {}
        self.post_calls: list[tuple[str, dict]] = []
        self.get_calls: list[tuple[str, dict]] = []
        self.delete_calls: list[tuple[str, dict]] = []
        monkeypatch.setattr("httpx.post", self._post)
        monkeypatch.setattr("httpx.get", self._get)
        monkeypatch.setattr("httpx.delete", self._delete)

    def _post(self, url: str, **kwargs):
        self.post_calls.append((url, kwargs))
        for fragment, resp in self.post_responses.items():
            if fragment in url:
                return resp
        return _FakeResp(200)

    def _get(self, url: str, **kwargs):
        self.get_calls.append((url, kwargs))
        for fragment, resp in self.get_responses.items():
            if fragment in url:
                return resp
        return _FakeResp(200)

    def _delete(self, url: str, **kwargs):
        self.delete_calls.append((url, kwargs))
        for fragment, resp in self.delete_responses.items():
            if fragment in url:
                return resp
        return _FakeResp(200)


def _supabase_storage(tmp_path, **kw) -> ImageStorage:
    return ImageStorage(
        base_dir=tmp_path,
        url_prefix="/media",
        max_bytes=1024 * 1024,
        supabase_url="https://abc.supabase.co",
        supabase_service_role_key="svc-key",
        supabase_bucket="report-photos",
        **kw,
    )


def test_legacy_media_read_works_when_supabase_configured(tmp_path) -> None:
    """A legacy /media URL still reads from local disk even when Supabase is set."""
    storage = _supabase_storage(tmp_path)
    (tmp_path / "legacy.png").write_bytes(PNG_BYTES)

    data, mime = storage.read_image("/media/legacy.png")
    assert data == PNG_BYTES
    assert mime == "image/png"


def test_save_uploads_to_supabase_and_returns_public_url(tmp_path, monkeypatch) -> None:
    mock = _SupabaseHTTPMock(monkeypatch)
    storage = _supabase_storage(tmp_path)

    url = storage.save(_upload(PNG_BYTES, "image/png"))

    assert url.startswith(
        "https://abc.supabase.co/storage/v1/object/public/report-photos/"
    )
    assert url.endswith(".png")

    # Bucket was ensured (POST /storage/v1/bucket) then the object uploaded.
    bucket_posts = [c for c in mock.post_calls if "/storage/v1/bucket" in c[0]]
    assert bucket_posts, "bucket must be ensured before upload"
    upload_posts = [c for c in mock.post_calls if "/storage/v1/object/report-photos/" in c[0]]
    assert upload_posts
    _url, kwargs = upload_posts[0]
    assert kwargs["headers"]["Authorization"] == "Bearer svc-key"
    assert kwargs["content"] == PNG_BYTES


def test_save_falls_back_to_local_when_supabase_not_configured(tmp_path) -> None:
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=1024 * 1024)
    url = storage.save(_upload(PNG_BYTES, "image/png"))
    assert url.startswith("/media/")
    assert (tmp_path / url.rsplit("/", 1)[-1]).read_bytes() == PNG_BYTES


def test_read_supabase_full_url(tmp_path, monkeypatch) -> None:
    mock = _SupabaseHTTPMock(monkeypatch)
    mock.get_responses["/object/public/report-photos/"] = _FakeResp(
        200, content=PNG_BYTES, headers={"content-type": "image/png"}
    )
    storage = _supabase_storage(tmp_path)

    data, mime = storage.read_image(
        "https://abc.supabase.co/storage/v1/object/public/report-photos/x.png"
    )
    assert data == PNG_BYTES
    assert mime == "image/png"


def test_read_supabase_bare_path_builds_public_url(tmp_path, monkeypatch) -> None:
    mock = _SupabaseHTTPMock(monkeypatch)
    mock.get_responses["/object/public/report-photos/x.png"] = _FakeResp(
        200, content=PNG_BYTES, headers={"content-type": "image/png"}
    )
    storage = _supabase_storage(tmp_path)

    data, mime = storage.read_image("x.png")
    assert data == PNG_BYTES
    assert mime == "image/png"
    assert (
        mock.get_calls[0][0]
        == "https://abc.supabase.co/storage/v1/object/public/report-photos/x.png"
    )


def test_read_supabase_404_raises_filenotfound(tmp_path, monkeypatch) -> None:
    mock = _SupabaseHTTPMock(monkeypatch)
    mock.get_responses["/object/public/report-photos/"] = _FakeResp(404)
    storage = _supabase_storage(tmp_path)

    with pytest.raises(FileNotFoundError):
        storage.read_image(
            "https://abc.supabase.co/storage/v1/object/public/report-photos/gone.png"
        )


def test_read_supabase_network_error_raises_storage_unavailable(tmp_path, monkeypatch) -> None:
    def _boom(url, **kwargs):
        raise httpx.ConnectError("network down")

    monkeypatch.setattr("httpx.get", _boom)
    storage = _supabase_storage(tmp_path)

    with pytest.raises(StorageUnavailableError):
        storage.read_image(
            "https://abc.supabase.co/storage/v1/object/public/report-photos/x.png"
        )


def test_read_supabase_5xx_raises_storage_unavailable(tmp_path, monkeypatch) -> None:
    mock = _SupabaseHTTPMock(monkeypatch)
    mock.get_responses["/object/public/report-photos/"] = _FakeResp(503)
    storage = _supabase_storage(tmp_path)

    with pytest.raises(StorageUnavailableError):
        storage.read_image(
            "https://abc.supabase.co/storage/v1/object/public/report-photos/x.png"
        )


def test_read_supabase_unconfigured_raises_filenotfound(tmp_path) -> None:
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=1024)
    with pytest.raises(FileNotFoundError):
        storage.read_image("report-photos/x.png")


def test_delete_dispatches_to_supabase_remove(tmp_path, monkeypatch) -> None:
    mock = _SupabaseHTTPMock(monkeypatch)
    storage = _supabase_storage(tmp_path)

    storage.delete(
        "https://abc.supabase.co/storage/v1/object/public/report-photos/x.png"
    )

    assert len(mock.delete_calls) == 1
    del_url, kwargs = mock.delete_calls[0]
    assert del_url == "https://abc.supabase.co/storage/v1/object/report-photos/x.png"
    assert kwargs["headers"]["Authorization"] == "Bearer svc-key"


def test_ensure_bucket_creates_public_bucket(tmp_path, monkeypatch) -> None:
    mock = _SupabaseHTTPMock(monkeypatch)
    mock.post_responses["/storage/v1/bucket"] = _FakeResp(200)
    storage = _supabase_storage(tmp_path)

    storage._ensure_bucket()

    assert storage._bucket_ensured is True
    bucket_post = [c for c in mock.post_calls if "/storage/v1/bucket" in c[0]][0]
    assert bucket_post[1]["json"] == {
        "id": "report-photos",
        "name": "report-photos",
        "public": True,
    }


def test_ensure_bucket_confirms_existing(tmp_path, monkeypatch) -> None:
    mock = _SupabaseHTTPMock(monkeypatch)
    mock.post_responses["/storage/v1/bucket"] = _FakeResp(400)  # already exists
    mock.get_responses["/storage/v1/bucket"] = _FakeResp(200)
    storage = _supabase_storage(tmp_path)

    storage._ensure_bucket()

    assert storage._bucket_ensured is True
    assert any("/storage/v1/bucket" in c[0] for c in mock.get_calls)


def test_ensure_bucket_failure_raises_503(tmp_path, monkeypatch) -> None:
    mock = _SupabaseHTTPMock(monkeypatch)
    mock.post_responses["/storage/v1/bucket"] = _FakeResp(500)
    storage = _supabase_storage(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        storage._ensure_bucket()
    assert exc_info.value.status_code == 503


def test_save_supabase_failure_raises_503_and_writes_nothing(
    tmp_path, monkeypatch
) -> None:
    mock = _SupabaseHTTPMock(monkeypatch)
    mock.post_responses["/storage/v1/bucket"] = _FakeResp(200)
    mock.post_responses["/storage/v1/object/report-photos/"] = _FakeResp(500)
    storage = _supabase_storage(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        storage.save(_upload(PNG_BYTES, "image/png"))
    assert exc_info.value.status_code == 503
    # Never silently falls back to the ephemeral local disk.
    assert list(tmp_path.iterdir()) == []
