import type { CutCandidate, GeminiClient } from "@clearcut/integrations";
import type { CutVersion } from "@clearcut/contracts";

import type { AssetStore } from "../repositories/asset-store";

export async function cutStage(
  version: CutVersion | null,
  productionTitle: string,
  screenplayDigest: string,
  assetStore: AssetStore,
  gemini: GeminiClient,
): Promise<{ detections: CutCandidate[]; notes: string }> {
  if (!version) return { detections: [], notes: "" };
  const asset = await assetStore.read(version.storage_key);
  const bytes = new Uint8Array(await new Response(asset.body).arrayBuffer());
  const result = await gemini.scanCut({
    productionTitle,
    sourceVersion: version.label,
    durationSeconds: version.duration_s,
    mimeType: version.mime_type,
    bytes,
    screenplayDigest,
  });
  return result;
}
