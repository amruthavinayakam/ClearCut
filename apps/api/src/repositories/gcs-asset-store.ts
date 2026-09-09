import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage, type Bucket } from "@google-cloud/storage";

import {
  AssetStoreError,
  type AssetMetadata,
  type AssetRead,
  type AssetStore,
  type ByteRange,
  type StoredAsset,
} from "./asset-store";

/**
 * Durable media for the Cloud Run deployment.
 *
 * Cloud Run's filesystem is in-memory and per-instance, so a screenplay or cut
 * written to disk survives only until that instance goes away. Objects here
 * outlive the revision.
 */
export class GcsAssetStore implements AssetStore {
  readonly #bucket: Bucket;

  constructor(options: { bucket: string; projectId?: string }) {
    this.#bucket = new Storage(options.projectId ? { projectId: options.projectId } : {})
      .bucket(options.bucket);
  }

  /** Object keys are server-generated, but never trust one into a path. */
  #file(key: string) {
    if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\")) {
      throw new AssetStoreError("invalid_asset_key", `Invalid asset key: ${key}`);
    }
    return this.#bucket.file(key);
  }

  async put(input: ReadableStream<Uint8Array>, metadata: AssetMetadata): Promise<StoredAsset> {
    const file = this.#file(metadata.key);
    await file.save(Buffer.from(await new Response(input).arrayBuffer()), {
      resumable: false,
      contentType: metadata.contentType,
      metadata: { metadata: { filename: metadata.filename } },
    });
    const [info] = await file.getMetadata();
    const size = Number(info.size ?? 0);
    if (metadata.sizeBytes !== size) {
      await file.delete({ ignoreNotFound: true });
      throw new AssetStoreError("asset_size_mismatch", "Stored bytes do not match the declared size.");
    }
    return { ...metadata, etag: String(info.etag ?? size) };
  }

  async stat(key: string): Promise<StoredAsset> {
    const file = this.#file(key);
    let info;
    try {
      [info] = await file.getMetadata();
    } catch {
      throw new AssetStoreError("asset_not_found", `Asset not found: ${key}`);
    }
    return {
      key,
      filename: String(info.metadata?.filename ?? key.split("/").at(-1) ?? "asset"),
      contentType: String(info.contentType ?? "application/octet-stream"),
      sizeBytes: Number(info.size ?? 0),
      etag: String(info.etag ?? info.size ?? ""),
    };
  }

  async read(key: string, range?: ByteRange): Promise<AssetRead> {
    const stored = await this.stat(key);
    if (range && (range.start < 0 || range.end < range.start || range.end >= stored.sizeBytes)) {
      throw new AssetStoreError("invalid_asset_range", "The requested byte range is invalid.");
    }
    // GCS ranges are inclusive, matching ByteRange.
    const stream = this.#file(key).createReadStream(
      range ? { start: range.start, end: range.end } : undefined,
    );
    return {
      body: stream as unknown as ReadableStream<Uint8Array>,
      contentType: stored.contentType,
      sizeBytes: range ? range.end - range.start + 1 : stored.sizeBytes,
      totalSizeBytes: stored.sizeBytes,
      range: range ?? null,
    };
  }

  async delete(key: string): Promise<void> {
    await this.#file(key).delete({ ignoreNotFound: true });
  }

  /**
   * ffprobe needs a real path, so the object is staged to a temp file for the
   * duration of the call and removed afterwards.
   */
  async localPath<T>(key: string, use: (path: string) => Promise<T>): Promise<T> {
    const stored = await this.stat(key);
    const directory = await mkdtemp(join(tmpdir(), "clearcut-asset-"));
    const path = join(directory, stored.filename.replace(/[^\w.-]/g, "_") || "asset");
    try {
      await this.#file(key).download({ destination: path });
      return await use(path);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }
}
