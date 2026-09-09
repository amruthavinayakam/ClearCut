import type { ProjectListItem } from "@clearcut/contracts";
import { listProjects } from "@/lib/api-client";

import { NewScanDialog } from "@/features/uploads/new-scan-dialog";

import { ProductionLibrary } from "./_components/production-library";

export const dynamic = "force-dynamic";

export default async function ProductionsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: openIntake } = await searchParams;
  let projects: ProjectListItem[] = [];
  let unavailable = false;
  try {
    projects = await listProjects();
  } catch {
    unavailable = true;
  }

  return (
    <main className="min-h-dvh">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border px-4 pb-6 pt-10 sm:px-6 lg:px-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">CLEARANCE OPERATIONS</p>
          <h1 className="mt-2 text-xl font-medium tracking-[-0.025em]">Productions</h1>
          <p className="mt-2 text-sm text-muted-foreground">Active research, evidence review, and recorded rights work.</p>
        </div>
        <NewScanDialog defaultOpen={openIntake === "1"} />
      </header>
      {unavailable && <div className="border-b border-risk-red/25 bg-risk-red/5 px-4 py-3 text-xs text-risk-red sm:px-6 lg:px-8">The API is unavailable. Existing records were not changed; retry by reloading this page.</div>}
      <ProductionLibrary archived={false} projects={projects} />
    </main>
  );
}
