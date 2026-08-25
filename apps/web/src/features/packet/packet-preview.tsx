"use client";

import type { Project } from "@clearcut/contracts";
import { Download, FileWarning } from "lucide-react";
import { useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface PacketClient { exportPacket(projectId: string): Promise<void> }

const browserPacketClient: PacketClient = {
  async exportPacket(projectId) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/packet-exports`, { method: "POST" });
    if (!response.ok) throw new Error("The packet could not be exported.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `clearance-packet-${projectId}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  },
};

export function PacketPreview({ project, initialMarkdown, client = browserPacketClient }: { project: Project; initialMarkdown: string; client?: PacketClient }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(false);
  const incomplete = project.items.filter((item) => !item.is_resolved).length;
  const missingDocuments = project.items.filter((item) => item.documents.length === 0).length;
  const exportNow = async () => { setBusy(true); try { await client.exportPacket(project.id); setExported(true); setOpen(false); } finally { setBusy(false); } };
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
      <article className="min-w-0 border-b border-border p-5 lg:border-b-0 lg:border-r lg:p-8"><pre className="whitespace-pre-wrap font-mono text-[11px] leading-6 text-foreground">{initialMarkdown}</pre></article>
      <aside className="p-4"><p className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground">PACKET READINESS</p><dl className="mt-4 divide-y divide-border border-y border-border text-xs"><div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Incomplete cases</dt><dd className="font-mono">{incomplete}</dd></div><div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Cases without records</dt><dd className="font-mono">{missingDocuments}</dd></div><div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Current revision</dt><dd className="font-mono">{project.active_revision_id?.slice(0, 12) ?? "—"}</dd></div></dl><p className="mt-4 text-[11px] leading-5 text-muted-foreground">Export records the current server-built packet in the audit trail. It remains research for human legal review.</p><Button className="mt-5 w-full" onClick={() => setOpen(true)}><Download /> Confirm and export Markdown</Button>{exported && <p className="mt-3 text-xs text-risk-green">Export recorded</p>}</aside>
      <AlertDialog onOpenChange={setOpen} open={open}><AlertDialogContent><AlertDialogHeader><AlertDialogMedia><FileWarning /></AlertDialogMedia><AlertDialogTitle>Export current packet?</AlertDialogTitle><AlertDialogDescription>This creates a download and appends one immutable export event to the project history. Incomplete research and scope gaps remain visible.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void exportNow()}>{busy ? "Exporting" : "Export and record"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
