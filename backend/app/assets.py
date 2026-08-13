"""Persistent storage for uploaded production assets.

The project model keeps opaque storage keys, never process-local paths.  Local
development uses a filesystem directory; production can use the same contract
against Google Cloud Storage.
"""

from __future__ import annotations

import asyncio
import re
import tempfile
import uuid
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import AsyncIterator, Optional

from .config import get_settings


_KEY_PATTERN = re.compile(r"^[a-f0-9]{32}$")


@dataclass(frozen=True, slots=True)
class StoredAsset:
    key: str
    original_name: str
    mime_type: str
    size_bytes: int


def _validate_key(key: str) -> str:
    if not _KEY_PATTERN.fullmatch(key):
        raise ValueError("Invalid asset key.")
    return key


class AssetStore(ABC):
    @abstractmethod
    async def put_bytes(
        self, data: bytes, original_name: str, mime_type: str
    ) -> StoredAsset:
        raise NotImplementedError

    @abstractmethod
    async def read_bytes(self, key: str) -> bytes:
        raise NotImplementedError

    @abstractmethod
    @asynccontextmanager
    async def local_path(self, key: str) -> AsyncIterator[Path]:
        raise NotImplementedError
        yield Path()  # pragma: no cover

    @abstractmethod
    async def delete(self, key: str) -> None:
        raise NotImplementedError

    def cloud_uri(self, key: str) -> Optional[str]:
        _validate_key(key)
        return None


class FilesystemAssetStore(AssetStore):
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self.root / _validate_key(key)

    async def put_bytes(
        self, data: bytes, original_name: str, mime_type: str
    ) -> StoredAsset:
        key = uuid.uuid4().hex
        await asyncio.to_thread(self._path(key).write_bytes, data)
        return StoredAsset(
            key=key,
            original_name=original_name,
            mime_type=mime_type or "application/octet-stream",
            size_bytes=len(data),
        )

    async def read_bytes(self, key: str) -> bytes:
        return await asyncio.to_thread(self._path(key).read_bytes)

    @asynccontextmanager
    async def local_path(self, key: str) -> AsyncIterator[Path]:
        path = self._path(key)
        if not await asyncio.to_thread(path.is_file):
            raise FileNotFoundError(key)
        yield path

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._path(key).unlink, missing_ok=True)


class GCSAssetStore(AssetStore):
    def __init__(self, bucket_name: str, prefix: str = "clearcut-assets") -> None:
        from google.cloud import storage

        settings = get_settings()
        self.bucket_name = bucket_name
        self.prefix = prefix.strip("/")
        self._client = storage.Client(project=settings.google_cloud_project or None)
        self._bucket = self._client.bucket(bucket_name)

    def _object_name(self, key: str) -> str:
        return f"{self.prefix}/{_validate_key(key)}"

    def _blob(self, key: str):
        return self._bucket.blob(self._object_name(key))

    async def put_bytes(
        self, data: bytes, original_name: str, mime_type: str
    ) -> StoredAsset:
        key = uuid.uuid4().hex
        content_type = mime_type or "application/octet-stream"
        blob = self._blob(key)
        await asyncio.to_thread(
            blob.upload_from_string,
            data,
            content_type=content_type,
        )
        return StoredAsset(
            key=key,
            original_name=original_name,
            mime_type=content_type,
            size_bytes=len(data),
        )

    async def read_bytes(self, key: str) -> bytes:
        return await asyncio.to_thread(self._blob(key).download_as_bytes)

    @asynccontextmanager
    async def local_path(self, key: str) -> AsyncIterator[Path]:
        data = await self.read_bytes(key)
        with tempfile.TemporaryDirectory(prefix="clearcut-asset-") as directory:
            path = Path(directory) / "asset"
            await asyncio.to_thread(path.write_bytes, data)
            yield path

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._blob(key).delete)

    def cloud_uri(self, key: str) -> str:
        return f"gs://{self.bucket_name}/{self._object_name(key)}"


@lru_cache(maxsize=1)
def get_asset_store() -> AssetStore:
    settings = get_settings()
    if settings.gcs_bucket:
        return GCSAssetStore(settings.gcs_bucket)
    return FilesystemAssetStore(Path(settings.asset_storage_dir))
