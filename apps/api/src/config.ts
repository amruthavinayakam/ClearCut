import { resolve } from "node:path";

export type ApiConfig = {
  host: string;
  port: number;
  assetStorageDir: string;
  ffprobePath: string;
  maxUploadBytes: number;
  mockResearch: boolean;
  researchConcurrency: number;
  googleApiKey: string;
  geminiModel: string;
  parallelApiKey: string;
  parallelProcessor: string;
  parallelMonitorProcessor: string;
  publicBaseUrl: string;
  webhookSecret: string;
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
    googleApiKey: env.GOOGLE_API_KEY?.trim() ?? "",
    geminiModel: env.GEMINI_MODEL?.trim() ?? "gemini-2.5-flash",
    parallelApiKey: env.PARALLEL_API_KEY?.trim() ?? "",
    parallelProcessor: env.PARALLEL_PROCESSOR?.trim() ?? "core",
    parallelMonitorProcessor: env.PARALLEL_MONITOR_PROCESSOR?.trim() ?? "lite",
    publicBaseUrl: env.PUBLIC_BASE_URL?.trim() ?? "",
    webhookSecret: env.PARALLEL_WEBHOOK_SECRET?.trim() ?? "",
  };
}
