import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./api/client";
import AppShell, { BootScreen } from "./app/AppShell";
import { bootstrap, type BootResult, type Resource } from "./app/bootstrap";
import { followInternalLink, navigate, useRoute } from "./app/router";
import AnalysisWorkspace from "./features/analysis/AnalysisWorkspace";
import NewProject from "./features/projects/NewProject";
import ProjectLibrary from "./features/projects/ProjectLibrary";
import ReviewWorkspace from "./features/review/ReviewWorkspace";
import PacketPreview from "./features/export/PacketPreview";
import NewRevision from "./features/revisions/NewRevision";
import RevisionCompare from "./features/revisions/RevisionCompare";
import type { MonitorRecord, Project } from "./types";


function message(resource: Resource<unknown> | undefined): string | undefined {
  return resource?.status === "error" ? resource.error.message : undefined;
}

function RouteLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} onClick={(event) => followInternalLink(event, href)}>
      {children}
    </a>
  );
}

function ProjectRoute({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [monitors, setMonitors] = useState<MonitorRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reviewRequested, setReviewRequested] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [fresh, monitorResponse] = await Promise.all([
        api.getProject(projectId),
        api.listMonitors(projectId).catch(() => ({ monitors: [] })),
      ]);
      setProject(fresh);
      setMonitors(monitorResponse.monitors);
      setError(null);
      return fresh;
    } catch (reason) {
      setError((reason as Error).message);
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [projectId, refresh]);

  if (error && !project) {
    const missing = error.startsWith("Project not found") || error.startsWith("404");
    return (
      <section className="route-state">
        <p className="eyebrow">{missing ? "Project not found" : "Project unavailable"}</p>
        <h1>{missing ? "This project is no longer in the index." : "The project could not open."}</h1>
        <p>{error}</p>
        <RouteLink href="/">Back to projects</RouteLink>
      </section>
    );
  }

  if (!project) {
    return (
      <section className="route-state" aria-busy="true">
        <p className="eyebrow">Opening project</p>
        <h1>Reading the production record.</h1>
      </section>
    );
  }

  if (project.phase === "ready" || reviewRequested) {
    return (
      <ReviewWorkspace
        initialProject={project}
        monitors={monitors}
        onRefresh={() => void refresh()}
      />
    );
  }

  return (
    <AnalysisWorkspace
      initialProject={project}
      onReview={(latest) => {
        setProject(latest);
        setReviewRequested(true);
      }}
    />
  );
}

function NewRevisionRoute({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api.getProject(projectId).then(setProject).catch((reason) => setError((reason as Error).message));
  }, [projectId]);
  if (error) return <section className="route-state"><p className="eyebrow">Project unavailable</p><h1>A revision cannot start.</h1><p>{error}</p><RouteLink href="/">Back to projects</RouteLink></section>;
  if (!project) return <section className="route-state" aria-busy="true"><p className="eyebrow">Opening revision intake</p><h1>Reading the active production state.</h1></section>;
  return <NewRevision project={project} onCreated={(revision) => navigate(`/projects/${project.id}/revisions/${revision.id}`)} />;
}

export default function App() {
  const route = useRoute();
  const [boot, setBoot] = useState<BootResult | null>(null);
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => setDelayed(true), 350);
    void bootstrap().then((result) => {
      if (!active) return;
      window.clearTimeout(timer);
      setBoot(result);
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  const config = boot?.config.status === "ready" ? boot.config.data : null;
  const projects = useMemo(
    () => (boot?.projects.status === "ready" ? boot.projects.data : []),
    [boot],
  );

  const refreshProjects = useCallback(async () => {
    try {
      const response = await api.listProjects(true);
      setBoot((current) =>
        current ? { ...current, projects: { status: "ready", data: response.projects } } : current,
      );
    } catch (error) {
      setBoot((current) =>
        current ? { ...current, projects: { status: "error", error: error as Error } } : current,
      );
    }
  }, []);

  const retryConfig = useCallback(async () => {
    try {
      const data = await api.config();
      setBoot((current) =>
        current ? { ...current, config: { status: "ready", data } } : current,
      );
    } catch (error) {
      setBoot((current) =>
        current ? { ...current, config: { status: "error", error: error as Error } } : current,
      );
    }
  }, []);

  if (!boot) return <BootScreen delayed={delayed} />;

  const archivedView = new URLSearchParams(window.location.search).get("view") === "archived";
  const libraryProjects = projects.filter((project) =>
    archivedView ? project.archived_at !== null : project.archived_at === null,
  );

  async function archive(projectId: string, archived: boolean) {
    try {
      await api.setArchived(projectId, archived);
      await refreshProjects();
    } catch (error) {
      setBoot((current) =>
        current
          ? { ...current, projects: { status: "error", error: error as Error } }
          : current,
      );
    }
  }

  async function openExample() {
    try {
      const project = await api.runSample();
      navigate(`/projects/${project.id}`);
    } catch (error) {
      setBoot((current) =>
        current ? { ...current, config: { status: "error", error: error as Error } } : current,
      );
    }
  }

  let content: React.ReactNode;
  switch (route.name) {
    case "projects":
      content = (
        <ProjectLibrary
          projects={libraryProjects}
          archived={archivedView}
          sampleAvailable={config?.sample_available ?? false}
          onOpenExample={() => void openExample()}
          onArchive={(projectId, archived) => void archive(projectId, archived)}
        />
      );
      break;
    case "new-project":
      content = <NewProject onCreated={(project) => navigate(`/projects/${project.id}`)} />;
      break;
    case "project":
      content = <ProjectRoute projectId={route.projectId} />;
      break;
    case "new-revision":
      content = <NewRevisionRoute projectId={route.projectId} />;
      break;
    case "revision":
      content = <RevisionCompare projectId={route.projectId} revisionId={route.revisionId} />;
      break;
    case "packet":
      content = <PacketPreview projectId={route.projectId} />;
      break;
    default:
      content = (
        <section className="route-state">
          <p className="eyebrow">Not found</p>
          <h1>There is no ClearCut view at this address.</h1>
          <RouteLink href="/">Back to projects</RouteLink>
        </section>
      );
  }

  return (
    <AppShell
      configIssue={message(boot.config)}
      projectIndexIssue={message(boot.projects)}
      onRetryConfig={() => void retryConfig()}
      onRetryProjects={() => void refreshProjects()}
    >
      {content}
    </AppShell>
  );
}
