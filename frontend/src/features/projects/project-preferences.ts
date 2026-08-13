export interface ProjectPreferences {
  seenReveals: string[];
  selectedItemId: string | null;
  caseFilter: "all" | "unscripted" | "unresolved" | "incomplete" | "verified" | "documented" | "reopened";
  caseSearch: string;
  queueWidth: number;
  drawer: "activity" | "copilot" | null;
  videoPosition: number;
}

const DEFAULTS: ProjectPreferences = {
  seenReveals: [],
  selectedItemId: null,
  caseFilter: "all",
  caseSearch: "",
  queueWidth: 250,
  drawer: null,
  videoPosition: 0,
};

const FILTERS = new Set<ProjectPreferences["caseFilter"]>([
  "all", "unscripted", "unresolved", "incomplete", "verified", "documented", "reopened",
]);
const memory = new Map<string, ProjectPreferences>();

function key(projectId: string): string {
  return `clearcut:project:${projectId}:preferences`;
}

function safePreferences(value: Partial<ProjectPreferences>): ProjectPreferences {
  return {
    seenReveals: Array.isArray(value.seenReveals) ? value.seenReveals.filter((item): item is string => typeof item === "string") : [],
    selectedItemId: typeof value.selectedItemId === "string" ? value.selectedItemId : null,
    caseFilter: FILTERS.has(value.caseFilter as ProjectPreferences["caseFilter"])
      ? value.caseFilter as ProjectPreferences["caseFilter"]
      : "all",
    caseSearch: typeof value.caseSearch === "string" ? value.caseSearch.slice(0, 120) : "",
    queueWidth: typeof value.queueWidth === "number" ? Math.min(340, Math.max(210, value.queueWidth)) : 250,
    drawer: value.drawer === "activity" || value.drawer === "copilot" ? value.drawer : null,
    videoPosition: typeof value.videoPosition === "number" && value.videoPosition >= 0 ? value.videoPosition : 0,
  };
}

function read(projectId: string): ProjectPreferences {
  const remembered = memory.get(projectId);
  if (remembered) return remembered;
  try {
    const raw = window.localStorage.getItem(key(projectId));
    if (raw) {
      const safe = safePreferences(JSON.parse(raw) as Partial<ProjectPreferences>);
      memory.set(projectId, safe);
      return safe;
    }
  } catch {
    // Privacy mode can make localStorage unavailable. In-memory continuity is
    // still preferable to making the product fail to render.
  }
  return { ...DEFAULTS };
}

function write(projectId: string, preferences: ProjectPreferences): void {
  memory.set(projectId, preferences);
  try {
    window.localStorage.setItem(key(projectId), JSON.stringify(preferences));
  } catch {
    // The in-memory copy remains authoritative for this visit.
  }
}

export function getProjectPreferences(projectId: string): ProjectPreferences {
  return { ...read(projectId), seenReveals: [...read(projectId).seenReveals] };
}

export function updateProjectPreferences(
  projectId: string,
  changes: Partial<ProjectPreferences>,
): ProjectPreferences {
  const next = safePreferences({ ...read(projectId), ...changes });
  write(projectId, next);
  return next;
}

export function hasSeenReveal(projectId: string, revisionKey: string): boolean {
  return read(projectId).seenReveals.includes(revisionKey);
}

export function markRevealSeen(projectId: string, revisionKey: string): void {
  const preferences = read(projectId);
  if (preferences.seenReveals.includes(revisionKey)) return;
  write(projectId, {
    ...preferences,
    seenReveals: [...preferences.seenReveals, revisionKey].slice(-30),
  });
}

export function clearProjectPreferences(projectId: string): void {
  memory.delete(projectId);
  try {
    window.localStorage.removeItem(key(projectId));
  } catch {
    // Nothing else to clear.
  }
}
