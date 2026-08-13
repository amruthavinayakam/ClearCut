import { useEffect, useRef, useState } from "react";

import { api } from "../../api/client";
import { followInternalLink } from "../../app/router";
import Dialog from "../../components/Dialog";
import StatusMark from "../../components/StatusMark";
import type { ClearanceItem, Project } from "../../types";
import { CATEGORY_LABEL, STATUS_LABEL } from "../../types";
import ScopeAssessment, { assessDocumentScope } from "../review/ScopeAssessment";


function incomplete(item: ClearanceItem): boolean {
  return Boolean(
    item.research_error
    || !item.sources.length
    || ["detected", "researching", "unresolved", "reopened_by_revision", "reopened_by_monitor"].includes(item.workflow_status)
  );
}

function order(items: ClearanceItem[]): ClearanceItem[] {
  return [...items].sort((left, right) => {
    const urgency = (item: ClearanceItem) => item.workflow_status.startsWith("reopened_by_") ? 0 : incomplete(item) ? 1 : 2;
    return urgency(left) - urgency(right) || left.name.localeCompare(right.name);
  });
}

export default function PacketPreview({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const exportTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void api.getProject(projectId).then(setProject).catch((reason) => setError((reason as Error).message));
  }, [projectId]);

  async function exportPacket() {
    if (!project) return;
    setBusy(true);
    setError("");
    try {
      const blob = await api.confirmPacketExport(project.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `clearance-packet-${project.id}.md`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setConfirmOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The packet could not be exported.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !project) {
    return <main className="packet-state"><p className="eyebrow">Packet unavailable</p><h1>The current record could not be read.</h1><p role="alert">{error}</p></main>;
  }
  if (!project) {
    return <main className="packet-state" aria-busy="true"><p className="eyebrow">Building packet preview</p><h1>Reading the current server record.</h1></main>;
  }

  const incompleteItems = project.items.filter(incomplete);
  return (
    <main className="packet-preview">
      <header className="packet-head">
        <div>
          <p className="eyebrow">Clearance research packet</p>
          <h1>{project.title}</h1>
          <p>{project.script?.label ?? "No screenplay"} · {project.cut?.label ?? "No cut"} · active revision {project.active_revision_id ?? "legacy"}</p>
        </div>
        <a href={`/projects/${project.id}`} onClick={(event) => followInternalLink(event, `/projects/${project.id}`)}>Return to project</a>
      </header>

      {incompleteItems.length ? (
        <aside className="packet-warning" aria-label="Incomplete research">
          <strong>Incomplete research</strong>
          <span>{incompleteItems.length} case{incompleteItems.length === 1 ? "" : "s"} remain open or lack public sources. Export remains available for working review.</span>
        </aside>
      ) : null}

      <section className="packet-summary" aria-label="Packet summary">
        <div><span>Cases</span><strong>{project.summary.total_items}</strong></div>
        <div><span>Unscripted</span><strong>{project.summary.unscripted_items}</strong></div>
        <div><span>Sources</span><strong>{project.summary.total_citations}</strong></div>
        <div><span>Human-resolved</span><strong>{project.summary.resolved_items}</strong></div>
        <div><span>AI approvals</span><strong>{project.summary.ai_issued_approvals}</strong></div>
      </section>

      <p className="packet-boundary">Research for human legal review. This packet does not issue or constitute legal clearance.</p>

      <section className="packet-cases" aria-label="Current clearance cases">
        {order(project.items).map((item) => (
          <article key={item.id} aria-labelledby={`packet-${item.id}`}>
            <header>
              <div>
                <p className="eyebrow">{CATEGORY_LABEL[item.category] ?? item.category}{item.provenance === "cut_only" ? " · unscripted" : ""}</p>
                <h2 id={`packet-${item.id}`}>{item.name}</h2>
              </div>
              <StatusMark label={STATUS_LABEL[item.workflow_status]} tone={item.color} />
            </header>
            {item.description ? <p>{item.description}</p> : null}
            {item.research_error ? <p className="packet-case-error">Research incomplete: {item.research_error}</p> : null}
            {item.research_summary ? <section><h3>Research summary</h3><p>{item.research_summary}</p></section> : null}
            {item.evidence_gaps.length ? <section><h3>Evidence gaps</h3><ul>{item.evidence_gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></section> : null}
            {item.documents.length ? (
              <section>
                <h3>Production documents</h3>
                {item.documents.map((document) => (
                  <div className="packet-document" key={document.id}>
                    <strong>{document.title}</strong>
                    <span>{document.kind} · {document.original_filename || "recorded metadata"}</span>
                    <ScopeAssessment assessment={assessDocumentScope(project.use_profile, document)} />
                  </div>
                ))}
              </section>
            ) : null}
            <section>
              <h3>Sources · {item.citation_count}</h3>
              {item.sources.length ? (
                <ol className="packet-sources">{item.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer noopener">{source.title || source.url}</a><span>Retrieved {source.retrieved_at.slice(0, 10)}</span></li>)}</ol>
              ) : <p>No public sources retrieved.</p>}
            </section>
          </article>
        ))}
      </section>

      <footer className="packet-export">
        <div><p className="eyebrow">Current server state</p><strong>The download is generated again when you confirm.</strong><span>Previewing does not create an audit event.</span>{error ? <p className="form-error" role="alert">{error}</p> : null}</div>
        <button ref={exportTrigger} className="button button--primary" type="button" onClick={() => setConfirmOpen(true)}>Export current packet</button>
      </footer>

      <Dialog
        open={confirmOpen}
        title="Export current packet?"
        description="This generates a fresh Markdown packet from the active server state and records an audit event."
        onClose={() => setConfirmOpen(false)}
        returnFocusRef={exportTrigger}
      >
        <div className="dialog-actions">
          <button className="button button--quiet" type="button" onClick={() => setConfirmOpen(false)}>Cancel</button>
          <button className="button button--primary" type="button" disabled={busy} onClick={() => void exportPacket()}>{busy ? "Exporting…" : "Export Markdown packet"}</button>
        </div>
      </Dialog>
    </main>
  );
}
