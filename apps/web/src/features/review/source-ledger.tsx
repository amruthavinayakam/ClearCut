import type { EvidenceSource } from "@clearcut/contracts";
import { ArrowUpRight } from "lucide-react";

import { RETRIEVAL_LABEL } from "./vocabulary";

/** A malformed URL must not take down the ledger it appears in. */
function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function SourceLedger({ sources }: { sources: EvidenceSource[] }) {
  if (sources.length === 0) {
    return <p className="py-5 text-xs text-muted-foreground">No sources found for this case yet.</p>;
  }

  return (
    <ol className="divide-y divide-border border-y border-border">
      {sources.map((source, index) => (
        <li className="py-3" key={`${source.url}-${index}`}>
          <div className="flex items-start justify-between gap-3">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {index + 1} · {RETRIEVAL_LABEL[source.via] ?? source.via.replaceAll("_", " ")}
            </span>
            {/* The visible glyph is 14px; the hit area is padded out to 40px so
                it is actually clickable, and -mr/-mt pull it back so the
                padding does not shift the row it sits in. */}
            <a
              aria-label={`Open source ${index + 1} at ${hostname(source.url)}`}
              className="-mr-2.5 -mt-2.5 grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground transition-[color,background-color,scale] hover:bg-muted hover:text-foreground active:scale-[0.96]"
              href={source.url}
              rel="noreferrer"
              target="_blank"
            >
              <ArrowUpRight className="size-3.5" />
            </a>
          </div>
          {/* A source title is often a bare URL, which has no spaces to break on. */}
          <p className="mt-1 text-xs font-medium break-words">{source.title ?? hostname(source.url)}</p>
          {/* Clamped for scanning; the full excerpt stays reachable on hover
              rather than being lost to the clamp. */}
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-pretty text-muted-foreground" title={source.excerpt}>
            {source.excerpt}
          </p>
        </li>
      ))}
    </ol>
  );
}
