"use client";

import { ArrowRight, Play, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { browserUploadClient, type UploadClient } from "@/features/uploads/upload-client";
import { ApiClientError } from "@/lib/api-client";

import { FileRow, type IntakeFileState } from "./file-row";

const emptyFile: IntakeFileState = { file: null, status: "empty", result: null };

export function IntakeForm({ client = browserUploadClient }: { client?: UploadClient }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [screenplay, setScreenplay] = useState<IntakeFileState>(emptyFile);
  const [cut, setCut] = useState<IntakeFileState>(emptyFile);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sampleRunning, setSampleRunning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const choose = async (kind: "screenplay" | "cut", file: File) => {
    const update = kind === "screenplay" ? setScreenplay : setCut;
    update({ file, status: "checking", result: null });
    try {
      const result = await client.preflight(file);
      update({ file, status: result.accepted ? "ready" : "error", result });
    } catch (error) {
      update({
        file,
        status: "error",
        result: {
          kind: kind === "screenplay" ? "screenplay" : "cut",
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          accepted: false,
          details: {},
          errors: [{ code: "preflight_failed", message: error instanceof Error ? error.message : "Preflight failed" }],
        },
      });
    }
  };

  const validScreenplay = screenplay.status === "ready" ? screenplay.file : null;
  const validCut = cut.status === "ready" ? cut.file : null;
  const canSubmit = Boolean(validScreenplay || validCut) && !submitting && !sampleRunning;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    setProgress(0);
    try {
      const project = await client.createProject({ title, screenplay: validScreenplay, cut: validCut, onProgress: setProgress });
      router.push(`/projects/${project.id}`);
    } catch (error) {
      setSubmitError(error instanceof ApiClientError || error instanceof Error ? error.message : "The scan could not be started.");
      setSubmitting(false);
    }
  };

  const runSample = async () => {
    if (submitting || sampleRunning) return;
    setSubmitError(null);
    setSampleRunning(true);
    try {
      const project = await client.createSampleProject();
      router.push(`/projects/${project.id}`);
    } catch (error) {
      setSubmitError(error instanceof ApiClientError || error instanceof Error ? error.message : "The real sample could not be started.");
      setSampleRunning(false);
    }
  };

  return (
    <form className="border-y border-border" onSubmit={submit}>
      <div className="grid gap-2 border-b border-border p-4 sm:grid-cols-[180px_1fr] sm:items-center">
        <div><Label htmlFor="production-title">Production title</Label><p className="mt-1 text-[11px] text-muted-foreground">Used across reports and exports.</p></div>
        <Input className="h-9 max-w-xl" id="production-title" onChange={(event) => setTitle(event.target.value)} placeholder="Untitled production" value={title} />
      </div>
      <div className="px-4">
        <FileRow kind="screenplay" onFile={(file) => void choose("screenplay", file)} onRemove={() => setScreenplay(emptyFile)} state={screenplay} />
        <FileRow kind="cut" onFile={(file) => void choose("cut", file)} onRemove={() => setCut(emptyFile)} state={cut} />
      </div>
      <div className="flex flex-col gap-4 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-xl items-start gap-2 text-[11px] leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" /><span>ClearCut identifies candidates and assembles cited research. A qualified human owns every clearance decision.</span></div>
        <div className="flex shrink-0 items-center gap-1">
          <Button disabled={submitting || sampleRunning} onClick={() => void runSample()} type="button" variant="ghost">
            {sampleRunning ? "Preparing real sample" : "Run real sample"}<Play />
          </Button>
          <Button className="min-w-[184px]" disabled={!canSubmit} type="submit">
            {submitting ? `Uploading ${progress}%` : "Start clearance analysis"}<ArrowRight />
          </Button>
        </div>
      </div>
      {submitError && <div aria-live="polite" className="border-t border-risk-red/25 bg-risk-red/5 px-4 py-3 text-xs text-risk-red">{submitError}</div>}
    </form>
  );
}
