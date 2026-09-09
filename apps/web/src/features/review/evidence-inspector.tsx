import type { ClearanceItem } from "@clearcut/contracts";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronRight, FileCheck2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentSheet } from "@/features/documents/document-sheet";
import { MonitorControl } from "@/features/monitoring/monitor-control";

import { CaseFacts } from "./case-facts";
import { CategoryIcon } from "./category-icon";
import { DecisionHistory } from "./decision-history";
import { HumanDisposition } from "./human-disposition";
import { SourceLedger } from "./source-ledger";
import { RISK_LABEL, STATUS_LABEL } from "./vocabulary";

/**
 * The case panel: what this is, what to do about it, and a way to act.
 *
 * Everything a coordinator needs to decide is above the fold and the decision
 * itself is pinned to the bottom, always reachable. The research write-up is
 * long, technical and rarely the thing being looked for — it opens on request
 * instead of pushing the facts and the action off the screen.
 */
export function EvidenceInspector({ projectId, item }: { projectId: string; item: ClearanceItem }) {
  const summary = item.research_summary || item.description;

  return (
    <aside className="flex min-w-0 flex-col border-t border-border bg-background xl:min-h-0 xl:border-l xl:border-t-0">
      <div className="shrink-0 border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <Badge className={`risk-badge--${item.color}`} variant="outline">{RISK_LABEL[item.color] ?? "Not rated"}</Badge>
          <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[item.workflow_status]}</span>
        </div>
        <div className="mt-3 flex items-start gap-2.5">
          <CategoryIcon category={item.category} className="mt-0.5" color={item.color} />
          <div className="min-w-0">
            <h2 className="text-base font-medium tracking-[-0.02em] text-balance">{item.name}</h2>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">{item.category.replaceAll("_", " ")}</p>
          </div>
        </div>
      </div>

      <Tabs className="flex min-h-0 flex-1 flex-col" defaultValue="overview">
        {/* `w-full` is the only change the line variant needs: its triggers are
            already flex-1, so they divide the panel between them. The variant
            draws the active tab's rule into the gap the Tabs root leaves below
            the list — adding a border here put a second, competing rule under
            every tab. */}
        <TabsList className="w-full shrink-0" variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="route">Who to ask</TabsTrigger>
          <TabsTrigger value="documents">Files</TabsTrigger>
        </TabsList>

        <ScrollFade className="flex-1" viewportClassName="h-full xl:overflow-y-auto">
          <TabsContent className="p-4" value="overview">
            <CaseFacts item={item} />

            <DecisionHistory item={item} />

            <div className="mt-4 rounded-xl bg-muted/50 p-3.5 shadow-[inset_0_0_0_1px_oklch(0_0_0/0.04)]">
              <p className="text-[11px] font-medium">What to do next</p>
              <p className="mt-1.5 text-xs leading-5 text-pretty text-muted-foreground">{item.recommended_actions[0] ?? "Review the evidence and record the next step."}</p>
            </div>

            {item.evidence_gaps.length > 0 && (
              <div className="mt-3 flex gap-2 rounded-xl bg-risk-amber/8 p-3.5 text-xs leading-5 text-pretty shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--risk-amber)_22%,transparent)]">
                <AlertTriangle className="mt-px size-3.5 shrink-0 text-risk-amber" />
                <span>{item.evidence_gaps[0]}</span>
              </div>
            )}

            {/* Native disclosure: the write-up is reference material, so it costs
                nothing when closed and needs no state to open. */}
            <details className="group mt-3 rounded-xl shadow-[inset_0_0_0_1px_oklch(0_0_0/0.07)]">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 p-3.5 text-[11px] font-medium marker:content-none">
                <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                What the research found
              </summary>
              <p className="px-3.5 pb-3.5 text-xs leading-5 text-pretty text-muted-foreground">{summary}</p>
            </details>

            <MonitorControl item={item} projectId={projectId} />
          </TabsContent>

          <TabsContent className="p-4" value="sources"><SourceLedger sources={item.sources} /></TabsContent>

          <TabsContent className="p-4" value="route">
            <div className="divide-y divide-border border-y border-border">
              {item.candidate_rights_holders.map((holder) => (
                <div className="py-3" key={holder.name}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-xs font-medium">{holder.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{holder.confidence} confidence</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-pretty text-muted-foreground">{holder.role} · {holder.basis}</p>
                </div>
              ))}
            </div>
            {item.licensing_routes.map((route) => (
              <a
                className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl p-3.5 text-xs shadow-[inset_0_0_0_1px_oklch(0_0_0/0.07)] transition-[background-color,scale] hover:bg-muted active:scale-[0.96]"
                href={route.url}
                key={route.url}
                rel="noreferrer"
                target="_blank"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{route.route}</span>
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground" title={route.contact}>{route.contact}</span>
                </span>
                <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </TabsContent>

          <TabsContent className="p-4" value="documents">
            {item.documents.length === 0
              ? (
                <div className="rounded-xl bg-muted/40 px-4 py-7 text-center shadow-[inset_0_0_0_1px_oklch(0_0_0/0.04)]">
                  <FileCheck2 className="mx-auto size-4 text-muted-foreground" />
                  <p className="mt-2 text-xs font-medium">Nothing attached yet</p>
                  <p className="mt-1 text-xs leading-5 text-pretty text-muted-foreground">Attach a licence, release, permit or email before recording an outcome that depends on it.</p>
                </div>
              )
              : item.documents.map((document) => (
                <div className="flex min-h-11 items-center gap-2 border-b border-border py-3 text-xs" key={document.id}>
                  <CheckCircle2 className="size-3.5 shrink-0 text-risk-green" />
                  <span className="min-w-0 truncate" title={document.title}>{document.title}</span>
                </div>
              ))}
            <div className="mt-4"><DocumentSheet item={item} projectId={projectId} /></div>
          </TabsContent>
        </ScrollFade>
      </Tabs>

      {/* Pinned: the decision is the reason the panel exists, and it used to sit
          below five other blocks where it never appeared on screen at all. */}
      <div className="shrink-0 border-t border-border bg-background p-3">
        <HumanDisposition item={item} projectId={projectId} />
      </div>
    </aside>
  );
}
