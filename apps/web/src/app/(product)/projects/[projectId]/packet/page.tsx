import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { PacketPreview } from "@/features/packet/packet-preview";
import { apiTextRequest, getProject } from "@/lib/api-client";

export const dynamic = "force-dynamic";

export default async function PacketPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, markdown] = await Promise.all([getProject(projectId), apiTextRequest(`/api/projects/${encodeURIComponent(projectId)}/packet.md`)]);
  return <main className="min-h-dvh"><header className="flex min-h-28 items-end gap-3 border-b border-border px-4 pb-4 sm:px-6 lg:px-8"><Link aria-label="Back to project" className={buttonVariants({ size: "icon-sm", variant: "ghost" })} href={`/projects/${projectId}`}><ChevronLeft /></Link><div><p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">CURRENT SERVER RECORD / MARKDOWN</p><h1 className="mt-2 text-lg font-medium">{project.title} clearance packet</h1></div></header><PacketPreview initialMarkdown={markdown} project={project} /></main>;
}
