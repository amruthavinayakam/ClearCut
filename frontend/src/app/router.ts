import { useSyncExternalStore } from "react";


export type Route =
  | { name: "projects" }
  | { name: "new-project" }
  | { name: "project"; projectId: string }
  | { name: "new-revision"; projectId: string }
  | { name: "revision"; projectId: string; revisionId: string }
  | { name: "packet"; projectId: string }
  | { name: "not-found"; path: string };

const NAVIGATION_EVENT = "clearcut:navigate";

function segment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { name: "projects" };
  if (path === "/projects/new") return { name: "new-project" };

  const parts = path.split("/").filter(Boolean).map(segment);
  if (parts[0] !== "projects" || !parts[1]) return { name: "not-found", path };

  const projectId = parts[1];
  if (parts.length === 2) return { name: "project", projectId };
  if (parts.length === 3 && parts[2] === "packet") {
    return { name: "packet", projectId };
  }
  if (parts.length === 4 && parts[2] === "revisions" && parts[3] === "new") {
    return { name: "new-revision", projectId };
  }
  if (parts.length === 4 && parts[2] === "revisions") {
    return { name: "revision", projectId, revisionId: parts[3] };
  }
  return { name: "not-found", path };
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  window.addEventListener(NAVIGATION_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(NAVIGATION_EVENT, callback);
  };
}

function currentLocation(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function useRoute(): Route {
  const location = useSyncExternalStore(subscribe, currentLocation, () => "/");
  return parseRoute(location.split("?", 1)[0]);
}

export function navigate(path: string, options?: { replace?: boolean }): void {
  const target = new URL(path, window.location.origin);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = `${target.pathname}${target.search}${target.hash}`;
  if (next === current) return;
  if (options?.replace) window.history.replaceState({}, "", next);
  else window.history.pushState({}, "", next);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  window.scrollTo({ top: 0, behavior: "auto" });
}

export function followInternalLink(
  event: React.MouseEvent<HTMLAnchorElement>,
  path: string,
): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  navigate(path);
}
