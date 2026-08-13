import type { IntendedUseProfile, ProductionDocument, ScopeAssessment as Assessment } from "../../types";


function normalise(values: string[]) {
  return new Set(values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean));
}

export function assessDocumentScope(
  intended: IntendedUseProfile,
  document: ProductionDocument,
): Assessment {
  if (
    !document.perpetual &&
    document.ends_on &&
    intended.starts_on &&
    document.ends_on < intended.starts_on
  ) {
    return { outcome: "expired", gaps: ["Recorded term ends before intended use begins."] };
  }
  const unknown: string[] = [];
  if (!document.media.length) unknown.push("Recorded media is missing.");
  if (!document.territories.length) unknown.push("Recorded territories are missing.");
  if (!document.perpetual && !document.starts_on && !document.ends_on) {
    unknown.push("Recorded term is missing.");
  }
  if (unknown.length) return { outcome: "unknown", gaps: unknown };

  const media = normalise(document.media);
  const territories = normalise(document.territories);
  const gaps = [
    ...intended.media
      .filter((value) => !media.has(value.toLocaleLowerCase()))
      .map((value) => `${value[0]?.toLocaleUpperCase()}${value.slice(1)} is not listed in recorded media.`),
    ...intended.territories
      .filter((value) => !territories.has(value.toLocaleLowerCase()))
      .map((value) => `${value.toLocaleUpperCase()} is not listed in recorded territories.`),
  ];
  if (!document.perpetual && document.starts_on && intended.starts_on && document.starts_on > intended.starts_on) {
    gaps.push("Recorded term starts after intended use begins.");
  }
  if (!document.perpetual && document.ends_on && intended.ends_on && document.ends_on < intended.ends_on) {
    gaps.push("Recorded term ends before intended use ends.");
  }
  return { outcome: gaps.length ? "partial" : "covers", gaps };
}

const LABEL: Record<Assessment["outcome"], string> = {
  covers: "Scope covers intended use",
  partial: "Recorded scope has gaps",
  unknown: "Scope cannot be compared",
  expired: "Recorded term is expired",
};

export default function ScopeAssessment({ assessment }: { assessment: Assessment }) {
  return (
    <div className={`scope-assessment scope-assessment--${assessment.outcome}`}>
      <strong>{LABEL[assessment.outcome]}</strong>
      {assessment.gaps.length ? (
        <ul>{assessment.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
      ) : null}
      <small>Metadata comparison only — human legal review remains required.</small>
    </div>
  );
}
