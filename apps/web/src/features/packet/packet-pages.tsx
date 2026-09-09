"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * The packet as paper.
 *
 * A clearance packet is handed to counsel, so the preview shows the document it
 * will become rather than a scrolling web column. The markdown is rendered once
 * into a hidden measurer, each top-level block is measured, and the blocks are
 * distributed across Letter sheets. That keeps a heading with real page breaks
 * instead of drawing decorative rules over a continuous column.
 *
 * The same sheets are what print, so the exported PDF matches the preview.
 */

// Letter at 96dpi, with a 0.75in margin.
const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1056;
const PAGE_PADDING = 72;
const CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_PADDING * 2;

/** Element styling for the rendered packet, shared by the measurer and pages. */
const PROSE =
  "text-[12.5px] leading-[1.55] [&_a]:underline [&_blockquote]:my-2.5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[10.5px] [&_em]:italic [&_h1]:mb-1 [&_h1]:text-[19px] [&_h1]:font-medium [&_h1]:tracking-[-0.02em] [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:border-t [&_h2]:border-border [&_h2]:pt-4 [&_h2]:font-mono [&_h2]:text-[9.5px] [&_h2]:uppercase [&_h2]:tracking-[0.08em] [&_h2]:text-muted-foreground [&_h3]:mb-1 [&_h3]:mt-3.5 [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-[0.04em] [&_hr]:hidden [&_li]:mt-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_strong]:font-semibold [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[11px] [&_td]:border-b [&_td]:border-border [&_td]:py-1 [&_td]:pr-3 [&_td]:align-top [&_th]:border-b [&_th]:border-border [&_th]:py-1 [&_th]:pr-3 [&_th]:text-left [&_th]:font-medium [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5";

export function PacketPages({ markdown, title }: { markdown: string; title: string }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([]);

  useEffect(() => {
    const container = measureRef.current;
    if (!container) return;

    const paginate = () => {
      const blocks = [...container.children] as HTMLElement[];
      if (blocks.length === 0) return;
      const grouped: string[] = [];
      let buffer = "";
      let used = 0;

      for (const block of blocks) {
        const style = getComputedStyle(block);
        const height = block.offsetHeight
          + Number.parseFloat(style.marginTop || "0")
          + Number.parseFloat(style.marginBottom || "0");
        // A block taller than a page cannot be split further here; give it its
        // own sheet and let it overflow rather than dropping it.
        if (used > 0 && used + height > CONTENT_HEIGHT) {
          grouped.push(buffer);
          buffer = "";
          used = 0;
        }
        buffer += block.outerHTML;
        used += height;
      }
      if (buffer) grouped.push(buffer);
      setPages(grouped);
    };

    // Fonts change block heights, so paginate once they have settled.
    paginate();
    void document.fonts?.ready.then(paginate).catch(() => undefined);
  }, [markdown]);

  return (
    <>
      {/* Measurer: same width and typography as a page's content box, so the
          heights read here are the heights the sheets will use. */}
      <div aria-hidden="true" className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: PAGE_WIDTH - PAGE_PADDING * 2 }}>
        <div className={PROSE} ref={measureRef}>
          <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
        </div>
      </div>

      <div className="packet-pages flex flex-col items-center gap-6">
        {pages.length === 0 ? (
          <div className={`w-full max-w-[816px] ${PROSE}`}>
            <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
          </div>
        ) : pages.map((html, index) => (
          <article
            aria-label={`Page ${index + 1} of ${pages.length}`}
            className="packet-page relative shrink-0 bg-white text-black shadow-[0_1px_2px_oklch(0_0_0/0.06),0_8px_24px_-12px_oklch(0_0_0/0.25)]"
            key={index}
            style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, padding: PAGE_PADDING }}
          >
            <div className={PROSE} dangerouslySetInnerHTML={{ __html: html }} />
            <footer className="absolute inset-x-[72px] bottom-8 flex justify-between border-t border-black/10 pt-2 font-mono text-[8.5px] uppercase tracking-[0.08em] text-black/45">
              <span className="truncate pr-4">{title}</span>
              <span className="tabular-nums">{index + 1} / {pages.length}</span>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}
