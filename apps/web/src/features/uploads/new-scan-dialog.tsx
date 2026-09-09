"use client";

import { ArrowRight, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileRow, type IntakeFileState } from "@/features/uploads/file-row";
import { browserUploadClient, type UploadClient } from "@/features/uploads/upload-client";
import { ApiClientError } from "@/lib/api-client";

const emptyFile: IntakeFileState = { file: null, status: "empty", result: null };

/**
 * Intake as a modal.
 *
 * Starting a scan is a short, bounded task begun from the library and ending
 * back in it — a full page made it feel like a place you navigate to and have
 * to leave, and gave two sources and a title an entire screen to rattle around
 * in. The route still exists and opens this, so the deep link keeps working.
 */
export function NewScanDialog({
  defaultOpen = false,
  client = browserUploadClient,
}: {
  defaultOpen?: boolean;
  client?: UploadClient;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
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
          kind,
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
  const busy = submitting || sampleRunning;
  const canSubmit = Boolean(validScreenplay || validCut) && !busy;

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
    if (busy) return;
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
    <>
      <Button className="transition-[background-color,scale] active:scale-[0.96]" onClick={() => setOpen(true)}>
        <Plus /> New scan
      </Button>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-[580px]">
          <DialogHeader>
            <DialogTitle className="text-balance">Start a clearance scan</DialogTitle>
            <DialogDescription className="text-pretty">
              Add a screenplay, the current cut, or both. Supplying both is what lets ClearCut compare the page against the screen and surface elements that only exist in the edit.
            </DialogDescription>
          </DialogHeader>

          <form className="contents" onSubmit={submit}>
            <div className="space-y-4 px-6">
              <div>
                <Label className="text-xs" htmlFor="production-title">Production title</Label>
                {/* 16px on small viewports: iOS Safari zooms the page for
                    anything smaller when the field takes focus. */}
                <Input
                  className="mt-1.5 text-base sm:text-sm"
                  id="production-title"
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Untitled production"
                  value={title}
                />
              </div>

              <div className="space-y-2">
                <FileRow kind="screenplay" onFile={(file) => void choose("screenplay", file)} onRemove={() => setScreenplay(emptyFile)} state={screenplay} />
                <FileRow kind="cut" onFile={(file) => void choose("cut", file)} onRemove={() => setCut(emptyFile)} state={cut} />
              </div>

              {submitError && (
                <p aria-live="polite" className="rounded-lg bg-risk-red/8 px-3 py-2 text-xs leading-5 text-risk-red shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--risk-red)_22%,transparent)]">
                  {submitError}
                </p>
              )}

              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3.5 shrink-0" />
                <span className="truncate">Research support. A qualified human owns every clearance decision.</span>
              </p>
            </div>

            <DialogFooter>
              {/* A real secondary button. It was ghost text with a trailing play
                  glyph, which read as neither a button nor a link. */}
              <Button
                className="mr-auto transition-[background-color,scale] active:scale-[0.96]"
                disabled={busy}
                onClick={() => void runSample()}
                type="button"
                variant="outline"
              >
                <Sparkles /> {sampleRunning ? "Preparing sample" : "Run real sample"}
              </Button>
              <Button
                className="min-w-[172px] transition-[background-color,scale] active:scale-[0.96]"
                disabled={!canSubmit}
                type="submit"
              >
                {submitting ? <span className="tabular-nums">Uploading {progress}%</span> : "Start analysis"}
                <ArrowRight />
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
