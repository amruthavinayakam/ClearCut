import type { ClearanceItem } from "@clearcut/contracts";

export function EvidenceGraph({ item }: { item: ClearanceItem }) {
  const nodes = [
    { label: "DETECTION", value: item.provenance.replaceAll("_", " + ") },
    { label: "PUBLIC SOURCES", value: `${item.sources.length} cited` },
    { label: "RIGHTS CANDIDATE", value: item.candidate_rights_holders[0]?.name ?? "Unconfirmed" },
    { label: "LICENSING ROUTE", value: item.licensing_routes[0]?.route ?? "Gap" },
  ];
  return (
    <ol aria-label="Evidence graph" className="relative mt-4 space-y-2 before:absolute before:bottom-4 before:left-[7px] before:top-4 before:w-px before:bg-border">
      {nodes.map((node, index) => <li className="relative grid grid-cols-[15px_1fr] gap-2" key={node.label}><span className={`z-10 mt-2 size-[7px] rounded-full border border-background ${index === nodes.length - 1 && item.licensing_routes.length === 0 ? "bg-risk-red" : "bg-primary"}`} /><div className="rounded-md border border-border p-2.5"><span className="font-mono text-[9px] tracking-[0.06em] text-muted-foreground">{node.label}</span><span className="mt-1 block text-xs">{node.value}</span></div></li>)}
    </ol>
  );
}
