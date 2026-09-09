import type { ClearanceItem } from "@clearcut/contracts";
import { UserRound } from "lucide-react";

import { STATUS_LABEL } from "./vocabulary";

/**
 * What people have decided about this case.
 *
 * Recording a decision wrote an audit event and changed a status word, and
 * nothing anywhere showed it: the panel offered no history, and the production
 * header counted only fully resolved cases, so a coordinator's verification
 * read as though the click had done nothing. The trail is the product's whole
 * claim — that a person, named, decided this and said why — so it belongs on
 * the case, not only in the export.
 */
export function DecisionHistory({ item }: { item: ClearanceItem }) {
  const decisions = item.audit_events.filter((event) => event.actor === "coordinator" || event.actor === "counsel");
  if (decisions.length === 0) return null;

  return (
    <section className="mt-4">
      <p className="text-[11px] font-medium">Decisions</p>
      <ol className="mt-2 divide-y divide-border border-y border-border">
        {[...decisions].reverse().map((event) => (
          <li className="py-2.5" key={event.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-xs font-medium">{STATUS_LABEL[event.to_status as keyof typeof STATUS_LABEL] ?? event.to_status}</span>
              <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground" dateTime={event.at}>
                {new Date(event.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </time>
            </div>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <UserRound className="size-3" />
              {event.actor_name.trim() || `Unnamed ${event.actor}`}
            </p>
            {event.rationale && <p className="mt-1 text-xs leading-5 text-pretty text-muted-foreground">{event.rationale}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
