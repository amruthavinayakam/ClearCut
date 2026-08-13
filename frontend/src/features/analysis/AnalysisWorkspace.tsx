import { useRef, useState } from "react";

import { api } from "../../api/client";
import StatusMark from "../../components/StatusMark";
import type { Project, ProjectPhase } from "../../types";
import ScanReveal from "./ScanReveal";
import { useProjectFeed } from "./useProjectFeed";


interface Props {
  initialProject: Project;
  onReview?: (project: Project) => void;
}

const STAGES: { phase: ProjectPhase; label: string }[] = [
  { phase: "scanning_script", label: "Read script" },
  { phase: "scanning_cut", label: "Scan cut" },
  { phase: "reconciling", label: "Reconcile" },
  { phase: "researching", label: "Research rights" },
  { phase: "ready", label: "Evidence ready" },
];

export default function AnalysisWorkspace({ initialProject, onReview }: Props) {
  const { project, connection, retry } = useProjectFeed(initialProject);
  const [activityOpen, setActivityOpen] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const activeIndex = STAGES.findIndex((stage) => stage.phase === project.phase);
  const revisionKey = project.cut?.id ?? project.script?.id ?? project.updated_at;
  const failedItems = project.items.filter((item) => item.research_error);

  async function retryItem(itemId: string) {
    setRetrying(itemId);
    try {
      await api.retryResearch(project.id, itemId);
    } finally {
      setRetrying(null);
    }
  }

  return (
    <main
      className="analysis-workspace"
      role="region"
      aria-label="Analysis workspace"
      onPointerDown={() => window.dispatchEvent(new Event("clearcut:settle-reveal"))}
      onKeyDown={() => window.dispatchEvent(new Event("clearcut:settle-reveal"))}
      tabIndex={-1}
    >
      <header className="analysis-head">
        <div>
          <p className="eyebrow">Clearance analysis</p>
          <h1>{project.title}</h1>
        </div>
        {project.items.length > 0 && (
          <button className="button button--quiet" type="button" onClick={() => onReview?.(project)}>
            Review {project.items.length} {project.items.length === 1 ? "case" : "cases"}
          </button>
        )}
      </header>

      <div className="analysis-status" aria-live="polite">
        <StatusMark label={project.phase.replace(/_/g, " ")} tone={project.phase === "failed" ? "red" : "amber"} />
        {connection === "polling" && (
          <p>
            Live connection paused. ClearCut is checking for updates periodically.
            <button type="button" onClick={retry}>Check now</button>
          </p>
        )}
        {connection === "stopped" && !["ready", "failed"].includes(project.phase) && (
          <p>Analysis updates stopped. Existing detections remain available.</p>
        )}
        {project.error && <p className="analysis-status__error">{project.error}</p>}
      </div>

      <ol className="analysis-stages" aria-label="Analysis stages">
        {STAGES.map((stage, index) => (
          <li
            key={stage.phase}
            className={index < activeIndex ? "is-complete" : index === activeIndex ? "is-active" : ""}
          >
            {stage.label}
          </li>
        ))}
      </ol>

      <section className="analysis-picture" aria-label="Production media">
        {project.cut ? (
          <video
            ref={video}
            src={api.cutUrl(project.id)}
            controls
            preload="metadata"
          />
        ) : (
          <div className="analysis-script-anchor">
            <p className="eyebrow">{project.script?.label ?? "Screenplay"}</p>
            <h2>{project.script?.title || project.title}</h2>
            <p>
              {project.script?.page_count ?? "—"} pages · {project.script?.scene_count ?? "—"} scenes
            </p>
          </div>
        )}
        {project.cut && (
          <ScanReveal
            projectId={project.id}
            revisionKey={revisionKey}
            duration={project.cut.duration_s}
            items={project.items}
            onSelect={(_itemId, time) => {
              if (video.current) video.current.currentTime = time;
            }}
          />
        )}
      </section>

      <p className="analysis-finding">
        {project.items.length > 0
          ? `${project.items.length} clearance ${project.items.length === 1 ? "question" : "questions"}. ${project.summary.unscripted_items} entered through production.`
          : "Detections will remain visible here as the analysis settles."}
      </p>

      {failedItems.length > 0 && (
        <section className="analysis-failures" aria-labelledby="failed-research-title">
          <h2 id="failed-research-title">Research needing attention</h2>
          {failedItems.map((item) => (
            <div key={item.id}>
              <span>{item.name}</span>
              <span>{item.research_error}</span>
              <button
                type="button"
                disabled={retrying === item.id}
                onClick={() => void retryItem(item.id)}
              >
                Retry research
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="analysis-activity">
        <button type="button" onClick={() => setActivityOpen((open) => !open)}>
          Activity · {project.activity_events.length}
        </button>
        {activityOpen && (
          <ol>
            {project.activity_events.slice().reverse().map((event) => (
              <li key={event.id}>
                <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time>
                <span>{event.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
