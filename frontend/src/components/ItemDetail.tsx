import { useState } from "react";

import { api } from "../api";
import type { Actor, ClearanceItem, WorkflowStatus } from "../types";
import { CATEGORY_LABEL, STATUS_LABEL, formatTimecode } from "../types";

interface Props {
  projectId: string;
  item: ClearanceItem;
  onChanged: () => void;
  onSeek: (seconds: number) => void;
}

/** Transitions offered in the UI, with the actor who owns each. */
const ACTIONS: { status: WorkflowStatus; label: string; actor: Actor; className: string }[] = [
  { status: "coordinator_verified", label: "Verify match", actor: "coordinator", className: "human" },
  { status: "documented_permission", label: "Documented permission", actor: "coordinator", className: "counsel" },
  { status: "approved_replacement", label: "Approve replacement", actor: "coordinator", className: "counsel" },
  { status: "counsel_approved", label: "Counsel sign-off", actor: "counsel", className: "counsel" },
  { status: "waiting_on_rights_holder", label: "Waiting on holder", actor: "coordinator", className: "" },
  { status: "replacement_requested", label: "Request replacement", actor: "coordinator", className: "" },
  { status: "false_positive", label: "Dismiss", actor: "coordinator", className: "" },
];

function Node({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="evidence-node">
      <div className="label">{label}</div>
      <div className="value">{children}</div>
    </div>
  );
}

export default function ItemDetail({ projectId, item, onChanged, onSeek }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  async function move(status: WorkflowStatus, actor: Actor, label: string) {
    setBusy(true);
    setError(null);
    try {
      await api.setStatus(projectId, item.id, status, actor, `${label} via review queue.`);
      onChanged();
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Deliberate: proves the server refuses, live, in front of the judges. */
  async function attemptAgentApproval() {
    setBusy(true);
    setError(null);
    try {
      await api.setStatus(
        projectId,
        item.id,
        "counsel_approved",
        "agent",
        "Agent attempting to self-approve — this must be refused.",
      );
      setError("UNEXPECTED: the server allowed an agent approval. That is a bug.");
    } catch (exc) {
      setError(`Refused by the server (as designed): ${(exc as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function draft() {
    setDrafting(true);
    setError(null);
    try {
      await api.draftRequest(projectId, item.id);
      onChanged();
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  async function watch() {
    setBusy(true);
    setError(null);
    try {
      await api.createMonitor(projectId, item.id, "1d");
      onChanged();
    } catch (exc) {
      setError((exc as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sources = item.sources.filter(
    (source, index, all) => all.findIndex((s) => s.url === source.url) === index,
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Evidence</span>
        <span className={`badge ${item.color}`}>{STATUS_LABEL[item.workflow_status]}</span>
      </div>

      <div className="panel-body">
        <div className="evidence-root">
          {item.cut_detections[0]
            ? `Frame ${formatTimecode(item.cut_detections[0].representative_time)}`
            : item.script_references[0]
              ? `Script scene ${item.script_references[0].scene_index}`
              : "Item"}
        </div>

        <h3 style={{ margin: "0 0 4px", fontSize: 19, letterSpacing: "-0.02em" }}>{item.name}</h3>
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14 }}>
          {CATEGORY_LABEL[item.category] ?? item.category} ·{" "}
          {item.provenance === "cut_only"
            ? "unscripted — entered through production"
            : item.provenance === "both"
              ? "in script and cut"
              : "script only"}{" "}
          · detection {item.detection_confidence}
        </div>

        <div className="evidence">
          <Node label="Script reference">
            {item.script_references.length === 0 ? (
              <em style={{ color: "var(--red)" }}>none — unscripted</em>
            ) : (
              item.script_references.map((ref, index) => (
                <div key={index} style={{ marginBottom: 6 }}>
                  Scene {ref.scene_index} · {ref.scene_heading}
                  {ref.page ? ` · p.${ref.page}` : ""}
                  {ref.excerpt && <blockquote style={{ margin: "4px 0 0" }}>{ref.excerpt.trim()}</blockquote>}
                </div>
              ))
            )}
          </Node>

          {item.cut_detections.length > 0 && (
            <Node label="On screen">
              {item.cut_detections.map((detection, index) => (
                <div key={index} style={{ marginBottom: 6 }}>
                  <span
                    className="where"
                    style={{ cursor: "pointer", color: "var(--accent)" }}
                    onClick={() => onSeek(detection.timecode.start + 0.15)}
                  >
                    {formatTimecode(detection.timecode.start)} –{" "}
                    {formatTimecode(detection.timecode.end)}
                  </span>{" "}
                  <span style={{ color: "var(--text-dim)", fontSize: 12 }}>({detection.modality})</span>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                    {detection.observation}
                  </div>
                </div>
              ))}
            </Node>
          )}

          <Node label="Candidate rights holders">
            {item.candidate_rights_holders.length === 0 ? (
              <em style={{ color: "var(--red)" }}>
                none established — cannot be cleared until ownership is found
              </em>
            ) : (
              item.candidate_rights_holders.map((holder, index) => (
                <div className="holder" key={index}>
                  <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                    <span className="name">{holder.name}</span>
                    <span className={`conf ${holder.confidence}`}>{holder.confidence}</span>
                  </div>
                  <div className="role">{holder.role}{holder.share ? ` · ${holder.share}` : ""}</div>
                  {holder.rights_implicated.length > 0 && (
                    <div className="rights">Rights: {holder.rights_implicated.join(", ")}</div>
                  )}
                  {holder.basis && <div className="basis">{holder.basis}</div>}
                </div>
              ))
            )}
          </Node>

          {item.licensing_routes.length > 0 && (
            <Node label="Licensing route">
              {item.licensing_routes.map((route, index) => (
                <div key={index} style={{ marginBottom: 7 }}>
                  <strong style={{ fontSize: 13.5 }}>
                    {route.url ? (
                      <a href={route.url} target="_blank" rel="noreferrer noopener">
                        {route.organization}
                      </a>
                    ) : (
                      route.organization
                    )}
                  </strong>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{route.route}</div>
                  {route.contact && (
                    <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                      {route.contact}
                    </div>
                  )}
                </div>
              ))}
            </Node>
          )}

          {item.evidence_gaps.length > 0 && (
            <Node label="Missing evidence">
              <ul className="gap-list">
                {item.evidence_gaps.map((gap, index) => (
                  <li key={index}>{gap}</li>
                ))}
              </ul>
            </Node>
          )}

          {item.recommended_actions.length > 0 && (
            <Node label="Recommended next action">
              <ol className="action-list">
                {item.recommended_actions.map((action, index) => (
                  <li key={index}>{action}</li>
                ))}
              </ol>
            </Node>
          )}

          <Node label={`Cited evidence — ${sources.length}`}>
            {sources.length === 0 ? (
              <em style={{ color: "var(--text-dim)" }}>no sources retrieved</em>
            ) : (
              sources.slice(0, 12).map((source, index) => (
                <div className="citation" key={index}>
                  <div className="via">
                    {source.via.replace("_", " ")} · retrieved {source.retrieved_at.slice(0, 10)}
                  </div>
                  <a href={source.url} target="_blank" rel="noreferrer noopener">
                    {source.title || source.url}
                  </a>
                  <div className="url">{source.url}</div>
                  {source.excerpt && <div className="excerpt">“{source.excerpt.slice(0, 220)}”</div>}
                </div>
              ))
            )}
          </Node>
        </div>

        {item.research_summary && (
          <div className="section" style={{ marginTop: 16 }}>
            <h5>Research summary</h5>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: 0, whiteSpace: "pre-wrap" }}>
              {item.research_summary}
            </p>
          </div>
        )}

        {item.draft_request && (
          <div className="section">
            <h5>Permission request draft — not sent</h5>
            <blockquote style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12.5 }}>
              {item.draft_request}
            </blockquote>
          </div>
        )}

        {/* ---- the guarded surface ---- */}
        <div className="approval">
          <div className="approval-note">
            Only a human can resolve this item. The agent assembled the evidence above and
            stopped at <strong>evidence ready</strong>; every state past that is yours.
          </div>

          {error && <div className="error-banner" style={{ marginTop: 0, marginBottom: 10 }}>{error}</div>}

          <div className="approval-grid">
            {ACTIONS.map((action) => (
              <button
                key={action.status}
                className={`btn small ${action.className}`}
                disabled={busy || item.workflow_status === action.status}
                onClick={() => move(action.status, action.actor, action.label)}
                title={`Recorded as: ${action.actor}`}
              >
                {action.label}
              </button>
            ))}
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small" disabled={drafting} onClick={draft}>
              {drafting ? "Drafting…" : "Draft permission request"}
            </button>
            <button className="btn small" disabled={busy || Boolean(item.monitor_id)} onClick={watch}>
              {item.monitor_id ? "Monitor active" : "Watch for changes"}
            </button>
            <button
              className="btn small ghost"
              disabled={busy}
              onClick={attemptAgentApproval}
              title="Sends actor=agent with a human-owned status. The server must refuse."
            >
              Test: let the AI approve it
            </button>
          </div>
        </div>

        {item.audit_events.length > 0 && (
          <div className="section" style={{ marginTop: 18 }}>
            <h5>Audit trail — {item.audit_events.length}</h5>
            <div className="audit">
              {item.audit_events.map((event) => (
                <div className="audit-row" key={event.id}>
                  <span>{event.at.slice(11, 19)}</span>
                  <span className={`who ${event.actor}`}>{event.actor}</span>
                  <span>
                    {event.to_status
                      ? `${event.from_status ?? "—"} → ${event.to_status}`
                      : event.action}
                    {event.rationale && (
                      <div style={{ color: "var(--text-dim)", fontSize: 11.5 }}>{event.rationale}</div>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
