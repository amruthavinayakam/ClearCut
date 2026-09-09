import type { ClearanceItem } from "@clearcut/contracts";

import { PROVENANCE_LABEL } from "./vocabulary";

/**
 * The four facts a coordinator checks first, as a plain list.
 *
 * This was a spine of dots and outlined cards — four boxes, eight lines and a
 * connector to say four short things, which was the bulk of the panel's
 * crowding. It also fought the sticky header for stacking order and won,
 * leaving dots floating over the case title. A two-column list says the same
 * thing in half the height and cannot overlap anything.
 */
export function CaseFacts({ item }: { item: ClearanceItem }) {
  const facts = [
    { label: "Found in", value: PROVENANCE_LABEL[item.provenance] },
    { label: "Sources", value: `${item.sources.length}` },
    { label: "Likely owner", value: item.candidate_rights_holders[0]?.name ?? "Not established yet" },
    { label: "How to ask", value: item.licensing_routes[0]?.route ?? "No route found yet" },
  ];

  return (
    <dl className="mt-4 divide-y divide-border border-y border-border">
      {facts.map((fact) => (
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2.5" key={fact.label}>
          <dt className="text-[11px] leading-5 text-muted-foreground">{fact.label}</dt>
          {/* No capitalize: these are researched proper nouns, and title-casing
              them produces "NASA Office Of Communications". */}
          <dd className="text-xs leading-5 text-pretty break-words first-letter:uppercase">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
