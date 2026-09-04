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
    <div className="grid min-h-[112px] grid-cols-[32px_1fr_auto] gap-3 border-t border-border py-4">
      <div className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground"><Icon className="size-3.5" /></div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium" htmlFor={inputId}>{label}</Label>
          <span className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground">{screenplay ? "PDF / FDX / FOUNTAIN / TXT" : "MP4 / MOV / WEBM"}</span>
        </div>
        {state.file ? (
          <div className="mt-2">
            <p className="truncate text-xs text-foreground">{state.file.name}</p>
            <div className="mt-1 flex items-center gap-1.5 text-[11px]">
              {state.status === "checking" && <><LoaderCircle className="size-3 animate-spin" /> Checking source</>}
              {state.status === "ready" && <><Check className="size-3 text-risk-green" /> <span>{screenplay ? "Screenplay ready" : "Rough cut ready"}</span></>}
              {state.status === "error" && <><X className="size-3 text-risk-red" /> <span className="text-risk-red">{state.result?.errors[0]?.message ?? "This file could not be read"}</span></>}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{screenplay ? "Extract named and generic candidates with page and scene anchors." : "Detect visible and audible candidates with exact timecodes."}</p>
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
        <Button className="font-normal" onClick={() => document.getElementById(inputId)?.click()} size="sm" variant="outline">
          {state.file ? <Replace /> : null}{state.file ? "Replace" : "Choose"}
        </Button>
        {state.file && <Button aria-label={`Remove ${label.toLocaleLowerCase()}`} onClick={onRemove} size="icon-sm" variant="ghost"><X /></Button>}
      </div>
    </div>
  );
}
