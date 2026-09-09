"use client";

import type { ClearanceItem, StatusChange, WorkflowStatus } from "@clearcut/contracts";
import { Scale } from "lucide-react";
import { useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dispositionClient, type DispositionClient } from "@/lib/project-actions";

const outcomes: Array<{ status: WorkflowStatus; label: string; actor: "coordinator" | "counsel" }> = [
  { status: "coordinator_verified", label: "Coordinator verified", actor: "coordinator" },
  { status: "waiting_on_rights_holder", label: "Waiting on holder", actor: "coordinator" },
  { status: "replacement_requested", label: "Request replacement", actor: "coordinator" },
  { status: "false_positive", label: "False positive", actor: "coordinator" },
  { status: "counsel_approved", label: "Counsel approved", actor: "counsel" },
];

export function HumanDisposition({ projectId, item, client = dispositionClient }: { projectId: string; item: ClearanceItem; client?: DispositionClient }) {
  const [selected, setSelected] = useState<(typeof outcomes)[number] | null>(null);
  const [actorName, setActorName] = useState("");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = async () => {
    if (!selected || !rationale.trim()) return;
    setBusy(true);
    setError(null);
    const change: StatusChange = { status: selected.status, actor: selected.actor, actor_name: actorName, rationale: rationale.trim(), document_ids: item.documents.map((document) => document.id) };
    try {
      await client.setStatus(projectId, item.id, change);
      setSelected(null);
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The disposition could not be recorded.");
      setBusy(false);
    }
  };

  return (
    <section className="mt-5 border-t border-border pt-4">
      <div className="mb-3 flex items-center justify-between"><p className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground">HUMAN DISPOSITION</p><span className="text-[11px] text-muted-foreground">Immutable audit event</span></div>
      <div className="grid grid-cols-2 gap-1.5">{outcomes.map((outcome) => <Button className="min-h-10 justify-start font-normal transition-[background-color,scale] active:scale-[0.96]" key={outcome.status} onClick={() => setSelected(outcome)} variant="outline">{outcome.label}</Button>)}</div>

      <AlertDialog onOpenChange={(open) => { if (!open) setSelected(null); }} open={Boolean(selected)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><Scale /></AlertDialogMedia>
            <AlertDialogTitle>{selected?.actor === "counsel" ? "Counsel action" : "Coordinator action"}</AlertDialogTitle>
            <AlertDialogDescription>Record a human-owned status with the actor and rationale. The agent cannot take this action.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div><Label htmlFor="actor-name">Actor name</Label><Input className="mt-1.5 text-base sm:text-sm" id="actor-name" onChange={(event) => setActorName(event.target.value)} placeholder={selected?.actor === "counsel" ? "Counsel name" : "Coordinator name"} value={actorName} /></div>
            <div><Label htmlFor="rationale">Rationale</Label><Textarea className="mt-1.5 min-h-24 text-base sm:text-sm" id="rationale" onChange={(event) => setRationale(event.target.value)} placeholder="State what was reviewed and why this disposition is appropriate." value={rationale} /></div>
            {selected?.status === "counsel_approved" && item.documents.length === 0 && <p className="text-xs leading-5 text-pretty text-risk-amber">A supporting production document is required before counsel approval can be recorded.</p>}
            {error && <p className="text-xs leading-5 text-risk-red">{error}</p>}
          </div>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy || !rationale.trim() || (selected?.status === "counsel_approved" && item.documents.length === 0)} onClick={() => void record()}>Record disposition</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
