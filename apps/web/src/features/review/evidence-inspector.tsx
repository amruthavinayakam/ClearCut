import type { ClearanceItem } from "@clearcut/contracts";
import { AlertTriangle, ArrowUpRight, CheckCircle2, FileCheck2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentSheet } from "@/features/documents/document-sheet";
import { MonitorControl } from "@/features/monitoring/monitor-control";

import { CategoryIcon } from "./category-icon";
import { EvidenceGraph } from "./evidence-graph";
import { HumanDisposition } from "./human-disposition";
import { SourceLedger } from "./source-ledger";

export function EvidenceInspector({ projectId, item }: { projectId: string; item: ClearanceItem }) {
  return (
    <aside className="min-w-0 border-t border-border bg-background xl:min-h-0 xl:overflow-y-auto xl:border-l xl:border-t-0">
      <div className="sticky top-0 z-10 border-b border-border bg-background/85 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <Badge className={`risk-badge--${item.color}`} variant="outline">{item.color.toUpperCase()} RISK</Badge>
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">{item.workflow_status.replaceAll("_", " ")}</span>
        </div>
        <div className="mt-3 flex items-start gap-2.5">
          <CategoryIcon category={item.category} className="mt-0.5" color={item.color} />
          <div className="min-w-0">
            <h2 className="text-base font-medium tracking-[-0.02em] text-balance">{item.name}</h2>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">{item.category.replaceAll("_", " ")} · {item.provenance.replaceAll("_", " ")}</p>
          </div>
        </div>
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto border-b border-border px-2" variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="sources">Sources</TabsTrigger><TabsTrigger value="route">Rights route</TabsTrigger><TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent className="p-4" value="overview">
          <p className="text-xs leading-5 text-muted-foreground">{item.research_summary || item.description}</p>
          <EvidenceGraph item={item} />
          <div className="mt-5 rounded-xl bg-muted/50 p-3.5 shadow-[inset_0_0_0_1px_oklch(0_0_0/0.04)]">
            <p className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground">NEXT HUMAN ACTION</p>
            <p className="mt-2 text-xs leading-5">{item.recommended_actions[0] ?? "Review the current evidence and record the next coordination step."}</p>
          </div>
          {item.evidence_gaps.length > 0 && (
            <div className="mt-3 flex gap-2 rounded-xl bg-risk-amber/8 p-3.5 text-[11px] leading-4 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--risk-amber)_22%,transparent)]">
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-risk-amber" />
              <span>{item.evidence_gaps[0]}</span>
            </div>
          )}
          <MonitorControl item={item} projectId={projectId} />
          <HumanDisposition item={item} projectId={projectId} />
        </TabsContent>
        <TabsContent className="p-4" value="sources"><SourceLedger sources={item.sources} /></TabsContent>
        <TabsContent className="p-4" value="route">
          <div className="divide-y divide-border border-y border-border">
            {item.candidate_rights_holders.map((holder) => (
              <div className="py-3" key={holder.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-xs font-medium">{holder.name}</span>
                  <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">{holder.confidence.toUpperCase()}</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{holder.role} · {holder.basis}</p>
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
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">{route.contact}</span>
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
                <p className="mt-2 text-xs font-medium">No production record attached</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Attach a licence, release, permit, or correspondence before recording document-dependent outcomes.</p>
              </div>
            )
            : item.documents.map((document) => (
              <div className="flex min-h-11 items-center gap-2 border-b border-border py-3 text-xs" key={document.id}>
                <CheckCircle2 className="size-3.5 shrink-0 text-risk-green" />
                <span className="min-w-0 truncate">{document.title}</span>
              </div>
            ))}
          <div className="mt-4"><DocumentSheet item={item} projectId={projectId} /></div>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
