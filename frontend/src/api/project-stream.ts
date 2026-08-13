import type { StreamFrame } from "./client";


export interface ProjectStream {
  close: () => void;
}

export function openProjectStream(
  projectId: string,
  onFrame: (frame: StreamFrame) => void,
  onDisconnect: () => void,
): ProjectStream {
  const source = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/stream`);
  let disconnected = false;

  source.onmessage = (event) => {
    if (!event.data) return;
    try {
      onFrame(JSON.parse(event.data) as StreamFrame);
    } catch {
      // Keep the last valid project state when a frame is malformed.
    }
  };
  source.onerror = () => {
    if (disconnected) return;
    disconnected = true;
    source.close();
    onDisconnect();
  };
  return { close: () => source.close() };
}
