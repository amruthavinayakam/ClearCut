import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import {
  AssetStoreError,
  type AssetMetadata,
  type AssetRead,
  type AssetStore,
  type ByteRange,
  type StoredAsset,
} from "./asset-store";

function validateKey(key: string): string {
  if (!key || key.includes("\\") || key.startsWith("/") || key.split("/").includes("..")) {
    throw new AssetStoreError("invalid_asset_key", "invalid_asset_key");
  }
  return key;
}

function etag(size: number, modified: number): string {
  return `W/\"${size.toString(16)}-${Math.floor(modified).toString(16)}\"`;
}

export class FilesystemAssetStore implements AssetStore {
  readonly #root: string;
  readonly #metadata = new Map<string, Pick<AssetMetadata, "filename" | "contentType">>();

  constructor(root: string) {
    this.#root = resolve(root);
  }

  #path(key: string): string {
    const fullPath = resolve(this.#root, validateKey(key));
    if (fullPath !== this.#root && !fullPath.startsWith(`${this.#root}${sep}`)) {
      throw new AssetStoreError("invalid_asset_key", "invalid_asset_key");
    }
    return fullPath;
  }

  async put(input: ReadableStream<Uint8Array>, metadata: AssetMetadata): Promise<StoredAsset> {
    const path = this.#path(metadata.key);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, new Response(input));
    const info = await stat(path);
    if (metadata.sizeBytes !== info.size) {
      await rm(path, { force: true });
      throw new AssetStoreError("asset_size_mismatch", "Stored bytes do not match the declared size.");
    }
    this.#metadata.set(metadata.key, { filename: metadata.filename, contentType: metadata.contentType });
    return { ...metadata, etag: etag(info.size, info.mtimeMs) };
  }

  async stat(key: string): Promise<StoredAsset> {
    const path = this.#path(key);
    let info;
    try {
      info = await stat(path);
    } catch {
      throw new AssetStoreError("asset_not_found", `Asset not found: ${key}`);
    }
    const metadata = this.#metadata.get(key);
    return {
      key,
      filename: metadata?.filename ?? key.split("/").at(-1) ?? "asset",
      contentType: metadata?.contentType ?? "application/octet-stream",
      sizeBytes: info.size,
      etag: etag(info.size, info.mtimeMs),
    };
  }

  async read(key: string, range?: ByteRange): Promise<AssetRead> {
    const stored = await this.stat(key);
    if (range && (range.start < 0 || range.end < range.start || range.end >= stored.sizeBytes)) {
      throw new AssetStoreError("invalid_asset_range", "The requested byte range is invalid.");
    }
    const file = Bun.file(this.#path(key));
    const body = range
      ? file.slice(range.start, range.end + 1).stream()
      : file.stream();
    return {
      body,
      contentType: stored.contentType,
      sizeBytes: range ? range.end - range.start + 1 : stored.sizeBytes,
      totalSizeBytes: stored.sizeBytes,
      range: range ?? null,
    };
  }

  async delete(key: string): Promise<void> {
    await rm(this.#path(key), { force: true });
    this.#metadata.delete(key);
  }

  async localPath<T>(key: string, use: (path: string) => Promise<T>): Promise<T> {
    await this.stat(key);
    return use(this.#path(key));
  }
}
