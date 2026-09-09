"use client";

import type { Project } from "@clearcut/contracts";
import { ChevronLeft, Download, GitCompareArrows, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { CopilotSheet } from "@/features/copilot/copilot-sheet";

import { useProjectCrumb } from "@/app/(product)/_components/product-shell";

import { CaseRail } from "./case-rail";
import { EvidenceInspector } from "./evidence-inspector";
import { PictureWorkspace } from "./picture-workspace";

export function ReviewWorkspace({ project, initialCaseId }: { project: Project; initialCaseId?: string | null }) {
  const firstId = initialCaseId && project.items.some((item) => item.id === initialCaseId) ? initialCaseId : project.items[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState(firstId);
  const selected = useMemo(() => project.items.find((item) => item.id === selectedId) ?? null, [project.items, selectedId]);
  useProjectCrumb({ href: `/projects/${project.id}`, label: project.title });

  const select = (id: string) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("case", id);
    window.history.replaceState(null, "", url);
  };

  return (
    // The review workspace is a fixed viewport: the page itself never scrolls,
    // each column manages its own overflow. Below xl the columns stack and the
    // whole thing scrolls normally, since a phone has no room for three panes.
    <main className="flex flex-col xl:h-[calc(100dvh-3rem)] xl:overflow-hidden">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link aria-label="Back to productions" className={buttonVariants({ size: "icon-sm", variant: "ghost" })} href="/"><ChevronLeft /></Link>
          <div className="min-w-0"><h1 className="truncate text-sm font-medium">{project.title}</h1><p className="mt-0.5 text-[11px] text-muted-foreground">{project.items.length} cases · {project.summary.total_citations} citations · {project.summary.resolved_items} resolved</p></div>
        </div>
        <div className="flex items-center gap-1">
          <CopilotSheet projectId={project.id} />
          <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/projects/${project.id}/revisions/new`}><GitCompareArrows /> New version</Link>
          <Link className={buttonVariants({ size: "sm" })} href={`/projects/${project.id}/packet`}><Download /> Packet</Link>
          <Button aria-label="More project actions" size="icon-sm" variant="ghost"><MoreHorizontal /></Button>
        </div>
      </header>
      {/* minmax(0,1fr) on the row is what makes the columns scrollable. An auto
          row is sized by its tallest item's content, so the inspector's length
          would set the row height, stretch every column to match, and push the
          player's controls past the bottom of the viewport. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[260px_minmax(420px,1fr)_380px] xl:grid-rows-[minmax(0,1fr)]">
        <CaseRail items={project.items} onSelect={select} selectedId={selectedId} />
        <PictureWorkspace onSelect={select} project={project} selected={selected} />
        {selected
          ? <EvidenceInspector item={selected} key={selected.id} projectId={project.id} />
          : <aside className="grid min-h-64 place-items-center border-l border-border p-6 text-xs text-muted-foreground">Select a clearance case.</aside>}
      </div>
    </main>
  );
}
