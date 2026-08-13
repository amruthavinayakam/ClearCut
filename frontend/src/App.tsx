import { useCallback, useEffect, useMemo, useState } from "react";

import { api, streamProject } from "./api/client";
import AppShell, { BootScreen } from "./app/AppShell";
import { bootstrap, type BootResult, type Resource } from "./app/bootstrap";
import { followInternalLink, navigate, useRoute } from "./app/router";
import StatusMark from "./components/StatusMark";
import Upload from "./components/Upload";
import Workspace from "./components/Workspace";
import ProjectLibrary from "./features/projects/ProjectLibrary";
import type { AppConfig, MonitorRecord, Project } from "./types";


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
    let active = true;
    let close: () => void = () => undefined;
    void refresh().then((loaded) => {
      if (!active || !loaded || loaded.phase === "ready" || loaded.phase === "failed") return;
      close = streamProject(projectId, (frame) => {
        if (!active) return;
        if (frame.type === "snapshot") setProject(frame.project);
        if (frame.type === "progress") {
          setProject((current) =>
            current ? { ...current, phase: frame.phase as Project["phase"] } : current,
          );
        }
        if (frame.type === "done" || frame.type === "monitor_event") void refresh();
        if (frame.type === "error") setError(frame.message);
      });
    });
    return () => {
      active = false;
      close();
    };
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

  if (project.phase === "ready") {
    return (
      <main className="main legacy-workspace">
        <Workspace
          project={project}
          monitors={monitors}
          onRefresh={() => void refresh()}
          onReset={() => navigate("/")}
        />
      </main>
    );
  }

  if (project.phase === "failed") {
    return (
      <section className="route-state">
        <p className="eyebrow">Analysis stopped</p>
        <h1>{project.title}</h1>
        <p>{project.error ?? "The analysis did not complete."}</p>
        <button className="button button--quiet" type="button" onClick={() => void refresh()}>
          Refresh project
        </button>
      </section>
    );
  }

  const phase = project.phase.replace(/_/g, " ");
  return (
    <section className="route-state analysis-bridge" aria-live="polite">
      <p className="eyebrow">Clearance analysis</p>
      <h1>{project.title}</h1>
      <StatusMark label={phase} tone="amber" />
      <p>
        ClearCut is reading the available production material. Completed evidence remains
        available as each stage settles.
      </p>
      <ol className="analysis-sequence">
        <li>Read script</li>
        <li>Scan cut</li>
        <li>Reconcile versions</li>
        <li>Research rights</li>
        <li>Human review</li>
      </ol>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function NewProjectRoute({ config }: { config: AppConfig | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch(script: File | null, cut: File | null, title: string) {
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject(script, cut, title);
      navigate(`/projects/${project.id}`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="temporary-route">
      <p className="eyebrow">New clearance scan</p>
      <h1>Bring the page and the screen together.</h1>
      <Upload
        busy={busy}
        sampleAvailable={false}
        onSubmit={(script, cut, title) => void launch(script, cut, title)}
        onSample={() => undefined}
      />
      {!config?.parallel_configured && (
        <p>Research configuration is not available. Intake remains visible for diagnosis.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
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
      content = <NewProjectRoute config={config} />;
      break;
    case "project":
      content = <ProjectRoute projectId={route.projectId} />;
      break;
    case "new-revision":
    case "revision":
    case "packet":
      content = (
        <section className="route-state">
          <p className="eyebrow">Project workspace</p>
          <h1>This workspace is being prepared.</h1>
          <p>The route is stable; its complete working surface arrives in the next product slice.</p>
          <RouteLink href={`/projects/${route.projectId}`}>Return to project</RouteLink>
        </section>
      );
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
