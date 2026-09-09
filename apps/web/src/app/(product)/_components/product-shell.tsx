"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileSearch, FolderOpen, HelpCircle, Search, Settings } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

/**
 * Application chrome: one bar, then the page.
 *
 * This was a 216px sidebar holding a single destination. A rail earns its width
 * by making several places reachable at once; with one it was mostly empty
 * space beside every screen, so the nav, the palette and the standing
 * disclaimer moved into the bar and the content took the width back.
 */

type Crumb = { label: string; href?: string };

/**
 * Lets a project-scoped page name itself in the trail.
 *
 * The shell only knows the URL, and a project id is not a name. Pages that have
 * loaded a production register its title here so the trail reads
 * Productions / <title> / Packet rather than stopping at a dead end.
 */
const ProjectCrumbContext = createContext<(crumb: { label: string; href: string } | null) => void>(() => {});

export function useProjectCrumb(crumb: { label: string; href: string } | null) {
  const set = useContext(ProjectCrumbContext);
  const label = crumb?.label;
  const href = crumb?.href;
  useEffect(() => {
    set(label && href ? { label, href } : null);
    return () => set(null);
  }, [set, label, href]);
}

function buildTrail(pathname: string, project: { label: string; href: string } | null): Crumb[] {
  const trail: Crumb[] = [{ label: "Productions", href: "/" }];
  if (pathname === "/") return trail;
  if (pathname === "/projects/new") return [...trail, { label: "New scan" }];
  if (project) trail.push(project);
  if (pathname.endsWith("/packet")) trail.push({ label: "Packet" });
  else if (pathname.endsWith("/revisions/new")) trail.push({ label: "New version" });
  else if (pathname.includes("/revisions/")) trail.push({ label: "Version" });
  return trail;
}

export function ProductShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [projectCrumb, setProjectCrumb] = useState<{ label: string; href: string } | null>(null);
  const crumbs = buildTrail(pathname, projectCrumb);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandsOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background/85 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
        <Link className="flex shrink-0 items-center gap-2" href="/">
          <span aria-hidden="true" className="size-2 bg-primary" />
          <span className="text-sm font-medium tracking-[-0.02em]">ClearCut</span>
        </Link>

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
          {crumbs.map((crumb, index) => (
            <span className="flex min-w-0 items-center gap-1.5" key={crumb.label}>
              <span aria-hidden="true" className="text-border">/</span>
              {crumb.href && index < crumbs.length - 1 ? (
                <Link className="truncate text-muted-foreground transition-colors hover:text-foreground" href={crumb.href}>{crumb.label}</Link>
              ) : (
                <span aria-current="page" className="truncate">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center">
          {/* Reads as the search field it opens. The previous version paired a
              ⌘ glyph with the word "Commands" and a ⌘K hint — the same signal
              three times — and stripping it back to a bare chip left nothing
              saying what the control was for. */}
          <button
            className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/40 pl-2.5 pr-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-56"
            onClick={() => setCommandsOpen(true)}
            type="button"
          >
            <Search className="size-3.5 shrink-0" />
            <span>Search</span>
            <kbd className="ml-auto hidden rounded border border-border bg-background px-1 py-0.5 font-mono text-[9px] sm:block">⌘K</kbd>
          </button>
        </div>
      </header>

      <ProjectCrumbContext.Provider value={setProjectCrumb}>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </ProjectCrumbContext.Provider>

      <CommandDialog onOpenChange={setCommandsOpen} open={commandsOpen}>
        <CommandInput placeholder="Search commands…" />
        <CommandList>
          <CommandEmpty>No command found.</CommandEmpty>
          <CommandGroup heading="Navigate">
            <CommandItem onSelect={() => { setCommandsOpen(false); router.push("/"); }}><FolderOpen /> Productions <CommandShortcut>G P</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => { setCommandsOpen(false); router.push("/projects/new"); }}><FileSearch /> New clearance scan <CommandShortcut>G N</CommandShortcut></CommandItem>
          </CommandGroup>
          <CommandGroup heading="Workspace">
            <CommandItem disabled><Settings /> Settings</CommandItem>
            <CommandItem disabled><HelpCircle /> Clearance methodology</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
