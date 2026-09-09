import type { ScopeAssessment as ScopeAssessmentValue } from "@clearcut/contracts";
import { AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";

const labels: Record<ScopeAssessmentValue["outcome"], string> = {
  covers: "Recorded scope matches",
  partial: "Partial recorded scope",
  unknown: "Scope metadata incomplete",
  expired: "Recorded term expired",
};

export function ScopeAssessment({ assessment }: { assessment: ScopeAssessmentValue }) {
  const Icon = assessment.outcome === "covers" ? CheckCircle2 : assessment.outcome === "unknown" ? HelpCircle : AlertCircle;
  return (
    <section aria-label="Recorded scope assessment" className="border-y border-border py-3">
      <div className="flex items-center gap-2"><Icon className={`size-3.5 ${assessment.outcome === "covers" ? "text-risk-green" : "text-risk-amber"}`} /><span className="text-xs font-medium">{labels[assessment.outcome]}</span><span className="ml-auto font-mono text-[9px] tracking-[0.06em] whitespace-nowrap text-muted-foreground">Metadata comparison only</span></div>
      {assessment.gaps.length > 0 && <ul className="mt-2 list-outside list-disc space-y-1 pl-5 text-xs leading-5 text-pretty text-muted-foreground">{assessment.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>}
    </section>
  );
}
