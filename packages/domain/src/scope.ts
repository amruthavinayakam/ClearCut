import type {
  DocumentScope,
  IntendedUseProfile,
  ScopeAssessment,
} from "@clearcut/contracts";

function normalized(values: string[]): Map<string, string> {
  return new Map(
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => [value.toLocaleLowerCase(), value]),
  );
}

function dateValue(value: string | null): number | null {
  if (!value) return null;
  const date = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(date) ? null : date;
}

function titleCase(value: string): string {
  return value.length === 0 ? value : value[0].toLocaleUpperCase() + value.slice(1).toLocaleLowerCase();
}

export function assessScope(intended: IntendedUseProfile, recorded: DocumentScope): ScopeAssessment {
  const recordedEnd = dateValue(recorded.ends_on);
  const intendedStart = dateValue(intended.starts_on);
  if (!recorded.perpetual && recordedEnd !== null && intendedStart !== null && recordedEnd < intendedStart) {
    return { outcome: "expired", gaps: ["Recorded term ends before intended use begins."] };
  }

  const unknown: string[] = [];
  if (recorded.media.length === 0) unknown.push("Recorded media is missing.");
  if (recorded.territories.length === 0) unknown.push("Recorded territories are missing.");
  if (!recorded.perpetual && !recorded.starts_on && !recorded.ends_on) {
    unknown.push("Recorded term is missing.");
  }
  if (unknown.length) return { outcome: "unknown", gaps: unknown };

  const gaps: string[] = [];
  const recordedMedia = normalized(recorded.media);
  const recordedTerritories = normalized(recorded.territories);
  for (const [key, label] of normalized(intended.media)) {
    if (!recordedMedia.has(key)) gaps.push(`${titleCase(label)} is not listed in recorded media.`);
  }
  for (const [key, label] of normalized(intended.territories)) {
    if (!recordedTerritories.has(key)) gaps.push(`${label.toLocaleUpperCase()} is not listed in recorded territories.`);
  }
  if (!recorded.perpetual) {
    const recordedStart = dateValue(recorded.starts_on);
    const intendedEnd = dateValue(intended.ends_on);
    if (recordedStart !== null && intendedStart !== null && recordedStart > intendedStart) {
      gaps.push("Recorded term starts after intended use begins.");
    }
    if (recordedEnd !== null && intendedEnd !== null && recordedEnd < intendedEnd) {
      gaps.push("Recorded term ends before intended use ends.");
    }
  }
  return { outcome: gaps.length ? "partial" : "covers", gaps };
}
