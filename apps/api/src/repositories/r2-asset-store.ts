import type {
  AssetMetadata,
  AssetRead,
  AssetStore,
  ByteRange,
  StoredAsset,
} from "./asset-store";
import { AssetStoreError } from "./asset-store";
import { CloudflareBindingError, type CloudflareBindingClient } from "./cloudflare-binding-client";

function assetPath(key: string): string {
  if (!key || key.startsWith("/") || key.includes("..")) throw new AssetStoreError("invalid_asset_key", "Asset key is outside the allowed scope.");
  return `/assets/${encodeURIComponent(key)}`;
}

function numericHeader(response: Response, name: string): number {
  const value = Number(response.headers.get(name));
  if (!Number.isFinite(value) || value < 0) throw new AssetStoreError("invalid_asset_response", `Missing ${name} from R2 bridge.`);
  return value;
}

export class R2AssetStore implements AssetStore {
  constructor(readonly client: CloudflareBindingClient) {}

  async put(input: ReadableStream<Uint8Array>, metadata: AssetMetadata): Promise<StoredAsset> {
    const response = await this.client.json<{
      key: string; filename?: string; contentType: string; sizeBytes: number; etag: string;
    }>(assetPath(metadata.key), {
      method: "PUT",
      headers: {
        "content-type": metadata.contentType,
        "content-length": String(metadata.sizeBytes),
        "x-clearcut-filename": encodeURIComponent(metadata.filename),
      },
      body: input,
    });
    if (response.sizeBytes !== metadata.sizeBytes) throw new AssetStoreError("asset_size_mismatch", "Stored bytes do not match the declared size.");
    return {
      key: response.key,
      filename: response.filename ?? metadata.filename,
      contentType: response.contentType,
      sizeBytes: response.sizeBytes,
      etag: response.etag,
    };
  }

  async stat(key: string): Promise<StoredAsset> {
    try {
      const response = await this.client.request(assetPath(key), { method: "HEAD" });
      return {
        key,
        filename: decodeURIComponent(response.headers.get("x-clearcut-filename") ?? key.split("/").at(-1) ?? "asset"),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
        sizeBytes: numericHeader(response, "content-length"),
        etag: response.headers.get("etag")?.replace(/^"|"$/g, "") ?? "",
      };
    } catch (error) {
      if (error instanceof CloudflareBindingError && error.status === 404) throw new AssetStoreError("asset_not_found", "Asset not found.");
      throw error;
    }
  }

  async read(key: string, range?: ByteRange): Promise<AssetRead> {
    try {
      const response = await this.client.request(assetPath(key), {
        headers: range ? { range: `bytes=${range.start}-${range.end}` } : undefined,
      });
      const contentRange = response.headers.get("content-range")?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      const parsedRange = contentRange ? { start: Number(contentRange[1]), end: Number(contentRange[2]) } : null;
      return {
        body: response.body ?? new ReadableStream(),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
        sizeBytes: numericHeader(response, "content-length"),
        totalSizeBytes: contentRange ? Number(contentRange[3]) : numericHeader(response, "content-length"),
        range: parsedRange,
      };
    } catch (error) {
      if (error instanceof CloudflareBindingError && error.status === 404) throw new AssetStoreError("asset_not_found", "Asset not found.");
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.request(assetPath(key), { method: "DELETE" });
  }
}
