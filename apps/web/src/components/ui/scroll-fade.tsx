"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A scrolling region that shows its overflow as a fade rather than a scrollbar.
 *
 * The fade grows only once something is hidden behind it, and in proportion to
 * how much — so a faded edge means there is more that way and a clean edge
 * means there is not. The app shows no scrollbars anywhere; this is what
 * replaces them.
 *
 * The caller keeps its own overflow classes: several of these regions scroll
 * sideways on a phone and downward on a desktop, and only the caller knows
 * which. Where nothing is hidden, both fades measure zero and nothing paints.
 */

/** How tall a fade grows once fully extended. */
const MAX_FADE_PX = 64;

export function ScrollFade({
  children,
  className,
  viewportClassName,
}: {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const measure = useCallback(() => {
    const element = viewport.current;
    const host = wrapper.current;
    if (!element || !host) return;
    const hidden = element.scrollHeight - element.clientHeight;
    const above = Math.max(0, Math.min(element.scrollTop, MAX_FADE_PX));
    const below = Math.max(0, Math.min(hidden - element.scrollTop, MAX_FADE_PX));
    host.style.setProperty("--fade-top", `${above}px`);
    host.style.setProperty("--fade-bottom", `${below}px`);
  }, []);

  // One measurement per frame: scroll fires far faster than the page paints.
  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    measure();
    // Content arriving later — another case selected, a screenplay loading —
    // changes what is hidden without any scrolling having happened.
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [measure, schedule]);

  return (
    <div className={cn("relative min-h-0", className)} ref={wrapper}>
      {/* `relative` on the *viewport* is load-bearing, not decoration: an
          absolutely positioned descendant is clipped only by an ancestor that
          is both positioned and clipping. The overflow lives here, so the
          position has to as well — with it on the wrapper instead, every
          sr-only label inside a long list escapes and stretches the page. */}
      <div className={cn("relative no-scrollbar", viewportClassName)} onScroll={schedule} ref={viewport}>
        {children}
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-background to-transparent"
        style={{ height: "var(--fade-top, 0px)" }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background to-transparent"
        style={{ height: "var(--fade-bottom, 0px)" }}
      />
    </div>
  );
}
