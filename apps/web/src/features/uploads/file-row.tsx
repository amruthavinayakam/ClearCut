"use client";

import type { PreflightResult } from "@clearcut/contracts";
import { Check, FileText, Film, LoaderCircle, Replace, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type IntakeFileState = {
  file: File | null;
  status: "empty" | "checking" | "ready" | "error";
  result: PreflightResult | null;
};

export function FileRow({
  kind,
  state,
  onFile,
  onRemove,
}: {
  kind: "screenplay" | "cut";
  state: IntakeFileState;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const screenplay = kind === "screenplay";
  const Icon = screenplay ? FileText : Film;
  const label = screenplay ? "Screenplay" : "Rough cut";
  const inputId = `${kind}-file`;

  return (
    // A card per source rather than a tall bordered band: in a modal the rows
    // sit next to each other, so they need an edge of their own, and the
    // 112px floor was padding a two-line description out to a page's rhythm.
    // 10px outer radius over 6px inner keeps the tile concentric in its card.
    <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 rounded-[10px] p-3 shadow-[inset_0_0_0_1px_oklch(0_0_0/0.07)]">
      <div className="grid size-7 place-items-center rounded-[6px] bg-muted text-muted-foreground"><Icon className="size-3.5" /></div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Label className="text-[13px] font-medium" htmlFor={inputId}>{label}</Label>
          <span className="font-mono text-[9px] tracking-[0.08em] whitespace-nowrap text-muted-foreground">{screenplay ? "PDF / FDX / FOUNTAIN / TXT" : "MP4 / MOV / WEBM"}</span>
        </div>
        {state.file ? (
          <div className="mt-1">
            <p className="truncate text-xs text-foreground">{state.file.name}</p>
            <div className="mt-1 flex items-center gap-1.5 text-[11px]">
              {state.status === "checking" && <><LoaderCircle className="size-3 animate-spin" /> Checking source</>}
              {state.status === "ready" && <><Check className="size-3 text-risk-green" /> <span>{screenplay ? "Screenplay ready" : "Rough cut ready"}</span></>}
              {state.status === "error" && <><X className="size-3 text-risk-red" /> <span className="text-risk-red">{state.result?.errors[0]?.message ?? "This file could not be read"}</span></>}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-[11px] leading-4 text-pretty text-muted-foreground">{screenplay ? "Extract named and generic candidates with page and scene anchors." : "Detect visible and audible candidates with exact timecodes."}</p>
        )}
      </div>
      <div className="flex items-start gap-1">
        <input
          accept={screenplay ? ".pdf,.fdx,.fountain,.txt,application/pdf,text/plain" : "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"}
          aria-label={`${label} file`}
          className="sr-only"
          id={inputId}
          onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = ""; }}
          type="file"
        />
        <Button className="font-normal transition-[background-color,scale] active:scale-[0.96]" onClick={() => document.getElementById(inputId)?.click()} size="sm" variant="outline">
          {state.file ? <Replace /> : null}{state.file ? "Replace" : "Choose"}
        </Button>
        {state.file && <Button aria-label={`Remove ${label.toLocaleLowerCase()}`} onClick={onRemove} size="icon-sm" variant="ghost"><X /></Button>}
      </div>
    </div>
  );
}
