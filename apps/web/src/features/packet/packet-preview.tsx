"use client";

import type { Project } from "@clearcut/contracts";
import { Download, FileWarning } from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
      <article className="min-w-0 border-b border-border p-5 lg:border-b-0 lg:border-r lg:p-8">
        {/* The packet is markdown, so render it. As a <pre> it showed its own
            syntax — pipe tables, ## headings, ** emphasis — which is the raw
            file, not the document a coordinator hands to counsel. */}
        <div className="max-w-[68ch] text-[13px] leading-6 [&_a]:underline [&_blockquote]:mt-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px] [&_em]:italic [&_h1]:mt-0 [&_h1]:text-lg [&_h1]:font-medium [&_h1]:tracking-[-0.02em] [&_h2]:mt-8 [&_h2]:border-t [&_h2]:border-border [&_h2]:pt-5 [&_h2]:font-mono [&_h2]:text-[10px] [&_h2]:uppercase [&_h2]:tracking-[0.08em] [&_h2]:text-muted-foreground [&_h3]:mt-5 [&_h3]:text-xs [&_h3]:font-semibold [&_hr]:hidden [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2.5 [&_strong]:font-semibold [&_table]:mt-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border-b [&_td]:border-border [&_td]:py-1.5 [&_td]:pr-3 [&_td]:align-top [&_th]:border-b [&_th]:border-border [&_th]:py-1.5 [&_th]:pr-3 [&_th]:text-left [&_th]:font-medium [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          <Markdown remarkPlugins={[remarkGfm]}>{initialMarkdown}</Markdown>
        </div>
      </article>
      <aside className="p-4"><p className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground">PACKET READINESS</p><dl className="mt-4 divide-y divide-border border-y border-border text-xs"><div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Incomplete cases</dt><dd className="font-mono">{incomplete}</dd></div><div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Cases without records</dt><dd className="font-mono">{missingDocuments}</dd></div><div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Current revision</dt><dd className="font-mono">{project.active_revision_id?.slice(0, 12) ?? "—"}</dd></div></dl><p className="mt-4 text-[11px] leading-5 text-muted-foreground">Export records the current server-built packet in the audit trail. It remains research for human legal review.</p><Button className="mt-5 w-full" onClick={() => setOpen(true)}><Download /> Confirm and export Markdown</Button>{exported && <p className="mt-3 text-xs text-risk-green">Export recorded</p>}</aside>
      <AlertDialog onOpenChange={setOpen} open={open}><AlertDialogContent><AlertDialogHeader><AlertDialogMedia><FileWarning /></AlertDialogMedia><AlertDialogTitle>Export current packet?</AlertDialogTitle><AlertDialogDescription>This creates a download and appends one immutable export event to the project history. Incomplete research and scope gaps remain visible.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void exportNow()}>{busy ? "Exporting" : "Export and record"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
