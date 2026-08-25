"use client";

import type { ClearanceItem, MonitorRecord } from "@clearcut/contracts";
import { Radio, Waves } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { monitorClient, type MonitorClient } from "@/lib/project-actions";

export function MonitorControl({ projectId, item, client = monitorClient }: { projectId: string; item: ClearanceItem; client?: MonitorClient }) {
  const [monitor, setMonitor] = useState<MonitorRecord | null>(item.monitor_id ? { monitor_id: item.monitor_id, project_id: projectId, item_id: item.id, item_name: item.name, query: "Existing watch", frequency: "1d", status: "active", events: [] } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    if (monitor || busy) return;
    setBusy(true);
    try { setMonitor(await client.createMonitor(projectId, item.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Monitor could not be started."); }
    finally { setBusy(false); }
  };
  return (
    <section className="mt-4 rounded-md border border-border p-3">
      <div className="flex items-start gap-2"><Waves className="mt-0.5 size-3.5 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs font-medium">Continuous public-fact watch</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">Parallel Monitor can reopen this case when researched public facts change. Prior human history remains intact.</p></div></div>
      <Button className="mt-3 w-full" disabled={Boolean(monitor) || busy} onClick={() => void start()} size="sm" variant="outline">{monitor ? <Radio className="text-risk-green" /> : <Waves />}{monitor ? "Monitor active" : busy ? "Starting monitor" : "Watch for changes"}</Button>
      {monitor && <p className="mt-2 truncate font-mono text-[9px] text-muted-foreground">{monitor.monitor_id} / EVERY {monitor.frequency.toUpperCase()}</p>}
      {error && <p className="mt-2 text-[11px] text-risk-red">{error}</p>}
    </section>
  );
}
