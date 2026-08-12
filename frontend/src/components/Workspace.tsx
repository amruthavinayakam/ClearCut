import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api";
import type { ClearanceItem, MonitorRecord, Project } from "../types";
import { CATEGORY_LABEL, STATUS_LABEL, formatTimecode } from "../types";
import Copilot from "./Copilot";
import Heatmap from "./Heatmap";
import ItemDetail from "./ItemDetail";

interface Props {
  project: Project;
  monitors: MonitorRecord[];
  onRefresh: () => void;
  onReset: () => void;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unscripted", label: "Unscripted" },
  { key: "red", label: "Unresolved" },
  { key: "amber", label: "Incomplete" },
  { key: "resolved", label: "Resolved" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function matches(item: ClearanceItem, filter: FilterKey): boolean {
  switch (filter) {
    case "unscripted":
      return item.provenance === "cut_only";
    case "red":
      return item.color === "red";
    case "amber":
      return item.color === "amber";
    case "resolved":
      return item.is_resolved;
    default:
      return true;
  }
}

export default function Workspace({ project, monitors, onRefresh, onReset }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const seekRef = useRef<(seconds: number) => void>(() => undefined);

  const visible = useMemo(
    () => project.items.filter((item) => matches(item, filter)),
    [project.items, filter],
  );

  // Open on the first unscripted item — the thing nobody planned for.
  useEffect(() => {
    if (selectedId && project.items.some((i) => i.id === selectedId)) return;
    const first =
      project.items.find((i) => i.provenance === "cut_only") ?? project.items[0] ?? null;
    setSelectedId(first?.id ?? null);
  }, [project.items, selectedId]);

  const selected = project.items.find((item) => item.id === selectedId) ?? null;
  const { colors, reconciliation } = project.summary;

  return (
    <>
      <div className="row" style={{ marginBottom: 16, justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.025em" }}>{project.title}</h2>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--text-dim)" }}>
            {project.script ? `${project.script.label} · ${project.script.scene_count} scenes` : "no script"}
            {" · "}
            {project.cut ? `${project.cut.label} · ${project.cut.duration_s.toFixed(0)}s` : "no cut"}
            {" · "}
            {project.summary.total_citations} sources cited
          </div>
        </div>
        <div className="row">
          <a className="btn small" href={api.packetUrl(project.id)} download>
            Export packet (.md)
          </a>
          <button className="btn ghost small" onClick={onReset}>
            New project
          </button>
        </div>
      </div>

      <div className="tally-row">
        <div className="tally red">
          <div className="n">{colors.red}</div>
          <div className="l">Unresolved</div>
        </div>
        <div className="tally amber">
          <div className="n">{colors.amber}</div>
          <div className="l">Incomplete</div>
        </div>
        <div className="tally blue">
          <div className="n">{colors.blue}</div>
          <div className="l">Verified</div>
        </div>
        <div className="tally green">
          <div className="n">{colors.green}</div>
          <div className="l">Documented</div>
        </div>
        <div className="tally accent">
          <div className="n">{project.summary.unscripted_items}</div>
          <div className="l">Unscripted</div>
        </div>
        <div className="tally">
          <div className="n">{project.summary.ai_issued_approvals}</div>
          <div className="l">AI approvals</div>
        </div>
      </div>

      <div className="workspace">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Heatmap
            project={project}
            selectedId={selectedId}
            seekRef={seekRef}
            onSelect={setSelectedId}
          />

          <div className="panel">
            <div className="panel-head">
              <span>Review queue</span>
              <span className="plain">{visible.length} shown</span>
            </div>
            <div className="panel-body">
              <div className="filters">
                {FILTERS.map((option) => (
                  <button
                    key={option.key}
                    className={`filter${filter === option.key ? " on" : ""}`}
                    onClick={() => setFilter(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="queue">
                {visible.length === 0 ? (
                  <div className="empty">Nothing in this bucket.</div>
                ) : (
                  visible.map((item) => (
                    <div
                      key={item.id}
                      className={`queue-item ${item.color}${selectedId === item.id ? " selected" : ""}`}
                      onClick={() => {
                        setSelectedId(item.id);
                        if (item.cut_detections[0]) {
                          seekRef.current(item.cut_detections[0].timecode.start + 0.15);
                        }
                      }}
                    >
                      <h4>
                        {item.name}
                        <span className="tag">{CATEGORY_LABEL[item.category] ?? item.category}</span>
                        {item.provenance === "cut_only" && (
                          <span className="tag unscripted">unscripted</span>
                        )}
                        {item.monitor_id && <span className="tag">watched</span>}
                      </h4>
                      <div className="meta">
                        {STATUS_LABEL[item.workflow_status]}
                        {item.cut_detections[0] &&
                          ` · ${formatTimecode(item.cut_detections[0].timecode.start)}`}
                        {` · ${item.citation_count} sources`}
                        {item.candidate_rights_holders.length > 0 &&
                          ` · ${item.candidate_rights_holders.length} candidate holder(s)`}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {selected ? (
            <ItemDetail
              projectId={project.id}
              item={selected}
              onChanged={onRefresh}
              onSeek={(seconds) => seekRef.current(seconds)}
            />
          ) : (
            <div className="panel">
              <div className="panel-body empty">Select an item to see its evidence.</div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">Script vs cut</div>
            <div className="panel-body">
              <div className={`recon-row${reconciliation.cut_only ? " alarm" : ""}`}>
                <span>Unscripted (cut only)</span>
                <span className="n">{reconciliation.cut_only}</span>
              </div>
              <div className={`recon-row${reconciliation.materially_changed ? " alarm" : ""}`}>
                <span>Materially changed</span>
                <span className="n">{reconciliation.materially_changed}</span>
              </div>
              <div className="recon-row">
                <span>In both</span>
                <span className="n">{reconciliation.in_both}</span>
              </div>
              <div className="recon-row">
                <span>Script only</span>
                <span className="n">{reconciliation.script_only}</span>
              </div>

              {project.reconciliation
                .filter((finding) => finding.kind === "materially_changed" || finding.kind === "cut_only")
                .slice(0, 4)
                .map((finding) => (
                  <div
                    key={finding.item_id}
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      color: "var(--text-muted)",
                      borderLeft: "2px solid var(--red)",
                      paddingLeft: 10,
                    }}
                  >
                    <strong>{finding.item_name}</strong> — {finding.explanation}
                  </div>
                ))}
            </div>
          </div>

          <Copilot projectId={project.id} />

          <div className="panel">
            <div className="panel-head">
              <span>Standing monitors</span>
              <span className="plain">{monitors.length}</span>
            </div>
            <div className="panel-body">
              {monitors.length === 0 ? (
                <div className="empty">
                  None yet. Open one on any unresolved item — rights change hands long
                  after a packet ships.
                </div>
              ) : (
                monitors.map((monitor) => (
                  <div className="monitor" key={monitor.monitor_id}>
                    <div className="name">
                      <span className="pulse" />
                      {monitor.item_name}
                      <span className="tag" style={{ marginLeft: "auto" }}>
                        every {monitor.frequency}
                      </span>
                    </div>
                    <div className="query">{monitor.query}</div>
                    {(monitor.events ?? []).slice(0, 2).map((event, index) => (
                      <div className="monitor-event" key={event.event_id ?? index}>
                        {event.event_date && (
                          <div style={{ color: "var(--text-dim)", fontSize: 11 }}>
                            {event.event_date}
                          </div>
                        )}
                        {event.content}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="footer-note">
        Clearance Radar is clearance research and coordination support, not legal advice,
        and nothing here is a legal clearance. Rights holders shown are candidates derived
        from public sources — confirm before reliance. Legal conclusions belong to
        production counsel.
      </div>
    </>
  );
}
