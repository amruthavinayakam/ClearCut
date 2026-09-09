import { resolve } from "node:path";

export type ApiConfig = {
  host: string;
  port: number;
  assetStorageDir: string;
  projectStorageDir: string;
  ffprobePath: string;
  maxUploadBytes: number;
  mockResearch: boolean;
  researchConcurrency: number;
  researchDepth: "fast" | "deep";
  caseResearchTimeoutMs: number | null;
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
    projectStorageDir: resolve(env.PROJECT_STORAGE_DIR ?? ".clearcut/projects"),
    ffprobePath: env.FFPROBE_PATH ?? "ffprobe",
    maxUploadBytes: positiveInteger(env.MAX_UPLOAD_BYTES, 200 * 1024 * 1024),
    mockResearch: env.MOCK_RESEARCH?.toLocaleLowerCase() === "true",
    // Cases research in one wave, so wall-clock time is set by the slowest of
    // them rather than by throughput. A ceiling above a typical production's
    // case count keeps it to a single wave.
    researchConcurrency: positiveInteger(env.RESEARCH_CONCURRENCY, 32),
    // `fast` retrieves with Parallel Search and reasons over the results with a
    // Gemini agent, which is seconds per case. `deep` hands each case to a
    // Parallel Task that searches again on its own: a richer basis, at 100-250s
    // per case with tails well past that. Interactive review needs the former.
    researchDepth: env.RESEARCH_DEPTH?.trim() === "deep" ? "deep" : "fast",
    // Null means the depth's own budget applies. Set it to cap the wait
    // explicitly and accept more cases landing as recorded gaps.
    caseResearchTimeoutMs: Number.isInteger(Number(env.CASE_RESEARCH_TIMEOUT_MS)) && Number(env.CASE_RESEARCH_TIMEOUT_MS) > 0
      ? Number(env.CASE_RESEARCH_TIMEOUT_MS)
      : null,
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
    // `base` over `core`: a core run measured around four minutes per case,
    // which put a whole production out of reach of an interactive review.
    // Depth drops with it — fewer supporting excerpts and confidences — so this
    // is a latency choice, reversible with the env var.
    parallelProcessor: env.PARALLEL_PROCESSOR?.trim() ?? "base",
    parallelMonitorProcessor: env.PARALLEL_MONITOR_PROCESSOR?.trim() ?? "lite",
    publicBaseUrl: env.PUBLIC_BASE_URL?.trim() ?? "",
    webhookSecret: env.PARALLEL_WEBHOOK_SECRET?.trim() ?? "",
    cloudflareBindingOrigin: env.CLOUDFLARE_BINDING_ORIGIN?.trim() ?? "",
    cloudflareBindingNonce: env.CLOUDFLARE_BINDING_NONCE?.trim() ?? "",
  };
}
