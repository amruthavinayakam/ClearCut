import { useEffect, useMemo, useRef, useState } from "react";

import { navigate } from "../app/router";


export type WorkspaceCommand = "activity" | "next-case" | "previous-case" | "focus-search";
export const WORKSPACE_COMMAND_EVENT = "clearcut:workspace-command";

interface Command {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

function projectIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function inTextField(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

function workspaceCommand(command: WorkspaceCommand) {
  window.dispatchEvent(new CustomEvent(WORKSPACE_COMMAND_EVENT, { detail: command }));
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const commands = useMemo<Command[]>(() => {
    const projectId = projectIdFromPath();
    const base: Command[] = [
      { id: "projects", label: "Projects", hint: "G P", run: () => navigate("/") },
      { id: "new", label: "New clearance scan", hint: "G N", run: () => navigate("/projects/new") },
    ];
    if (!projectId) return base;
    return [
      ...base,
      { id: "revision", label: "Add revision", hint: "R", run: () => navigate(`/projects/${projectId}/revisions/new`) },
      { id: "packet", label: "Preview packet", hint: "P", run: () => navigate(`/projects/${projectId}/packet`) },
      { id: "activity", label: "Project activity", hint: "A", run: () => workspaceCommand("activity") },
      { id: "next", label: "Next case", hint: "J", run: () => workspaceCommand("next-case") },
      { id: "previous", label: "Previous case", hint: "K", run: () => workspaceCommand("previous-case") },
      { id: "search", label: "Focus case search", hint: "/", run: () => workspaceCommand("focus-search") },
    ];
  }, [open]);

  const visible = commands.filter((command) => command.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k" && !inTextField(event.target)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      window.requestAnimationFrame(() => input.current?.focus());
    } else if (document.activeElement === input.current) {
      trigger.current?.focus();
    }
  }, [open]);

  function run(command: Command | undefined) {
    if (!command) return;
    setOpen(false);
    command.run();
  }

  return (
    <>
      <button ref={trigger} className="command-trigger" type="button" onClick={() => setOpen(true)} aria-label="Open command palette">
        <span>Commands</span><kbd>⌘K</kbd>
      </button>
      {open ? (
        <div className="command-layer" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
            <label>
              <span className="sr-only">Search commands</span>
              <input
                ref={input}
                value={query}
                placeholder="Type a command"
                onChange={(event) => { setQuery(event.target.value); setActive(0); }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(visible.length - 1, value + 1)); }
                  if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
                  if (event.key === "Enter") { event.preventDefault(); run(visible[active]); }
                }}
              />
            </label>
            <div role="listbox" aria-label="Available commands">
              {visible.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(command)}
                >
                  <span>{command.label}</span><kbd>{command.hint}</kbd>
                </button>
              ))}
              {!visible.length ? <p>No matching command.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
