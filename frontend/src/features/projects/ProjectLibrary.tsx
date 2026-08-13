import { useMemo, useState } from "react";

import { followInternalLink, navigate } from "../../app/router";
import StatusMark from "../../components/StatusMark";
import type { HeatColor, ProjectListItem } from "../../types";


interface Props {
  projects: ProjectListItem[];
  sampleAvailable: boolean;
  archived?: boolean;
  onOpenProject?: (projectId: string) => void;
  onOpenExample?: () => void;
  onArchive?: (projectId: string, archived: boolean) => void;
}

const STATE_TONE: Record<ProjectListItem["state_label"], HeatColor | "amber"> = {
  Processing: "amber",
  "Needs review": "red",
  "Ready for counsel": "blue",
  Documented: "green",
  Reopened: "red",
  Failed: "gray",
};

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function ProjectLibrary({
  projects,
  sampleAvailable,
  archived = false,
  onOpenProject,
  onOpenExample,
  onArchive,
}: Props) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => project.title.toLocaleLowerCase().includes(needle));
  }, [projects, query]);

  function openProject(event: React.MouseEvent<HTMLAnchorElement>, projectId: string) {
    const path = `/projects/${encodeURIComponent(projectId)}`;
    if (onOpenProject) {
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        event.preventDefault();
        onOpenProject(projectId);
      }
      return;
    }
    followInternalLink(event, path);
  }

  if (projects.length === 0 && !archived) {
    return (
      <section className="library-empty" aria-labelledby="first-run-title">
        <p className="eyebrow">ClearCut · clearance research workspace</p>
        <h1 id="first-run-title">Find what entered between the page and the screen.</h1>
        <p className="library-empty__notice">
          Evidence and risk research for human legal review. ClearCut never issues an approval.
        </p>
        <div className="library-empty__actions">
          <a
            className="button button--primary"
            href="/projects/new"
            onClick={(event) => followInternalLink(event, "/projects/new")}
          >
            New clearance scan
          </a>
          {sampleAvailable && (
            <button className="button button--quiet" type="button" onClick={onOpenExample}>
              Open example project
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="project-library" aria-labelledby="projects-title">
      <div className="project-library__head">
        <div>
          <p className="eyebrow">Production clearance</p>
          <h1 id="projects-title">{archived ? "Archived projects" : "Projects"}</h1>
        </div>
        <a
          className="button button--primary"
          href="/projects/new"
          onClick={(event) => followInternalLink(event, "/projects/new")}
        >
          New clearance scan
        </a>
      </div>

      <label className="project-search">
        <span className="sr-only">Search productions</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search productions"
        />
      </label>

      <div className="project-list" role="list" aria-live="polite">
        {visible.map((project) => (
          <article className="project-row" role="listitem" key={project.id}>
            <a
              className="project-row__link"
              href={`/projects/${encodeURIComponent(project.id)}`}
              onClick={(event) => openProject(event, project.id)}
            >
              <span className="project-row__title">{project.title}</span>
              <span className="project-row__versions">
                {[project.script_label, project.cut_label].filter(Boolean).join(" · ") || "Intake only"}
              </span>
              <span className="project-row__status">
                <StatusMark label={project.state_label} tone={STATE_TONE[project.state_label]} />
              </span>
              <span className="project-row__open">Open</span>
            </a>
            <div className="project-row__meta">
              <span>Updated {formatUpdated(project.updated_at)}</span>
              <span>
                {project.unresolved_count} unresolved · {project.total_items} total
              </span>
              {onArchive && (
                <button
                  className="text-action"
                  type="button"
                  onClick={() => onArchive(project.id, !archived)}
                >
                  {archived ? "Restore" : "Archive"}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="library-zero">No production matches “{query.trim()}”.</p>
      )}
      <button
        className="text-action project-library__archive-link"
        type="button"
        onClick={() => navigate(archived ? "/" : "/?view=archived")}
      >
        {archived ? "Back to active projects" : "View archived projects"}
      </button>
    </section>
  );
}
