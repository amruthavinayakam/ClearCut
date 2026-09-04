"use client";

import type { Project, ProjectStreamEvent } from "@clearcut/contracts";
import { ArrowRight, Check, Circle, CircleDashed, Radio, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { getProject } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { createBrowserProjectFeed, type ProjectFeed } from "./use-project-feed";

export type { ProjectFeed } from "./use-project-feed";

export interface ProjectReader {
  getProject(projectId: string): Promise<Project>;
}

const defaultReader: ProjectReader = { getProject };

const stages = [
  { key: "scanning_script", label: "Scan screenplay" },
  { key: "scanning_cut", label: "Scan rough cut" },
  { key: "reconciling", label: "Reconcile page + screen" },
  { key: "researching", label: "Research rights routes" },
  { key: "ready", label: "Human review" },
] as const;

function stageIndex(phase: Project["phase"]) {
  if (phase === "created") return 0;
  if (phase === "failed") return -1;
  return stages.findIndex((stage) => stage.key === phase);
}

export function AnalysisWorkspace({
  initialProject,
  feed,
  reader = defaultReader,
}: {
  initialProject: Project;
  feed?: ProjectFeed;
  reader?: ProjectReader;
}) {
  const [project, setProject] = useState(initialProject);
  const [connection, setConnection] = useState<"connecting" | "live" | "polling">("connecting");
  const [lastEvent, setLastEvent] = useState<ProjectStreamEvent | null>(null);
  const activeFeed = useMemo(() => feed ?? createBrowserProjectFeed(initialProject.id), [feed, initialProject.id]);

  useEffect(() => {
    let active = true;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      try {
        const next = await reader.getProject(initialProject.id);
        if (active) setProject(next);
      } catch {
        // Keep the latest validated snapshot visible during transient failures.
      }
    };
    const stop = activeFeed.subscribe({
      onProject: setProject,
      onEvent: setLastEvent,
      onOpen: () => setConnection("live"),
      onError: () => {
        if (!active) return;
        setConnection("polling");
        void poll();
        pollTimer ??= setInterval(() => void poll(), 2_500);
      },
    });
    return () => {
      active = false;
      stop();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [activeFeed, initialProject.id, reader]);

  const currentIndex = stageIndex(project.phase);
  const activeMessage = lastEvent && "message" in lastEvent ? lastEvent.message : project.activity_events.at(-1)?.message ?? "Preparing source analysis";

  return (
    <main className="min-h-dvh">
      <header className="flex min-h-28 items-end justify-between gap-4 border-b border-border px-4 pb-4 sm:px-6 lg:px-8">
        <div>
          <div className="flex items-center gap-2"><span className="font-mono text-[10px] tracking-[0.09em] text-muted-foreground">{project.id}</span><Badge variant="outline">ANALYSIS</Badge></div>
          <h1 className="mt-2 text-lg font-medium tracking-[-0.02em]">{project.title}</h1>
        </div>
        {project.items.length > 0 && <Link className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground" href={`/projects/${project.id}?case=${project.items[0].id}`}>Review available cases <ArrowRight className="size-3.5" /></Link>}
      </header>

      <div className="grid min-h-[calc(100dvh-7rem)] grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="border-b border-border p-4 lg:border-b-0 lg:border-r">
          <p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">EXECUTION PLAN</p>
          <ol className="mt-5 space-y-1">
            {stages.map((stage, index) => {
              const complete = currentIndex > index || project.phase === "ready";
              const active = currentIndex === index && project.phase !== "ready";
              return (
                <li className={cn("flex min-h-9 items-center gap-2.5 rounded-md px-2 text-xs", active ? "bg-muted text-foreground" : "text-muted-foreground")} key={stage.key}>
                  {complete ? <Check className="size-3.5 text-risk-green" /> : active ? <CircleDashed className="size-3.5 animate-spin text-primary" /> : <Circle className="size-3.5" />}
                  <span>{stage.label}</span>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex h-11 items-center justify-between border-b border-border px-4">
            <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground">ACTIVITY STREAM</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Radio className="size-3" />{connection === "polling" ? "Polling for updates" : connection === "live" ? "Live connection" : "Connecting"}</span>
          </div>
          <div className="p-4 sm:p-6">
            <div className="border-l border-border pl-4">
              <p className="font-mono text-[10px] text-primary">CURRENT OPERATION</p>
              <p className="mt-2 text-sm font-medium">{activeMessage}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Results are stored as each stage settles. Available cases can be reviewed before the full production finishes.</p>
            </div>
            <div className="mt-8 divide-y divide-border border-y border-border">
              {project.activity_events.length === 0 ? <div className="py-4 text-xs text-muted-foreground">Waiting for the first persisted event.</div> : project.activity_events.toReversed().map((event) => (
                <div className="grid gap-1 py-3 sm:grid-cols-[110px_1fr]" key={event.id}>
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">{event.phase}</span>
                  <span className="text-xs">{event.message}</span>
                </div>
              ))}
            </div>
            {project.items.length > 0 && (
              <div className="mt-8">
                <div className="mb-3 flex items-center justify-between"><p className="text-xs font-medium">Cases available now</p><span className="font-mono text-[10px] text-muted-foreground">{project.items.length.toString().padStart(2, "0")}</span></div>
                <div className="divide-y divide-border border-y border-border">{project.items.map((item) => <div className="grid grid-cols-[8px_1fr_auto] items-center gap-3 py-3" key={item.id}><span className={`risk-dot risk-dot--${item.color}`} /><span className="text-xs">{item.name}</span><span className="font-mono text-[9px] uppercase text-muted-foreground">{item.workflow_status.replaceAll("_", " ")}</span></div>)}</div>
              </div>
            )}
          </div>
        </section>

        <aside className="p-4">
          <p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">RUN INSPECTOR</p>
          <dl className="mt-5 divide-y divide-border border-y border-border text-xs">
            <div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Connection</dt><dd>{connection}</dd></div>
            <div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Cases found</dt><dd className="font-mono">{project.items.length}</dd></div>
            <div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Citations</dt><dd className="font-mono">{project.summary.total_citations}</dd></div>
            <div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Input coverage</dt><dd>{[project.script && "script", project.cut && "cut"].filter(Boolean).join(" + ")}</dd></div>
          </dl>
          {connection === "polling" && <div className="mt-4 flex gap-2 border border-border p-3 text-[11px] leading-4 text-muted-foreground"><RefreshCw className="mt-0.5 size-3 shrink-0" />The live stream disconnected. ClearCut is reading validated snapshots instead.</div>}
        </aside>
      </div>
    </main>
  );
}
