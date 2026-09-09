"use client";

import type { Project } from "@clearcut/contracts";
import { ChevronLeft, Download, FileWarning } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";

import { useProjectCrumb } from "@/app/(product)/_components/product-shell";

import { PacketPages } from "./packet-pages";

export interface PacketClient {
  /** Records the export against the project and returns the server-built packet. */
  recordExport(projectId: string): Promise<void>;
  /** Renders the visible sheets to PDF. */
  print(documentName: string): void;
}

const browserPacketClient: PacketClient = {
  async recordExport(projectId) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/packet-exports`, { method: "POST" });
    if (!response.ok) throw new Error("The packet could not be exported.");
    // The body is the audited markdown: the record of what was exported. The
    // file the coordinator keeps is the PDF printed from these sheets.
    await response.text();
  },
  print(documentName) {
    // The browser's own print pipeline gives a vector PDF with selectable text,
    // which a packet needs to be searchable and quotable. The document title
    // becomes the suggested filename.
    const previous = document.title;
    document.title = documentName;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  },
};

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "warn" }) {
  return (
    <div className="flex flex-col">
      <dt className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm tabular-nums ${tone === "warn" ? "text-risk-amber" : ""}`}>{value}</dd>
    </div>
  );
}

export function PacketPreview({ project, initialMarkdown, client = browserPacketClient }: { project: Project; initialMarkdown: string; client?: PacketClient }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(false);
  const incomplete = project.items.filter((item) => !item.is_resolved).length;
  const missingDocuments = project.items.filter((item) => item.documents.length === 0).length;
  // Sequence, not the revision id: "1" is the number a coordinator refers to,
  // "revision_8f7" is a truncated key that identifies nothing to a reader.
  const revision = project.revisions?.find((entry) => entry.id === project.active_revision_id)?.sequence;
  useProjectCrumb({ href: `/projects/${project.id}`, label: project.title });

  const exportNow = async () => {
    setBusy(true);
    try {
      // Record first: the audit event describes the packet as the server built
      // it, so it must land even if the print dialog is dismissed.
      await client.recordExport(project.id);
      setExported(true);
      setOpen(false);
      client.print(`${project.title} clearance packet`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-border px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link aria-label="Back to project" className={buttonVariants({ size: "icon-sm", variant: "ghost" })} href={`/projects/${project.id}`}><ChevronLeft /></Link>
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Current server record</p>
            <h1 className="truncate text-base font-medium tracking-[-0.02em]">{project.title} clearance packet</h1>
          </div>
        </div>

        {/* Readiness reads across the header rather than down a rail: three
            numbers do not need a column, and the sheets want the width. */}
        <div className="flex items-center gap-6">
          <dl className="flex items-center gap-6">
            <Stat label="Incomplete" tone={incomplete > 0 ? "warn" : undefined} value={incomplete} />
            <Stat label="No records" tone={missingDocuments > 0 ? "warn" : undefined} value={missingDocuments} />
            <Stat label="Revision" value={revision ?? "—"} />
          </dl>
          <div className="flex flex-col items-end">
            <Button className="transition-[background-color,scale] active:scale-[0.96]" onClick={() => setOpen(true)}><Download /> Export PDF</Button>
            {exported && <span className="mt-1 text-[10px] text-risk-green">Export recorded</span>}
          </div>
        </div>
      </header>

      <div className="packet-viewport min-h-0 flex-1 overflow-auto bg-muted/40 p-6">
        <PacketPages markdown={initialMarkdown} title={project.title} />
      </div>

      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><FileWarning /></AlertDialogMedia>
            <AlertDialogTitle>Export current packet?</AlertDialogTitle>
            <AlertDialogDescription>This appends one immutable export event to the project history and opens the print dialog so the packet can be saved as a PDF. Incomplete research and scope gaps remain visible in the document.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void exportNow()}>{busy ? "Exporting" : "Export and record"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
