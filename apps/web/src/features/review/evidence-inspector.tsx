import type { ClearanceItem } from "@clearcut/contracts";
import { AlertTriangle, ArrowUpRight, CheckCircle2, FileCheck2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentSheet } from "@/features/documents/document-sheet";
import { MonitorControl } from "@/features/monitoring/monitor-control";

import { EvidenceGraph } from "./evidence-graph";
import { HumanDisposition } from "./human-disposition";
import { SourceLedger } from "./source-ledger";

export function EvidenceInspector({ projectId, item }: { projectId: string; item: ClearanceItem }) {
  return (
    <aside className="min-w-0 border-t border-border bg-background xl:border-l xl:border-t-0">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-3"><Badge className={`risk-badge--${item.color}`} variant="outline">{item.color.toUpperCase()} RISK</Badge><span className="font-mono text-[9px] uppercase text-muted-foreground">{item.workflow_status.replaceAll("_", " ")}</span></div>
        <h2 className="mt-3 text-base font-medium tracking-[-0.02em]">{item.name}</h2>
        <p className="mt-1 text-xs capitalize text-muted-foreground">{item.category.replaceAll("_", " ")} · {item.provenance.replaceAll("_", " ")}</p>
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto border-b border-border px-2" variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="sources">Sources</TabsTrigger><TabsTrigger value="route">Rights route</TabsTrigger><TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent className="p-4" value="overview">
          <p className="text-xs leading-5 text-muted-foreground">{item.research_summary || item.description}</p>
          <EvidenceGraph item={item} />
          <div className="mt-5 border-t border-border pt-4"><p className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground">NEXT HUMAN ACTION</p><p className="mt-2 text-xs leading-5">{item.recommended_actions[0] ?? "Review the current evidence and record the next coordination step."}</p></div>
          {item.evidence_gaps.length > 0 && <div className="mt-4 flex gap-2 border border-risk-amber/30 p-3 text-[11px] leading-4"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-risk-amber" /><span>{item.evidence_gaps[0]}</span></div>}
          <MonitorControl item={item} projectId={projectId} />
          <HumanDisposition item={item} projectId={projectId} />
        </TabsContent>
        <TabsContent className="p-4" value="sources"><SourceLedger sources={item.sources} /></TabsContent>
        <TabsContent className="p-4" value="route">
          <div className="divide-y divide-border border-y border-border">{item.candidate_rights_holders.map((holder) => <div className="py-3" key={holder.name}><div className="flex items-center justify-between"><span className="text-xs font-medium">{holder.name}</span><span className="font-mono text-[9px] text-muted-foreground">{holder.confidence.toUpperCase()}</span></div><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{holder.role} · {holder.basis}</p></div>)}</div>
          {item.licensing_routes.map((route) => <a className="mt-3 flex items-center justify-between rounded-md border border-border p-3 text-xs hover:bg-muted" href={route.url} key={route.url} rel="noreferrer" target="_blank"><span><span className="block font-medium">{route.route}</span><span className="mt-1 block text-[11px] text-muted-foreground">{route.contact}</span></span><ArrowUpRight className="size-3.5" /></a>)}
        </TabsContent>
        <TabsContent className="p-4" value="documents">
          {item.documents.length === 0 ? <div className="py-6 text-center"><FileCheck2 className="mx-auto size-4 text-muted-foreground" /><p className="mt-2 text-xs font-medium">No production record attached</p><p className="mt-1 text-[11px] text-muted-foreground">Attach a licence, release, permit, or correspondence before recording document-dependent outcomes.</p></div> : item.documents.map((document) => <div className="flex items-center gap-2 border-b border-border py-3 text-xs" key={document.id}><CheckCircle2 className="size-3.5 text-risk-green" />{document.title}</div>)}
          <div className="mt-4"><DocumentSheet item={item} projectId={projectId} /></div>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
