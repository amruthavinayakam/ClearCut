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
  googleCloudProject: string;
  googleCloudLocation: string;
  firestoreCollection: string;
  gcsBucket: string;
  parallelApiKey: string;
  parallelProcessor: string;
  parallelMonitorProcessor: string;
  publicBaseUrl: string;
  webhookSecret: string;
  cloudflareBindingOrigin: string;
  cloudflareBindingNonce: string;
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
    // A `core` Task run measures around four minutes, so wall-clock time is
    // set by how many waves the pool needs, not by throughput. 19 cases against
    // 16 workers cost two full waves for the sake of three cases; a ceiling
    // above a typical production's case count keeps it to one.
    researchConcurrency: positiveInteger(env.RESEARCH_CONCURRENCY, 32),
    googleApiKey: env.GOOGLE_API_KEY?.trim() ?? "",
    geminiModel: env.GEMINI_MODEL?.trim() ?? "gemini-3.8-flash",
    // Set GOOGLE_CLOUD_PROJECT to bill Gemini through Vertex AI on the project's
    // own credentials instead of carrying an API key. Cloud Run supplies these.
    googleCloudProject: env.GOOGLE_CLOUD_PROJECT?.trim() ?? "",
    googleCloudLocation: env.GOOGLE_CLOUD_LOCATION?.trim() ?? "global",
    // Durable storage for the Cloud Run deployment. Without these the API
    // keeps projects in memory and media in /tmp, and every instance restart
    // — including a redeploy — discards all of it.
    firestoreCollection: env.FIRESTORE_COLLECTION?.trim() ?? "",
    gcsBucket: env.GCS_BUCKET?.trim() ?? "",
    parallelApiKey: env.PARALLEL_API_KEY?.trim() ?? "",
    parallelProcessor: env.PARALLEL_PROCESSOR?.trim() ?? "core",
    parallelMonitorProcessor: env.PARALLEL_MONITOR_PROCESSOR?.trim() ?? "lite",
    publicBaseUrl: env.PUBLIC_BASE_URL?.trim() ?? "",
    webhookSecret: env.PARALLEL_WEBHOOK_SECRET?.trim() ?? "",
    cloudflareBindingOrigin: env.CLOUDFLARE_BINDING_ORIGIN?.trim() ?? "",
    cloudflareBindingNonce: env.CLOUDFLARE_BINDING_NONCE?.trim() ?? "",
  };
}
