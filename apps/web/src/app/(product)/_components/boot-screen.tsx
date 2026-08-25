"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export type BootResource<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "failed"; resource: string };

export function ready<T>(value: T): BootResource<T> {
  return { status: "ready", value };
}

export function failed<T = never>(resource: string): BootResource<T> {
  return { status: "failed", resource };
}

function resourceLabel(resource: BootResource<unknown>) {
  if (resource.status === "ready") return "READY";
  if (resource.status === "failed") return "RETRY";
  return "LOADING";
}

function ResourceRow({ label, resource, onRetry }: { label: string; resource: BootResource<unknown>; onRetry?: () => void }) {
  const state = resourceLabel(resource);

  return (
    <div className="grid grid-cols-[1fr_auto] items-center border-t border-border py-2.5" data-testid={`boot-${label.toLowerCase()}`}>
      <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground">{label}</span>
      {resource.status === "failed" ? (
        <Button className="h-6 px-1.5 font-mono text-[10px] tracking-[0.08em]" onClick={onRetry} size="xs" variant="ghost">
          <RotateCcw className="size-3" />
          {state}
        </Button>
      ) : (
        <span className="font-mono text-[10px] tracking-[0.08em] text-foreground">{state}</span>
      )}
    </div>
  );
}

export function BootScreen({
  config,
  projects,
  workspace = ready(null),
  onRetry,
}: {
  config: BootResource<unknown>;
  projects: BootResource<unknown>;
  workspace?: BootResource<unknown>;
  onRetry?: (resource: "config" | "projects" | "workspace") => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6">
      <section aria-label="ClearCut boot status" className="w-full max-w-[360px]">
        <div className="mb-12 flex items-center gap-2">
          <span aria-hidden="true" className="size-2 bg-primary" />
          <span className="text-sm font-medium tracking-[-0.02em]">ClearCut</span>
        </div>
        <div className="mb-5">
          <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">SYSTEM START</p>
          <h1 className="mt-2 text-base font-medium tracking-[-0.02em]">Preparing clearance workspace</h1>
        </div>
        <div className="border-b border-border">
          <ResourceRow label="CONFIG" onRetry={() => onRetry?.("config")} resource={config} />
          <ResourceRow label="PROJECTS" onRetry={() => onRetry?.("projects")} resource={projects} />
          <ResourceRow label="WORKSPACE" onRetry={() => onRetry?.("workspace")} resource={workspace} />
        </div>
        <p className="mt-4 max-w-[300px] text-xs leading-5 text-muted-foreground">
          Research workspace for human legal review. ClearCut does not issue legal clearance.
        </p>
      </section>
    </main>
  );
}
