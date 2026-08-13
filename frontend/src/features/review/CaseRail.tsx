import { useMemo, useRef } from "react";

import StatusMark from "../../components/StatusMark";
import type { ClearanceItem, HeatColor } from "../../types";
import { CATEGORY_LABEL, STATUS_LABEL, formatTimecode } from "../../types";


export type CaseFilter =
  | "all"
  | "unscripted"
  | "unresolved"
  | "incomplete"
  | "verified"
  | "documented"
  | "reopened";

export interface CaseQuery {
  filter: CaseFilter;
  search: string;
}

const FILTERS: { key: CaseFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unscripted", label: "Unscripted" },
  { key: "unresolved", label: "Unresolved" },
  { key: "incomplete", label: "Incomplete" },
  { key: "verified", label: "Verified" },
  { key: "documented", label: "Documented" },
  { key: "reopened", label: "Reopened" },
];

function urgency(item: ClearanceItem): number {
  if (item.workflow_status.startsWith("reopened_by_")) return 0;
  if (item.provenance === "cut_only") return 1;
  if (item.color === "red") return 2;
  if (item.color === "amber") return 3;
  return 4;
}

export function rankCases(items: ClearanceItem[]): ClearanceItem[] {
  return [...items].sort(
    (left, right) => urgency(left) - urgency(right) || left.name.localeCompare(right.name),
  );
}

function matchesFilter(item: ClearanceItem, filter: CaseFilter): boolean {
  if (filter === "unscripted") return item.provenance === "cut_only";
  if (filter === "unresolved") return item.color === "red";
  if (filter === "incomplete") return item.color === "amber";
  if (filter === "verified") return item.color === "blue";
  if (filter === "documented") return item.color === "green";
  if (filter === "reopened") return item.workflow_status.startsWith("reopened_by_");
  return true;
}

function matchesSearch(item: ClearanceItem, search: string): boolean {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return true;
  return [
    item.name,
    item.category,
    ...item.script_references.map((reference) => reference.scene_heading),
    ...item.candidate_rights_holders.map((holder) => holder.name),
  ].some((value) => value.toLocaleLowerCase().includes(query));
}

interface Props {
  items: ClearanceItem[];
  selectedId: string | null;
  query: CaseQuery;
  onQuery: (query: CaseQuery) => void;
  onSelect: (item: ClearanceItem) => void;
}

export default function CaseRail({ items, selectedId, query, onQuery, onSelect }: Props) {
  const list = useRef<HTMLDivElement>(null);
  const visible = useMemo(
    () => rankCases(items).filter((item) => matchesFilter(item, query.filter) && matchesSearch(item, query.search)),
    [items, query.filter, query.search],
  );

  function moveSelection(direction: number) {
    if (!visible.length) return;
    const current = Math.max(0, visible.findIndex((item) => item.id === selectedId));
    onSelect(visible[(current + direction + visible.length) % visible.length]);
  }

  return (
    <aside className="case-rail" aria-label="Clearance cases">
      <label className="case-search">
        <span className="sr-only">Search clearance cases</span>
        <input
          type="search"
          value={query.search}
          placeholder="Search cases"
          onChange={(event) => onQuery({ ...query, search: event.target.value })}
        />
      </label>
      <div className="case-filters" aria-label="Case filters">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={query.filter === filter.key ? "is-active" : ""}
            onClick={() => onQuery({ ...query, filter: filter.key })}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div
        className="case-list"
        ref={list}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveSelection(1);
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            moveSelection(-1);
          }
        }}
      >
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`case-row${selectedId === item.id ? " is-selected" : ""}`}
            aria-pressed={selectedId === item.id}
            onClick={() => onSelect(item)}
          >
            <span className="case-row__head">
              <strong>{item.name}</strong>
              <StatusMark label={STATUS_LABEL[item.workflow_status]} tone={item.color as HeatColor} />
            </span>
            <span className="case-row__meta">
              {CATEGORY_LABEL[item.category] ?? item.category}
              {item.provenance === "cut_only" ? " · unscripted" : ""}
              {item.cut_detections[0] ? ` · ${formatTimecode(item.cut_detections[0].timecode.start)}` : ""}
            </span>
          </button>
        ))}
        {visible.length === 0 && <p>No cases in this view.</p>}
      </div>
    </aside>
  );
}
