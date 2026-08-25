import type { ProjectListItem } from "@clearcut/contracts";
import { Plus } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { listProjects } from "@/lib/api-client";

import { ProductionLibrary } from "./_components/production-library";

export const dynamic = "force-dynamic";

export default async function ProductionsPage() {
  let projects: ProjectListItem[] = [];
  let unavailable = false;
  try {
    projects = await listProjects();
  } catch {
    unavailable = true;
  }

  return (
    <main className="min-h-dvh">
      <header className="flex min-h-40 items-end justify-between gap-6 border-b border-border px-4 pb-5 sm:px-6 lg:px-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">CLEARANCE OPERATIONS</p>
          <h1 className="mt-2 text-xl font-medium tracking-[-0.025em]">Productions</h1>
          <p className="mt-2 text-sm text-muted-foreground">Active research, evidence review, and recorded rights work.</p>
        </div>
        <Link className={buttonVariants()} href="/projects/new"><Plus /> New scan</Link>
      </header>
      {unavailable && <div className="border-b border-risk-red/25 bg-risk-red/5 px-4 py-3 text-xs text-risk-red sm:px-6 lg:px-8">The API is unavailable. Existing records were not changed; retry by reloading this page.</div>}
      <div className="py-6"><ProductionLibrary archived={false} projects={projects} /></div>
    </main>
  );
}
