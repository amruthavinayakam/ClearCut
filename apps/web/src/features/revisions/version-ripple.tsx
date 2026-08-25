"use client";

import type { ProjectRevision, RevisionChangeKind } from "@clearcut/contracts";
import { ArrowRight, Check, CircleAlert, Minus, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { applyProjectRevision } from "@/lib/project-actions";

const details: Record<RevisionChangeKind, { label: string; icon: typeof Check; tone: string }> = {
  unchanged: { label: "Unchanged", icon: Check, tone: "text-risk-green" },
  added: { label: "Added", icon: Plus, tone: "text-primary" },
  removed: { label: "Removed", icon: Minus, tone: "text-muted-foreground" },
  materially_changed: { label: "Material change", icon: RefreshCw, tone: "text-risk-amber" },
  decision_stale: { label: "Decision stale", icon: CircleAlert, tone: "text-risk-red" },
};

export function VersionRipple({ revision, projectId, onApply }: { revision: ProjectRevision; projectId?: string; onApply?: (revision: ProjectRevision) => Promise<void> }) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = revision.changes[selectedIndex] ?? null;
  const counts = useMemo(() => Object.fromEntries(Object.keys(details).map((kind) => [kind, revision.changes.filter((change) => change.kind === kind).length])) as Record<RevisionChangeKind, number>, [revision.changes]);
  const apply = async () => {
    if (!projectId || busy) return;
    setBusy(true);
    try {
      if (onApply) await onApply(revision);
      else await applyProjectRevision(projectId, revision);
      router.push(`/projects/${projectId}`);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The revision could not be applied."); setBusy(false); }
  };
  return (
    <div>
      <div className="grid grid-cols-2 border-y border-border sm:grid-cols-5">{(Object.keys(details) as RevisionChangeKind[]).map((kind) => { const Icon = details[kind].icon; return <div className="border-r border-border p-3 last:border-r-0" key={kind}><div className="flex items-center gap-1.5"><Icon className={`size-3 ${details[kind].tone}`} /><span className="text-[11px]">{details[kind].label}</span></div><strong className="mt-2 block font-mono text-lg font-medium">{counts[kind]}</strong></div>; })}</div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-x-auto border-b border-border lg:border-b-0 lg:border-r">
          <Table><TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Outcome</TableHead><TableHead>Prior decision</TableHead></TableRow></TableHeader><TableBody>{revision.changes.map((change, index) => <TableRow className={selectedIndex === index ? "bg-muted" : ""} key={`${change.stable_item_id}-${change.kind}`} onClick={() => setSelectedIndex(index)}><TableCell className="font-medium">{change.item_name}</TableCell><TableCell><Badge className="font-mono text-[9px]" variant="outline">{change.kind.replaceAll("_", " ")}</Badge></TableCell><TableCell className="text-xs capitalize text-muted-foreground">{change.previous_status?.replaceAll("_", " ") ?? "—"}</TableCell></TableRow>)}</TableBody></Table>
        </div>
        <aside className="p-4"><p className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground">CHANGE INSPECTOR</p>{selected ? <><h2 className="mt-3 text-sm font-medium">{selected.item_name}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{selected.explanation}</p><dl className="mt-4 divide-y divide-border border-y border-border text-xs"><div className="flex justify-between py-2"><dt className="text-muted-foreground">Match basis</dt><dd>{selected.match_basis}</dd></div><div className="flex justify-between py-2"><dt className="text-muted-foreground">Carry forward</dt><dd>{selected.kind === "unchanged" ? "Yes" : "Reopen"}</dd></div></dl></> : <p className="mt-3 text-xs text-muted-foreground">No changed cases.</p>}{projectId && revision.state === "ready" && <Button className="mt-6 w-full" disabled={busy} onClick={() => void apply()}>{busy ? "Applying revision" : "Apply reviewed revision"}<ArrowRight /></Button>}{error && <p className="mt-2 text-[11px] text-risk-red">{error}</p>}</aside>
      </div>
    </div>
  );
}
