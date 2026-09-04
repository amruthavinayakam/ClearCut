import { ProjectRevisionSchema } from "@clearcut/contracts";
import { ChevronLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { VersionRipple } from "@/features/revisions/version-ripple";
import { apiRequest, getProject } from "@/lib/api-client";

export const dynamic = "force-dynamic";

export default async function RevisionPage({ params }: { params: Promise<{ projectId: string; revisionId: string }> }) {
  const { projectId, revisionId } = await params;
  const [project, revision] = await Promise.all([getProject(projectId), apiRequest(`/api/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}`, ProjectRevisionSchema)]);
  return <main className="min-h-dvh"><header className="flex min-h-28 items-end justify-between gap-4 border-b border-border px-4 pb-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3"><Link aria-label="Back to project" className={buttonVariants({ size: "icon-sm", variant: "ghost" })} href={`/projects/${projectId}`}><ChevronLeft /></Link><div><p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">REVISION {String(revision.sequence).padStart(2, "0")} / {revision.state.toUpperCase()}</p><h1 className="mt-2 text-lg font-medium">{project.title} comparison</h1></div></div>{revision.state === "processing" && <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/projects/${projectId}/revisions/${revisionId}`}><RefreshCw /> Refresh comparison</Link>}</header>{revision.state === "ready" || revision.state === "applied" ? <VersionRipple projectId={projectId} revision={revision} /> : <section className="grid min-h-[420px] place-items-center p-6 text-center"><div><RefreshCw className="mx-auto size-4 animate-spin text-muted-foreground" /><p className="mt-3 text-sm font-medium">Comparing the candidate version</p><p className="mt-1 text-xs text-muted-foreground">ClearCut is matching stable cases and isolating decisions that need fresh review.</p></div></section>}</main>;
}
