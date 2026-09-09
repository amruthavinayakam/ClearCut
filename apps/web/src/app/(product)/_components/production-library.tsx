"use client";

import type { ProjectListItem } from "@clearcut/contracts";
import { Archive, ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function phaseLabel(phase: ProjectListItem["phase"]) {
  return phase.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function relativeDate(value: string) {
  const days = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function stateTone(state: ProjectListItem["state_label"]) {
  if (state === "Failed" || state === "Reopened") return "text-risk-red";
  if (state === "Needs review") return "text-risk-amber";
  if (state === "Documented") return "text-risk-green";
  return "text-foreground";
}

export function ProductionLibrary({ projects, archived }: { projects: ProjectListItem[]; archived: boolean }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const visible = useMemo(() => projects.filter((project) => {
    const matchesQuery = project.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const matchesState = state === "all" || project.state_label === state;
    return matchesQuery && matchesState;
  }), [projects, query, state]);

  return (
    <section aria-label="Production library" className="border-b border-border">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:px-6 lg:px-8">
        <div className="relative min-w-0 flex-1 sm:max-w-[320px]">
          <Search aria-hidden="true" className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search productions" className="h-8 pl-8" onChange={(event) => setQuery(event.target.value)} placeholder="Search productions" value={query} />
        </div>
        <Select onValueChange={(value) => value && setState(value)} value={state}>
          <SelectTrigger aria-label="Filter by state" className="h-8 w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="Needs review">Needs review</SelectItem>
            <SelectItem value="Processing">Processing</SelectItem>
            <SelectItem value="Ready for counsel">Ready for counsel</SelectItem>
            <SelectItem value="Documented">Documented</SelectItem>
            <SelectItem value="Reopened">Reopened</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto font-mono text-[10px] tracking-[0.06em] text-muted-foreground">{visible.length.toString().padStart(2, "0")} RECORDS</span>
      </div>

      <div className="overflow-x-auto [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 sm:[&_td:first-child]:pl-6 sm:[&_td:last-child]:pr-6 sm:[&_th:first-child]:pl-6 sm:[&_th:last-child]:pr-6 lg:[&_td:first-child]:pl-8 lg:[&_td:last-child]:pr-8 lg:[&_th:first-child]:pl-8 lg:[&_th:last-child]:pr-8">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[35%]">Production</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Inputs</TableHead>
              <TableHead>Open work</TableHead>
              <TableHead className="text-right">Activity</TableHead>
              <TableHead className="w-9"><span className="sr-only">Open</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((project) => (
              <TableRow className="group h-14" key={project.id}>
                <TableCell>
                  <Link className="font-medium tracking-[-0.01em] hover:underline hover:underline-offset-4" href={`/projects/${project.id}`}>{project.title}</Link>
                </TableCell>
                <TableCell>
                  <span className={cn("text-xs", stateTone(project.state_label))}>{project.state_label}</span>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{phaseLabel(project.phase)}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {[project.script_label && "SCRIPT", project.cut_label && "CUT"].filter(Boolean).join(" + ") || "—"}
                </TableCell>
                <TableCell>
                  <span className="text-xs">{project.unresolved_count} unresolved</span>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{project.total_items} total cases</div>
                </TableCell>
                <TableCell className="text-right font-mono text-[10px] text-muted-foreground">{relativeDate(project.updated_at)}</TableCell>
                <TableCell><Link aria-label={`Open ${project.title}`} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" href={`/projects/${project.id}`}><ArrowUpRight className="size-4" /></Link></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {visible.length === 0 && (
        <div className="grid min-h-[280px] place-items-center p-8 text-center">
          <div>
            <Archive className="mx-auto size-5 text-muted-foreground" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium">{projects.length === 0 ? (archived ? "No archived productions" : "No productions yet") : "No matching productions"}</p>
            <p className="mt-1 max-w-[320px] text-xs leading-5 text-muted-foreground">{projects.length === 0 ? "Start with a screenplay, rough cut, or both. Each source remains independently traceable." : "Try a different title or workflow state."}</p>
            {projects.length === 0 && !archived && <Badge className="mt-4" variant="outline">READY FOR FIRST SCAN</Badge>}
          </div>
        </div>
      )}
    </section>
  );
}
