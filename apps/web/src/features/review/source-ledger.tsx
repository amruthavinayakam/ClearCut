import type { EvidenceSource } from "@clearcut/contracts";
import { ArrowUpRight } from "lucide-react";

export function SourceLedger({ sources }: { sources: EvidenceSource[] }) {
  if (sources.length === 0) return <p className="py-5 text-xs text-muted-foreground">No public source is attached to this case yet.</p>;
  return <ol className="divide-y divide-border border-y border-border">{sources.map((source, index) => <li className="py-3" key={`${source.url}-${index}`}><div className="flex items-start justify-between gap-3"><span className="font-mono text-[9px] text-muted-foreground">SRC {String(index + 1).padStart(2, "0")} / {source.via.replaceAll("_", " ").toUpperCase()}</span><a aria-label={`Open source ${index + 1}`} href={source.url} rel="noreferrer" target="_blank"><ArrowUpRight className="size-3.5 text-muted-foreground" /></a></div><p className="mt-1 text-xs font-medium">{source.title ?? new URL(source.url).hostname}</p><p className="mt-1 line-clamp-3 text-[11px] leading-4 text-muted-foreground">{source.excerpt}</p></li>)}</ol>;
}
