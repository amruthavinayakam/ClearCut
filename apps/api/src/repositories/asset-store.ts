export type AssetMetadata = {
  key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

export type StoredAsset = AssetMetadata & {
  etag: string;
};

export type ByteRange = {
  start: number;
  end: number;
};

export type AssetRead = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  sizeBytes: number;
  totalSizeBytes: number;
  range: ByteRange | null;
};

export class AssetStoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AssetStoreError";
  }
}

export interface AssetStore {
  put(input: ReadableStream<Uint8Array>, metadata: AssetMetadata): Promise<StoredAsset>;
  stat(key: string): Promise<StoredAsset>;
  read(key: string, range?: ByteRange): Promise<AssetRead>;
  delete(key: string): Promise<void>;
  localPath?<T>(key: string, use: (path: string) => Promise<T>): Promise<T>;
}
