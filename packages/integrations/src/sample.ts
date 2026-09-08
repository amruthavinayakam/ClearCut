export const VERIFIED_SAMPLE_TITLE = "Artemis I — Launch to the Moon";

export function isVerifiedSample(productionTitle: string): boolean {
  return productionTitle.trim().toLocaleLowerCase() === VERIFIED_SAMPLE_TITLE.toLocaleLowerCase();
}
