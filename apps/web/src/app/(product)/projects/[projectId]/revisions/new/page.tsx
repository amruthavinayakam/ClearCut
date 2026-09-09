import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { RevisionIntake } from "@/features/revisions/revision-intake";
import { notFound } from "next/navigation";

import { getProject, isNotFound } from "@/lib/api-client";

export const dynamic = "force-dynamic";

export default async function NewRevisionPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let project;
  try {
    project = await getProject(projectId);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  return <main className="min-h-dvh"><header className="flex min-h-36 items-end gap-3 border-b border-border px-4 pb-5 sm:px-6 lg:px-8"><Link aria-label="Back to project" className={buttonVariants({ size: "icon-sm", variant: "ghost" })} href={`/projects/${projectId}`}><ChevronLeft /></Link><div><p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">{project.title.toUpperCase()} / VERSION RIPPLE</p><h1 className="mt-2 text-xl font-medium tracking-[-0.025em]">Compare a new version</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Upload only what changed. The candidate remains immutable until you review and apply its comparison.</p></div></header><div className="py-6"><RevisionIntake projectId={projectId} /></div></main>;
}
