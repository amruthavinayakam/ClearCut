import { useCallback, useEffect, useRef, useState } from "react";

import { api, streamProject } from "./api";
import Upload from "./components/Upload";
import Workspace from "./components/Workspace";
import type { AppConfig, MonitorRecord, Project, ProjectPhase } from "./types";

interface LogLine {
  at: string;
  message: string;
  kind?: "search";
}

const STAGES: { key: ProjectPhase; label: string }[] = [
  { key: "scanning_script", label: "script" },
  { key: "scanning_cut", label: "cut" },
  { key: "reconciling", label: "reconcile" },
  { key: "researching", label: "research" },
  { key: "ready", label: "review" },
];

const ORDER: ProjectPhase[] = [
  "created",
  "scanning_script",
  "scanning_cut",
  "reconciling",
  "researching",
  "ready",
];

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [monitors, setMonitors] = useState<MonitorRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeStream = useRef<(() => void) | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
    return () => closeStream.current?.();
  }, []);

  // A scan can outlive a page reload, and coordinators share links to a
  // project. The id lives in the hash so both work without a router.
  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "").trim();
    if (!id.startsWith("proj_")) return;
    void (async () => {
      try {
        const existing = await api.getProject(id);
        setProject(existing);
        void refresh(id);
        if (existing.phase !== "ready" && existing.phase !== "failed") attach(existing);
      } catch {
        window.location.hash = "";
      }
    })();
    // Deliberately mount-only: re-running on `attach` identity would reload
    // the project on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  const refresh = useCallback(async (projectId: string) => {
    try {
      const [fresh, { monitors: list }] = await Promise.all([
        api.getProject(projectId),
        api.listMonitors(projectId).catch(() => ({ monitors: [] as MonitorRecord[] })),
      ]);
      setProject(fresh);
      setMonitors(list);
    } catch (exc) {
      setError((exc as Error).message);
    }
  }, []);

  const note = useCallback((message: string, kind?: "search") => {
    setLines((prev) => [...prev, { at: new Date().toISOString(), message, kind }]);
  }, []);

  const attach = useCallback(
    (started: Project) => {
      setProject(started);
      setLines([]);
      setMonitors([]);
      window.location.hash = started.id;
      closeStream.current?.();

      closeStream.current = streamProject(started.id, (frame) => {
        switch (frame.type) {
          case "snapshot":
            setProject(frame.project);
            break;
          case "progress":
            note(frame.message);
            setProject((prev) => (prev ? { ...prev, phase: frame.phase as ProjectPhase } : prev));
            break;
          case "search_results":
            // Live Parallel Search, surfaced as it happens.
            note(
              `Parallel Search — ${frame.item_name}: ${frame.sources.length} source(s)`,
              "search",
            );
            for (const source of frame.sources.slice(0, 3)) {
              note(`    ${source.title || source.url}`, "search");
            }
            break;
          case "search_failed":
            note(`Search failed: ${frame.message}`);
            break;
          case "item_researched":
            note(
              `${frame.item_name} — ${frame.status} (${frame.citations} sources, ${frame.holders} candidate holder(s))`,
            );
            break;
          case "monitor_event":
            note(`Monitor update for ${frame.item_name} — item reopened`);
            void refresh(started.id);
            break;
          case "done":
            void refresh(started.id);
            break;
          case "error":
            setError(frame.message);
            break;
          default:
            break;
        }
      });
    },
    [note, refresh],
  );

  async function launch(run: () => Promise<Project>) {
    setBusy(true);
    setError(null);
    try {
      attach(await run());
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    closeStream.current?.();
    closeStream.current = null;
    window.location.hash = "";
    setProject(null);
    setLines([]);
    setMonitors([]);
    setError(null);
  }

  const hasItems = Boolean(project && project.items.length > 0);
  const running = Boolean(project && project.phase !== "ready" && project.phase !== "failed");
  const currentIndex = project ? ORDER.indexOf(project.phase) : -1;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span>◎</span>
          Clearance Radar
          <span className="tagline">every frame · every right · every change</span>
        </div>
        <div className="spacer" />
        <div className="chips">
          {config?.mock_research && <span className="chip warn">mock research</span>}
          {config?.vertex && (
            <span className="chip">vertex ai{config.project ? ` · ${config.project}` : ""}</span>
          )}
          {config?.parallel_configured && !config.mock_research && (
            <span className="chip ok">
              parallel · search {config.search_mode} · task {config.processor}
            </span>
          )}
        </div>
      </header>

      <main className="main">
        {!project && (
          <>
            <div className="hero">
              <h1>
                The script was cleared.
                <br />
                <em>Then the cut arrived.</em>
              </h1>
              <p>
                Clearance Radar compares the page against the screen, pins every unresolved
                element to its exact frame, researches who controls it with citations, and
                keeps watching for public changes. Humans make every legal decision.
              </p>
              <div className="pipeline-strip">
                <span className="step">gemini reads the script</span>
                <span className="arrow">→</span>
                <span className="step">gemini watches the cut</span>
                <span className="arrow">→</span>
                <span className="step">reconcile</span>
                <span className="arrow">→</span>
                <span className="step">parallel search + task</span>
                <span className="arrow">→</span>
                <span className="step">human sign-off</span>
                <span className="arrow">→</span>
                <span className="step">parallel monitor</span>
              </div>
            </div>

            <Upload
              busy={busy}
              sampleAvailable={config?.sample_available ?? false}
              onSubmit={(script, cut, title) =>
                launch(() => api.createProject(script, cut, title))
              }
              onSample={() => launch(() => api.runSample())}
            />

            {error && (
              <div className="upload-card">
                <div className="error-banner">{error}</div>
              </div>
            )}
          </>
        )}

        {project && running && (
          <div className="card progress-panel">
            <div className="progress-head">
              <div className="spinner" />
              <div>
                <strong style={{ fontSize: 15.5 }}>Scanning {project.title}</strong>
                <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
                  Gemini reads the script and the cut, then Parallel researches each item.
                </div>
              </div>
            </div>

            <div className="stages">
              {STAGES.map((stage) => {
                const index = ORDER.indexOf(stage.key);
                const state = currentIndex > index ? "done" : currentIndex === index ? "active" : "";
                return (
                  <div key={stage.key} className={`stage ${state}`}>
                    {stage.label}
                  </div>
                );
              })}
            </div>

            <div className="log" ref={logRef}>
              {lines.map((line, index) => (
                <div className={`log-line${line.kind ? ` ${line.kind}` : ""}`} key={index}>
                  <span className="ts">{new Date(line.at).toLocaleTimeString()}</span>
                  <span>{line.message}</span>
                </div>
              ))}
            </div>

            {(error || project.error) && (
              <>
                <div className="error-banner">{error ?? project.error}</div>
                <div className="row center" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={reset}>
                    Start over
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {project && hasItems && (
          <div style={{ marginTop: running ? 20 : 0 }}>
            <Workspace
              project={project}
              monitors={monitors}
              onRefresh={() => void refresh(project.id)}
              onReset={reset}
            />
          </div>
        )}
      </main>
    </div>
  );
}
