"use client";

import type { ClearanceItem, Project } from "@clearcut/contracts";
import { Clapperboard, FileText, Upload } from "lucide-react";
import { useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { PictureWorkspace } from "./picture-workspace";
import { ScriptWorkspace } from "./script-workspace";

/**
 * The centre column shows whichever source the production actually has.
 *
 * A production may be script-only, cut-only, or both, and the page-to-screen
 * comparison is the product's whole argument — so when both exist the column
 * offers a switch rather than picking one and hiding the other. With a single
 * source there is nothing to switch between, so no tabs appear.
 */
export function SourceWorkspace({
  project,
  selected,
  onSelect,
}: {
  project: Project;
  selected: ClearanceItem | null;
  onSelect: (id: string) => void;
}) {
  const hasScript = Boolean(project.script);
  const hasCut = Boolean(project.cut);
  // Open on whichever source the selected case came from, so choosing a
  // cut-only case does not land the reader in the screenplay.
  const [view, setView] = useState<"script" | "cut">(
    hasCut && selected?.provenance !== "script_only" ? "cut" : "script",
  );
  const active = hasScript && hasCut ? view : hasScript ? "script" : "cut";

  if (!hasScript && !hasCut) {
    return (
      <section className="grid min-h-0 place-items-center border-r border-border p-8 text-center">
        <div>
          <Upload className="mx-auto size-5 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-xs font-medium">No sources on this production</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Upload a screenplay or a rough cut to begin a scan.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border">
      {/* A real tab list rather than buttons wearing tab roles: keyboard
          navigation, roving focus and the selected state all come from the
          component instead of being approximated here. */}
      {hasScript && hasCut && (
        <Tabs onValueChange={(value) => setView(value as "script" | "cut")} value={active}>
          <TabsList className="w-full shrink-0 px-2" variant="line">
            <TabsTrigger value="script">
              <FileText />
              Screenplay
              <span className="font-mono text-[9px] text-muted-foreground">{project.script?.label}</span>
            </TabsTrigger>
            <TabsTrigger value="cut">
              <Clapperboard />
              Rough cut
              <span className="font-mono text-[9px] text-muted-foreground">{project.cut?.label}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {active === "cut"
        ? <PictureWorkspace onSelect={onSelect} project={project} selected={selected} />
        : (
          <ScriptWorkspace
            items={project.items}
            label={`Screenplay / ${project.script?.label ?? ""}`}
            onSelect={onSelect}
            projectId={project.id}
            selectedId={selected?.id ?? null}
          />
        )}
    </section>
  );
}
