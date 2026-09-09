"use client";

import type { ClearanceItem, MonitorRecord } from "@clearcut/contracts";
import { Radio, Waves } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { monitorClient, type MonitorClient } from "@/lib/project-actions";

import { frequencyLabel } from "@/features/review/vocabulary";

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
    <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-medium">Watch for changes</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{monitor ? `Checked ${frequencyLabel(monitor.frequency)}` : "Reopen this case if public sources change"}</p>
      </div>
      <Button className="min-h-10 shrink-0 transition-[background-color,scale] active:scale-[0.96]" disabled={Boolean(monitor) || busy} onClick={() => void start()} size="sm" variant="outline">
        {monitor ? <Radio className="text-risk-green" /> : <Waves />}
        {monitor ? "On" : busy ? "Starting" : "Turn on"}
      </Button>
      {error && <p className="text-[11px] text-risk-red">{error}</p>}
    </div>
  );
}
