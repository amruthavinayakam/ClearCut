import type { Dossier } from "./types";

export const VERIFIED_SAMPLE_TITLE = "Artemis I — Launch to the Moon";

export function isVerifiedSample(productionTitle: string): boolean {
  return productionTitle.trim().toLocaleLowerCase() === VERIFIED_SAMPLE_TITLE.toLocaleLowerCase();
}

export type VerifiedSource = {
  url: string;
  title: string;
  excerpt: string;
  publish_date: string | null;
};

type VerifiedCase = Omit<Dossier, "run_id" | "basis"> & { source_keys: string[] };

type VerifiedResearchCatalog = {
  sources: Record<string, VerifiedSource>;
  cases: Record<string, VerifiedCase>;
};

/**
 * The hand-checked research behind the sample production.
 *
 * Both fixture clients read it, so the offline demo tells one story whichever
 * provider a stage would have called.
 */
export async function verifiedResearch(): Promise<VerifiedResearchCatalog> {
  return Bun.file(new URL("../../../fixtures/research/artemis/research.json", import.meta.url)).json();
}

export async function verifiedCase(name: string): Promise<{ dossier: VerifiedCase; sources: VerifiedSource[] }> {
  const catalog = await verifiedResearch();
  const dossier = catalog.cases[name];
  if (!dossier) throw new Error(`Verified sample research is missing for ${name}.`);
  const sources = dossier.source_keys
    .map((key) => catalog.sources[key])
    .filter((source): source is VerifiedSource => Boolean(source));
  return { dossier, sources };
}
