"use client";

import type { ClearanceItem, StatusChange, WorkflowStatus } from "@clearcut/contracts";
import { ChevronLeft, Scale } from "lucide-react";
import { useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dispositionClient, type DispositionClient } from "@/lib/project-actions";

const outcomes: Array<{ status: WorkflowStatus; label: string; hint: string; actor: "coordinator" | "counsel" }> = [
  { status: "coordinator_verified", label: "I verified this", hint: "The evidence checks out", actor: "coordinator" },
  { status: "waiting_on_rights_holder", label: "Waiting on the owner", hint: "We have asked, no answer yet", actor: "coordinator" },
  { status: "replacement_requested", label: "Asked for a swap", hint: "Production will replace it", actor: "coordinator" },
  { status: "false_positive", label: "Not an issue", hint: "Nothing to clear here", actor: "coordinator" },
  { status: "counsel_approved", label: "Counsel approved", hint: "Signed off by legal", actor: "counsel" },
];

/**
 * The one action the panel exists for, behind one button.
 *
 * Five outcome buttons were laid out in the panel itself, below the research,
 * the gaps and the watch control — so on a real case they sat off the bottom of
 * the screen and the panel offered no way to act without hunting for it. The
 * choice belongs in the dialog that already asks who and why.
 */
export function HumanDisposition({ projectId, item, client = dispositionClient }: { projectId: string; item: ClearanceItem; client?: DispositionClient }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<(typeof outcomes)[number] | null>(null);
  const [actorName, setActorName] = useState("");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { setOpen(false); setSelected(null); setError(null); };

  const record = async () => {
    if (!selected || !rationale.trim()) return;
    setBusy(true);
    setError(null);
    const change: StatusChange = { status: selected.status, actor: selected.actor, actor_name: actorName, rationale: rationale.trim(), document_ids: item.documents.map((document) => document.id) };
    try {
      await client.setStatus(projectId, item.id, change);
      close();
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The decision could not be saved.");
      setBusy(false);
    }
  };

  const blocked = selected?.status === "counsel_approved" && item.documents.length === 0;

  return (
    <>
      <Button className="min-h-10 w-full transition-[background-color,scale] active:scale-[0.96]" onClick={() => setOpen(true)}>Record a decision</Button>

      <AlertDialog onOpenChange={(next) => { if (!next) close(); }} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><Scale /></AlertDialogMedia>
            <AlertDialogTitle>{selected ? selected.label : "What did you decide?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {selected
                ? "Say who you are and why. Only a person can record this — the agent never can."
                : `This is kept in the audit trail for ${item.name}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selected
            ? (
              <div className="space-y-3">
                <div><Label htmlFor="actor-name">Your name</Label><Input className="mt-1.5 text-base sm:text-sm" id="actor-name" onChange={(event) => setActorName(event.target.value)} placeholder={selected.actor === "counsel" ? "Counsel name" : "Coordinator name"} value={actorName} /></div>
                <div><Label htmlFor="rationale">Why</Label><Textarea className="mt-1.5 min-h-24 text-base sm:text-sm" id="rationale" onChange={(event) => setRationale(event.target.value)} placeholder="What you checked, and why this is the right call." value={rationale} /></div>
                {blocked && <p className="text-xs leading-5 text-pretty text-risk-amber">Attach the supporting document before recording counsel approval.</p>}
                {error && <p className="text-xs leading-5 text-risk-red">{error}</p>}
              </div>
            )
            : (
              <div className="grid gap-1.5">
                {outcomes.map((outcome) => (
                  <button
                    className="flex min-h-11 flex-col items-start justify-center rounded-lg px-3 py-2 text-left transition-[background-color,scale] hover:bg-muted active:scale-[0.96]"
                    key={outcome.status}
                    onClick={() => setSelected(outcome)}
                    type="button"
                  >
                    <span className="text-sm">{outcome.label}</span>
                    <span className="text-[11px] text-muted-foreground">{outcome.hint}</span>
                  </button>
                ))}
              </div>
            )}

          <AlertDialogFooter>
            {selected
              ? <Button className="mr-auto" onClick={() => setSelected(null)} variant="ghost"><ChevronLeft />Back</Button>
              : null}
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {selected && <AlertDialogAction disabled={busy || !rationale.trim() || blocked} onClick={() => void record()}>Save decision</AlertDialogAction>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
