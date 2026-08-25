import type { ClearanceItem, ReconciliationFinding } from "@clearcut/contracts";

export function reconciliationSummary(items: ClearanceItem[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.provenance] = (counts[item.provenance] ?? 0) + 1;
    return counts;
  }, {});
}

export function alarmingFindings(findings: ReconciliationFinding[]): ReconciliationFinding[] {
  return findings.filter((finding) => ["cut_only", "materially_changed", "approval_stale"].includes(finding.kind));
}
