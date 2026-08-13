from pathlib import Path

import pytest

from backend.app.assets import FilesystemAssetStore, StoredAsset
from backend.app.pipeline import start_project


@pytest.mark.asyncio
async def test_filesystem_store_uses_an_opaque_key(tmp_path: Path) -> None:
    store = FilesystemAssetStore(tmp_path)

    asset = await store.put_bytes(b"cut", "../../rough cut.mp4", "video/mp4")

    assert "rough cut.mp4" not in asset.key
    assert "/" not in asset.key
    assert await store.read_bytes(asset.key) == b"cut"
    assert not (tmp_path.parent / "rough cut.mp4").exists()


@pytest.mark.asyncio
async def test_filesystem_store_rejects_non_opaque_keys(tmp_path: Path) -> None:
    store = FilesystemAssetStore(tmp_path)

    with pytest.raises(ValueError, match="asset key"):
        await store.read_bytes("../outside")


@pytest.mark.asyncio
async def test_local_path_materializes_the_stored_asset(tmp_path: Path) -> None:
    store = FilesystemAssetStore(tmp_path)
    asset = await store.put_bytes(b"screenplay", "draft.fountain", "text/plain")

    async with store.local_path(asset.key) as path:
        assert path.read_bytes() == b"screenplay"
        assert path.parent == tmp_path

    assert await store.read_bytes(asset.key) == b"screenplay"


@pytest.mark.asyncio
async def test_delete_removes_only_the_requested_asset(tmp_path: Path) -> None:
    store = FilesystemAssetStore(tmp_path)
    first = await store.put_bytes(b"first", "one.mp4", "video/mp4")
    second = await store.put_bytes(b"second", "two.mp4", "video/mp4")

    await store.delete(first.key)

    with pytest.raises(FileNotFoundError):
        await store.read_bytes(first.key)
    assert await store.read_bytes(second.key) == b"second"


@pytest.mark.asyncio
async def test_project_persists_asset_metadata_before_background_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def discard(coroutine):
        coroutine.close()
        return None

    monkeypatch.setattr("backend.app.pipeline.asyncio.create_task", discard)
    script = StoredAsset("a" * 32, "draft.fountain", "text/plain", 12)
    cut = StoredAsset("b" * 32, "assembly.mp4", "video/mp4", 34)

    project = await start_project(script, cut, 42.0, title="Night Drive")

    assert project.script is not None
    assert project.script.storage_key == script.key
    assert project.script_history == [project.script]
    assert project.cut is not None
    assert project.cut.storage_key == cut.key
    assert project.cut.media_url == f"/api/projects/{project.id}/cut"
    assert project.cut_history == [project.cut]
