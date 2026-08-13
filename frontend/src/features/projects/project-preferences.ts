interface ProjectPreferences {
  seenReveals: string[];
}

const memory = new Map<string, ProjectPreferences>();

function key(projectId: string): string {
  return `clearcut:project:${projectId}:preferences`;
}

function read(projectId: string): ProjectPreferences {
  const remembered = memory.get(projectId);
  if (remembered) return remembered;
  try {
    const raw = window.localStorage.getItem(key(projectId));
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectPreferences;
      const safe = { seenReveals: Array.isArray(parsed.seenReveals) ? parsed.seenReveals : [] };
      memory.set(projectId, safe);
      return safe;
    }
  } catch {
    // Privacy mode can make localStorage unavailable. In-memory continuity is
    // still preferable to making the product fail to render.
  }
  return { seenReveals: [] };
}

function write(projectId: string, preferences: ProjectPreferences): void {
  memory.set(projectId, preferences);
  try {
    window.localStorage.setItem(key(projectId), JSON.stringify(preferences));
  } catch {
    // The in-memory copy remains authoritative for this visit.
  }
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
