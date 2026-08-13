import { useEffect, useMemo, useRef, useState } from "react";

import { followInternalLink, navigate } from "../../app/router";
import Drawer from "../../components/Drawer";
import Copilot from "../../components/Copilot";
import type { ClearanceItem, MonitorRecord, Project } from "../../types";
import CaseRail, { rankCases, type CaseQuery } from "./CaseRail";
import EvidenceInspector from "./EvidenceInspector";
import PictureWorkspace from "./PictureWorkspace";


interface Props {
  initialProject: Project;
  monitors: MonitorRecord[];
  onRefresh: () => void;
}

function initialSelection(project: Project): string | null {
  const queryId = new URLSearchParams(window.location.search).get("item");
  if (queryId && project.items.some((item) => item.id === queryId)) return queryId;
  return rankCases(project.items)[0]?.id ?? null;
}

export default function ReviewWorkspace({ initialProject, monitors, onRefresh }: Props) {
  const project = initialProject;
  const [selectedId, setSelectedId] = useState(() => initialSelection(project));
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [query, setQuery] = useState<CaseQuery>({ filter: "all", search: "" });
  const [drawer, setDrawer] = useState<"activity" | "copilot" | null>(null);
  const activityTrigger = useRef<HTMLButtonElement>(null);
  const copilotTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedId && project.items.some((item) => item.id === selectedId)) return;
    setSelectedId(rankCases(project.items)[0]?.id ?? null);
  }, [project.items, selectedId]);

  const selected = useMemo(
    () => project.items.find((item) => item.id === selectedId) ?? null,
    [project.items, selectedId],
  );

  function select(item: ClearanceItem) {
    setSelectedId(item.id);
    setSeekTime(item.cut_detections[0]?.timecode.start ?? null);
    const params = new URLSearchParams(window.location.search);
    params.set("item", item.id);
    navigate(`${window.location.pathname}?${params.toString()}`, { replace: true });
  }

  return (
    <main className="review-page">
      <header className="review-head">
        <div>
          <p className="eyebrow">Clearance review</p>
          <h1>{project.title}</h1>
          <p>
            {project.script?.label ?? "No script"} · {project.cut?.label ?? "No cut"} · {project.summary.total_citations} cited sources
          </p>
        </div>
        <nav aria-label="Project actions">
          <a
            href={`/projects/${project.id}/revisions/new`}
            onClick={(event) => followInternalLink(event, `/projects/${project.id}/revisions/new`)}
          >
            Add revision
          </a>
          <a
            href={`/projects/${project.id}/packet`}
            onClick={(event) => followInternalLink(event, `/projects/${project.id}/packet`)}
          >
            Preview packet
          </a>
          <button ref={activityTrigger} type="button" onClick={() => setDrawer("activity")}>
            Activity · {project.activity_events.length}
          </button>
          <button ref={copilotTrigger} type="button" onClick={() => setDrawer("copilot")}>
            Copilot
          </button>
        </nav>
      </header>

      <div className="review-layout">
        <CaseRail
          items={project.items}
          selectedId={selectedId}
          query={query}
          onQuery={setQuery}
          onSelect={select}
        />
        <PictureWorkspace
          project={project}
          selectedId={selectedId}
          seekTime={seekTime}
          onSelect={select}
        />
        {selected ? (
          <EvidenceInspector key={selected.id} item={selected} />
        ) : (
          <aside className="evidence-inspector evidence-inspector--empty">Select a case to inspect its evidence.</aside>
        )}
      </div>

      <Drawer
        open={drawer === "activity"}
        title="Project activity"
        onClose={() => setDrawer(null)}
        returnFocusRef={activityTrigger}
      >
        <ol className="drawer-activity">
          {project.activity_events.slice().reverse().map((event) => (
            <li key={event.id}>
              <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
              <span>{event.message}</span>
            </li>
          ))}
        </ol>
      </Drawer>
      <Drawer
        open={drawer === "copilot"}
        title="Project copilot"
        onClose={() => setDrawer(null)}
        returnFocusRef={copilotTrigger}
      >
        <Copilot projectId={project.id} />
        <p className="drawer-note">{monitors.length} standing monitors · evidence may change.</p>
        <button className="text-action" type="button" onClick={onRefresh}>Refresh project</button>
      </Drawer>
    </main>
  );
}
