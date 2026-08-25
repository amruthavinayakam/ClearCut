import { resolve } from "node:path";

export type ApiConfig = {
  host: string;
  port: number;
  assetStorageDir: string;
  ffprobePath: string;
  maxUploadBytes: number;
  mockResearch: boolean;
  researchConcurrency: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readConfig(env: Record<string, string | undefined> = process.env): ApiConfig {
  return {
    host: env.HOST ?? "127.0.0.1",
    port: positiveInteger(env.PORT, 3001),
    assetStorageDir: resolve(env.ASSET_STORAGE_DIR ?? ".clearcut/assets"),
    ffprobePath: env.FFPROBE_PATH ?? "ffprobe",
    maxUploadBytes: positiveInteger(env.MAX_UPLOAD_BYTES, 200 * 1024 * 1024),
    mockResearch: env.MOCK_RESEARCH?.toLocaleLowerCase() === "true",
    researchConcurrency: positiveInteger(env.RESEARCH_CONCURRENCY, 16),
  };
}
