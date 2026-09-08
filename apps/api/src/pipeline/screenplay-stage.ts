import type { GeminiClient, ScriptCandidate } from "@clearcut/integrations";

import type { ScriptVersion } from "@clearcut/contracts";
import { parseScreenplay } from "../media/screenplay";
import type { AssetStore } from "../repositories/asset-store";

async function bytesFrom(store: AssetStore, key: string): Promise<Uint8Array> {
  const read = await store.read(key);
  return new Uint8Array(await new Response(read.body).arrayBuffer());
}

export async function screenplayStage(
  version: ScriptVersion | null,
  productionTitle: string,
  assetStore: AssetStore,
  gemini: GeminiClient,
): Promise<{ candidates: ScriptCandidate[]; digest: string; metadata: { title: string; pageCount: number; sceneCount: number } | null }> {
  if (!version) return { candidates: [], digest: "", metadata: null };
  const bytes = await bytesFrom(assetStore, version.storage_key);
  const document = await parseScreenplay(bytes, version.filename);
  const result = await gemini.scanScreenplay({
    productionTitle,
    sourceVersion: version.label,
    scenes: document.scenes,
  });
  const digest = result.candidates.map((candidate) => `${candidate.name} (${candidate.category})`).join("\n");
  return {
    candidates: result.candidates,
    digest,
    metadata: { title: document.title, pageCount: document.pageCount, sceneCount: document.scenes.length },
  };
}
