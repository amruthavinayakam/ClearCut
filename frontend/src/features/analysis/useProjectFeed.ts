import { useCallback, useEffect, useRef, useState } from "react";

import { api, type StreamFrame } from "../../api/client";
import { openProjectStream } from "../../api/project-stream";
import type { Project } from "../../types";


export type ProjectConnection = "live" | "polling" | "stopped";

export function useProjectFeed(initialProject: Project) {
  const [project, setProject] = useState(initialProject);
  const [frames, setFrames] = useState<StreamFrame[]>([]);
  const [connection, setConnection] = useState<ProjectConnection>("live");
  const projectRef = useRef(initialProject);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.getProject(projectRef.current.id);
      setProject(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    let poller: number | undefined;
    let terminal = false;

    function onFrame(frame: StreamFrame) {
      if (!active) return;
      setFrames((current) => [...current, frame].slice(-200));
      if (frame.type === "snapshot") setProject(frame.project);
      if (frame.type === "progress") {
        setProject((current) => ({
          ...current,
          phase: frame.phase as Project["phase"],
          activity_events: [
            ...current.activity_events,
            {
              id: `live_${Date.now()}`,
              at: new Date().toISOString(),
              phase: frame.phase,
              message: frame.message,
              detail: frame.detail,
            },
          ].slice(-500),
        }));
      }
      if (frame.type === "done") {
        terminal = true;
        setConnection("stopped");
        void refresh();
      }
      if (frame.type === "item_researched") void refresh();
      if (frame.type === "error") {
        terminal = true;
        setConnection("stopped");
      }
    }

    function startPolling() {
      if (!active) return;
      if (terminal) {
        setConnection("stopped");
        return;
      }
      setConnection("polling");
      void refresh();
      poller = window.setInterval(() => void refresh(), 5000);
    }

    const stream = openProjectStream(initialProject.id, onFrame, startPolling);
    return () => {
      active = false;
      stream.close();
      if (poller !== undefined) window.clearInterval(poller);
    };
  }, [initialProject.id, refresh]);

  const retry = useCallback(() => {
    setConnection("polling");
    void refresh();
  }, [refresh]);

  return { project, frames, connection, retry };
}
