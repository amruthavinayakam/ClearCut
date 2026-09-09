import { describe, expect, test } from "bun:test";

import { PreflightResultSchema } from "@clearcut/contracts";
import { createTestApi } from "./test-app";

async function preflight(app: Awaited<ReturnType<typeof createTestApi>>["app"], file: File) {
  const body = new FormData();
  body.set("file", file);
  const response = await app.request("/api/uploads/preflight", { method: "POST", body });
  return { response, result: PreflightResultSchema.parse(await response.json()) };
}

describe("upload preflight", () => {
  test("reports readable Fountain structure", async () => {
    const { app } = await createTestApi();
    const { response, result } = await preflight(app, new File([
      "Title: Night Drive\n\nINT. CAR - NIGHT\nA radio plays under the dialogue.",
    ], "film.fountain", { type: "text/plain" }));

    expect(response.status).toBe(200);
    expect(result).toMatchObject({ kind: "screenplay", accepted: true });
    expect(result.details.scene_count).toBe(1);
    expect(result.details.readable_text).toBe(true);
  });

  test("returns explicit codes for unsupported, empty, and oversized inputs", async () => {
    const { app } = await createTestApi({
      config: {
        host: "127.0.0.1",
        port: 3001,
        assetStorageDir: ".clearcut/test-assets",
        ffprobePath: "ffprobe",
        maxUploadBytes: 4,
        mockResearch: true,
        researchConcurrency: 4,
    caseResearchTimeoutMs: 300_000,
        googleApiKey: "",
        geminiModel: "gemini-3.8-flash",
        googleCloudProject: "",
        googleCloudLocation: "us-central1",
        firestoreCollection: "",
        gcsBucket: "",
        parallelApiKey: "",
        parallelProcessor: "core",
        parallelMonitorProcessor: "lite",
        publicBaseUrl: "",
        webhookSecret: "test-secret",
        cloudflareBindingOrigin: "",
        cloudflareBindingNonce: "",
      },
    });
    const unsupported = await preflight(app, new File(["bad"], "rights.exe"));
    const empty = await preflight(app, new File([" \n"], "empty.txt", { type: "text/plain" }));
    const oversized = await preflight(app, new File(["12345"], "long.txt", { type: "text/plain" }));

    expect(unsupported.result.errors[0].code).toBe("unsupported_type");
    expect(empty.result.errors[0].code).toBe("no_text_layer");
    expect(oversized.result.errors[0].code).toBe("too_large");
  });
});
