"use client";

import { ProjectStreamEventSchema, type Project, type ProjectStreamEvent } from "@clearcut/contracts";

export type ProjectFeedHandlers = {
  onProject(project: Project): void;
  onEvent?(event: ProjectStreamEvent): void;
  onOpen?(): void;
  onError(): void;
};

export interface ProjectFeed {
  subscribe(handlers: ProjectFeedHandlers): () => void;
}

const eventNames = ["snapshot", "progress", "search_results", "search_failed", "item_status", "item_researched", "monitor_event", "done", "error", "heartbeat"] as const;

export function createBrowserProjectFeed(projectId: string): ProjectFeed {
  return {
    subscribe(handlers) {
      const source = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/stream`);
      source.addEventListener("open", () => handlers.onOpen?.());
      source.addEventListener("error", handlers.onError);
      const listeners = eventNames.map((name) => {
        const listener = (message: MessageEvent<string>) => {
          const event = ProjectStreamEventSchema.safeParse(JSON.parse(message.data) as unknown);
          if (!event.success) return;
          handlers.onEvent?.(event.data);
          if (event.data.type === "snapshot") handlers.onProject(event.data.project);
        };
        source.addEventListener(name, listener as EventListener);
        return [name, listener] as const;
      });
      return () => {
        for (const [name, listener] of listeners) source.removeEventListener(name, listener as EventListener);
        source.close();
      };
    },
  };
}
