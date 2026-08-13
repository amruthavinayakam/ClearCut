import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { followInternalLink, navigate } from "../../app/router";
import Drawer from "../../components/Drawer";
import Copilot from "../../components/Copilot";
import { WORKSPACE_COMMAND_EVENT, type WorkspaceCommand } from "../../components/CommandPalette";
import type { ClearanceItem, MonitorRecord, Project } from "../../types";
import { getProjectPreferences, updateProjectPreferences } from "../projects/project-preferences";
import CaseRail, { rankCases, type CaseQuery } from "./CaseRail";
import EvidenceInspector from "./EvidenceInspector";
import PictureWorkspace from "./PictureWorkspace";
import UseProfileSheet from "./UseProfileSheet";


interface Props {
  initialProject: Project;
  monitors: MonitorRecord[];
  onRefresh: () => void;
}

function initialSelection(project: Project, remembered: string | null): { id: string | null; message: string } {
  const queryId = new URLSearchParams(window.location.search).get("item");
  const requested = queryId || remembered;
  if (requested && project.items.some((item) => item.id === requested)) return { id: requested, message: "" };
  const fallback = rankCases(project.items)[0] ?? null;
  return {
    id: fallback?.id ?? null,
    message: requested && fallback
      ? `The previously selected case is absent from this active revision. Opened ${fallback.name}.`
      : "",
  };
}

export default function ReviewWorkspace({ initialProject, monitors, onRefresh }: Props) {
  const project = initialProject;
  const preferences = useMemo(() => getProjectPreferences(project.id), [project.id]);
  const initial = useMemo(() => initialSelection(project, preferences.selectedItemId), [project, preferences.selectedItemId]);
  const [selectedId, setSelectedId] = useState(initial.id);
  const [fallbackMessage, setFallbackMessage] = useState(initial.message);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [query, setQuery] = useState<CaseQuery>({ filter: preferences.caseFilter, search: preferences.caseSearch });
  const [drawer, setDrawer] = useState<"activity" | "copilot" | null>(preferences.drawer);
  const [queueWidth, setQueueWidth] = useState(preferences.queueWidth);
  const [useProfileOpen, setUseProfileOpen] = useState(false);
  const activityTrigger = useRef<HTMLButtonElement>(null);
  const copilotTrigger = useRef<HTMLButtonElement>(null);
  const useProfileTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedId && project.items.some((item) => item.id === selectedId)) return;
    const fallback = rankCases(project.items)[0] ?? null;
    setSelectedId(fallback?.id ?? null);
    if (fallback) {
      setFallbackMessage(`The previously selected case is absent from this active revision. Opened ${fallback.name}.`);
      updateProjectPreferences(project.id, { selectedItemId: fallback.id });
    }
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
    updateProjectPreferences(project.id, { selectedItemId: item.id });
    setFallbackMessage("");
  }

  function updateQuery(next: CaseQuery) {
    setQuery(next);
    updateProjectPreferences(project.id, { caseFilter: next.filter, caseSearch: next.search });
  }

  function openDrawer(next: "activity" | "copilot" | null) {
    setDrawer(next);
    updateProjectPreferences(project.id, { drawer: next });
  }

  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<WorkspaceCommand>).detail;
      if (command === "activity") {
        openDrawer("activity");
        return;
      }
      if (command === "focus-search") {
        document.getElementById("case-search")?.focus();
        return;
      }
      if (command === "next-case" || command === "previous-case") {
        const ordered = rankCases(project.items);
        if (!ordered.length) return;
        const current = Math.max(0, ordered.findIndex((item) => item.id === selectedId));
        const delta = command === "next-case" ? 1 : -1;
        select(ordered[(current + delta + ordered.length) % ordered.length]);
      }
    };
    window.addEventListener(WORKSPACE_COMMAND_EVENT, onCommand);
    return () => window.removeEventListener(WORKSPACE_COMMAND_EVENT, onCommand);
  });

  return (
    <main className="review-page" style={{ "--case-rail-width": `${queueWidth}px` } as CSSProperties}>
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
          <button ref={activityTrigger} type="button" onClick={() => openDrawer("activity")}>
            Activity · {project.activity_events.length}
          </button>
          <button ref={useProfileTrigger} type="button" onClick={() => setUseProfileOpen(true)}>
            Intended use
          </button>
          <button ref={copilotTrigger} type="button" onClick={() => openDrawer("copilot")}>
            Copilot
          </button>
        </nav>
      </header>

      {fallbackMessage ? <p className="continuity-notice" role="status">{fallbackMessage}</p> : null}

      <div className="review-layout">
        <CaseRail
          items={project.items}
          selectedId={selectedId}
          query={query}
          onQuery={updateQuery}
          onSelect={select}
          queueWidth={queueWidth}
          onQueueWidth={(width) => {
            setQueueWidth(width);
            updateProjectPreferences(project.id, { queueWidth: width });
          }}
        />
        <PictureWorkspace
          project={project}
          selectedId={selectedId}
          seekTime={seekTime}
          onSelect={select}
          initialPosition={preferences.videoPosition}
          onPosition={(videoPosition) => updateProjectPreferences(project.id, { videoPosition })}
        />
        {selected ? (
          <EvidenceInspector
            key={selected.id}
            projectId={project.id}
            item={selected}
            useProfile={project.use_profile}
            onChanged={onRefresh}
          />
        ) : (
          <aside className="evidence-inspector evidence-inspector--empty">Select a case to inspect its evidence.</aside>
        )}
      </div>

      <Drawer
        open={drawer === "activity"}
        title="Project activity"
        onClose={() => openDrawer(null)}
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
        onClose={() => openDrawer(null)}
        returnFocusRef={copilotTrigger}
      >
        <Copilot projectId={project.id} />
        <p className="drawer-note">{monitors.length} standing monitors · evidence may change.</p>
        <button className="text-action" type="button" onClick={onRefresh}>Refresh project</button>
      </Drawer>
      <UseProfileSheet
        open={useProfileOpen}
        projectId={project.id}
        profile={project.use_profile}
        onClose={() => setUseProfileOpen(false)}
        onChanged={onRefresh}
        returnFocusRef={useProfileTrigger}
      />
    </main>
  );
}
