import type { ClearanceItem } from "@clearcut/contracts";

/**
 * Detection → sources → holder → route, as a spine.
 *
 * The connector is drawn per node rather than once on the list. A single
 * pseudo-element had to guess where the first and last dots were, and got it
 * wrong: it sat at left-[7px] while a 7px dot in a 15px column centres at
 * 3.5px, and its top/bottom insets bore no relation to the dot centres, so the
 * line missed the dots and overshot both ends. Each segment now runs from one
 * dot's centre to the next, which holds whatever height the cards take.
 */
export function EvidenceGraph({ item }: { item: ClearanceItem }) {
  const nodes = [
    { label: "DETECTION", value: item.provenance.replaceAll("_", " + ") },
    { label: "PUBLIC SOURCES", value: `${item.sources.length} cited` },
    { label: "RIGHTS CANDIDATE", value: item.candidate_rights_holders[0]?.name ?? "Unconfirmed" },
    { label: "LICENSING ROUTE", value: item.licensing_routes[0]?.route ?? "Gap" },
  ];
  const unresolvedTail = item.licensing_routes.length === 0;

  return (
    <ol aria-label="Evidence graph" className="mt-4 space-y-2">
      {nodes.map((node, index) => {
        const last = index === nodes.length - 1;
        return (
          <li className="relative grid grid-cols-[9px_minmax(0,1fr)] gap-3" key={node.label}>
            {/* Dot centre sits 14px down; the segment spans this card plus the
                8px gap, landing exactly on the next dot's centre. */}
            {!last && (
              <span
                aria-hidden="true"
                className="absolute left-1 top-[14px] h-[calc(100%+8px)] w-px bg-border"
              />
            )}
            <span
              className={`relative z-10 mt-[10px] size-[9px] rounded-full ring-2 ring-background ${
                last && unresolvedTail ? "bg-risk-red" : "bg-primary"
              }`}
            />
            <div className="min-w-0 rounded-lg p-2.5 shadow-[inset_0_0_0_1px_oklch(0_0_0/0.07)]">
              <span className="font-mono text-[9px] tracking-[0.06em] text-muted-foreground">{node.label}</span>
              {/* No capitalize here: these values are researched proper nouns,
                  and title-casing them produces "NASA Office Of Communications". */}
              <span className="mt-1 block text-xs break-words first-letter:uppercase">{node.value}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
