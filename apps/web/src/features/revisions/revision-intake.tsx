"use client";

import type { ProjectRevision } from "@clearcut/contracts";
import { ArrowRight, FileText, Film, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProjectRevision } from "@/lib/project-actions";

export interface RevisionClient { createRevision(projectId: string, script: File | null, cut: File | null): Promise<ProjectRevision> }
const browserRevisionClient: RevisionClient = { createRevision: createProjectRevision };

function RevisionFile({ kind, file, onFile, onRemove }: { kind: "screenplay" | "cut"; file: File | null; onFile: (file: File) => void; onRemove: () => void }) {
  const screenplay = kind === "screenplay";
  const label = screenplay ? "Revised screenplay" : "Revised rough cut";
  const Icon = screenplay ? FileText : Film;
  return <div className="grid grid-cols-[32px_1fr_auto] items-start gap-3 border-t border-border py-4"><div className="grid size-8 place-items-center rounded-md border border-border"><Icon className="size-3.5 text-muted-foreground" /></div><div><Label htmlFor={`revision-${kind}`}>{label}</Label><p className="mt-1 text-[11px] text-muted-foreground">{file?.name ?? (screenplay ? "PDF, FDX, Fountain, or text" : "MP4, MOV, or WebM")}</p><Input accept={screenplay ? ".pdf,.fdx,.fountain,.txt" : ".mp4,.mov,.webm"} aria-label={`${label} file`} className="sr-only" id={`revision-${kind}`} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) onFile(selected); }} type="file" /></div><div className="flex gap-1"><Button onClick={() => document.getElementById(`revision-${kind}`)?.click()} size="sm" type="button" variant="outline">{file ? "Replace" : "Choose"}</Button>{file && <Button aria-label={`Remove ${label.toLocaleLowerCase()}`} onClick={onRemove} size="icon-sm" type="button" variant="ghost"><X /></Button>}</div></div>;
}

export function RevisionIntake({ projectId, client = browserRevisionClient }: { projectId: string; client?: RevisionClient }) {
  const router = useRouter();
  const [script, setScript] = useState<File | null>(null);
  const [cut, setCut] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!script && !cut) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const revision = await client.createRevision(projectId, script, cut);
      router.push(`/projects/${projectId}/revisions/${revision.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The revision comparison could not start."); setBusy(false); }
  };
  return <form className="border-y border-border" onSubmit={submit}><div className="px-4"><RevisionFile file={script} kind="screenplay" onFile={setScript} onRemove={() => setScript(null)} /><RevisionFile file={cut} kind="cut" onFile={setCut} onRemove={() => setCut(null)} /></div><div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xl text-[11px] leading-5 text-muted-foreground">The candidate version is scanned separately. Unchanged human records carry forward; changed uses reopen for review only after you apply the comparison.</p><Button disabled={(!script && !cut) || busy} type="submit">{busy ? "Starting comparison" : "Compare new version"}<ArrowRight /></Button></div>{error && <p className="border-t border-risk-red/25 px-4 py-3 text-xs text-risk-red">{error}</p>}</form>;
}
