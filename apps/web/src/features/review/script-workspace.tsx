"use client";

import type { ClearanceItem, ScreenplayDocument } from "@clearcut/contracts";
import { FileText, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The screenplay, with every clearance candidate marked in place.
 *
 * A case anchored to "scene 4, page 12" means little in the abstract; seeing it
 * inside the line that triggered it is the point. Excerpts are matched back
 * into the scene text and wrapped in a mark tinted by the case's risk colour,
 * so the page carries the same signal as the rail and the timeline.
 */

type Anchor = { item: ClearanceItem; excerpt: string };

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits one scene's text around the excerpts anchored to it.
 *
 * Excerpts come from the model and are not guaranteed to be exact substrings,
 * so a miss has to leave the text intact rather than drop it.
 */
function markScene(text: string, anchors: Anchor[]): Array<{ text: string; item: ClearanceItem | null }> {
  const usable = anchors.filter((anchor) => anchor.excerpt.trim().length > 3);
  if (usable.length === 0) return [{ text, item: null }];

  // Longest first: a short excerpt nested inside a longer one must not split it.
  const ordered = [...usable].sort((left, right) => right.excerpt.length - left.excerpt.length);
  let segments: Array<{ text: string; item: ClearanceItem | null }> = [{ text, item: null }];

  for (const anchor of ordered) {
    const pattern = new RegExp(escapeForRegExp(anchor.excerpt.trim()), "i");
    segments = segments.flatMap((segment) => {
      if (segment.item) return [segment];
      const match = pattern.exec(segment.text);
      if (!match) return [segment];
      const before = segment.text.slice(0, match.index);
      const hit = segment.text.slice(match.index, match.index + match[0].length);
      const after = segment.text.slice(match.index + match[0].length);
      return [
        ...(before ? [{ text: before, item: null }] : []),
        { text: hit, item: anchor.item },
        ...(after ? [{ text: after, item: null }] : []),
      ];
    });
  }
  return segments;
}

export function ScriptWorkspace({
  projectId,
  items,
  selectedId,
  onSelect,
  label,
}: {
  projectId: string;
  items: ClearanceItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: string;
}) {
  const [document_, setDocument] = useState<ScreenplayDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${encodeURIComponent(projectId)}/script`)
      .then((response) => {
        if (!response.ok) throw new Error("The screenplay could not be read.");
        return response.json();
      })
      .then((value) => { if (!cancelled) setDocument(value as ScreenplayDocument); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "The screenplay could not be read."); });
    return () => { cancelled = true; };
  }, [projectId]);

  // Anchors grouped by the scene they belong to.
  const anchorsByScene = useMemo(() => {
    const map = new Map<number, Anchor[]>();
    for (const item of items) {
      for (const reference of item.script_references) {
        const list = map.get(reference.scene_index) ?? [];
        list.push({ item, excerpt: reference.excerpt });
        map.set(reference.scene_index, list);
      }
    }
    return map;
  }, [items]);

  // Bring the selected case's line into view, the way the player seeks to a
  // marker. Queried after paint so render itself stays free of side effects.
  useEffect(() => {
    if (!selectedId) return;
    pageRef.current
      ?.querySelector(`[data-case="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [selectedId, document_]);

  if (error) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-8 text-center">
        <div>
          <FileText className="mx-auto size-5 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-xs font-medium">{error}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">A scanned PDF needs a text layer before it can be displayed.</p>
        </div>
      </div>
    );
  }

  if (!document_) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-4 py-6 sm:px-8">
      {/* Screenplay measure: a page of script is set narrow, and the mono face
          keeps the scene headings and dialogue aligned as the format expects. */}
      <article ref={pageRef} className="mx-auto max-w-[68ch] rounded-lg bg-background p-6 font-mono text-[12px] leading-[1.7] shadow-[0_1px_2px_oklch(0_0_0/0.05),0_8px_24px_-16px_oklch(0_0_0/0.2)] sm:p-10">
        <header className="mb-6 border-b border-border pb-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
          <h2 className="mt-1 text-sm font-medium tracking-[-0.01em]">{document_.title}</h2>
          <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
            {document_.scenes.length} scenes · {document_.page_count} pages
          </p>
        </header>

        {document_.scenes.map((scene) => {
          const anchors = anchorsByScene.get(scene.index) ?? [];
          return (
            <section className="mb-6" key={scene.index}>
              <h3 className="mb-1.5 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.06em]">
                <span className="tabular-nums text-muted-foreground">{String(scene.index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 break-words">{scene.heading}</span>
                {scene.page !== null && <span className="ml-auto shrink-0 text-[9px] font-normal tabular-nums text-muted-foreground">p.{scene.page}</span>}
              </h3>
              <p className="whitespace-pre-wrap text-foreground/90">
                {markScene(scene.text, anchors).map((segment, index) => {
                  const item = segment.item;
                  if (!item) return <span key={index}>{segment.text}</span>;
                  const active = item.id === selectedId;
                  return (
                    <mark
                      className={cn(
                        "cursor-pointer rounded-[3px] px-0.5 transition-colors",
                        `risk-highlight--${item.color}`,
                        active && "outline outline-2 outline-offset-1 outline-primary/50",
                      )}
                      data-case={item.id}
                      key={index}
                      onClick={() => onSelect(item.id)}
                      title={item.name}
                    >
                      {segment.text}
                    </mark>
                  );
                })}
              </p>
            </section>
          );
        })}
      </article>
    </div>
  );
}
