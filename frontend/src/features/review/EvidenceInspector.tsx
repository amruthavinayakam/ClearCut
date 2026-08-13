import { useRef, useState } from "react";

import { api } from "../../api/client";
import Dialog from "../../components/Dialog";
import StatusMark from "../../components/StatusMark";
import type { Actor, ClearanceItem, IntendedUseProfile, WorkflowStatus } from "../../types";
import { CATEGORY_LABEL, STATUS_LABEL } from "../../types";
import DocumentSheet from "./DocumentSheet";
import EvidenceGraph, { evidenceNodes, type EvidenceNode } from "./EvidenceGraph";
import SourceLedger from "./SourceLedger";


interface Props {
  projectId: string;
  item: ClearanceItem;
  useProfile: IntendedUseProfile;
  onChanged: () => void;
}

interface Disposition {
  label: string;
  title: string;
  description: string;
  status: WorkflowStatus;
  actor: Actor;
}

const DISPOSITIONS: Disposition[] = [
  {
    label: "Record verification",
    title: "Record coordinator verification",
    description: "This records that a coordinator reviewed the research. It is not counsel approval or documented permission.",
    status: "coordinator_verified",
    actor: "coordinator",
  },
  {
    label: "Record permission",
    title: "Record documented permission",
    description: "This changes the case to documented permission and links the production records you select below.",
    status: "documented_permission",
    actor: "coordinator",
  },
  {
    label: "Waiting on holder",
    title: "Mark waiting on rights holder",
    description: "This keeps the case open and records that outreach is awaiting a response.",
    status: "waiting_on_rights_holder",
    actor: "coordinator",
  },
  {
    label: "Request replacement",
    title: "Request a replacement",
    description: "This records a production change request. A replacement must be reviewed separately after it arrives.",
    status: "replacement_requested",
    actor: "coordinator",
  },
  {
    label: "Approve replacement",
    title: "Approve the reviewed replacement",
    description: "This resolves the case through a human-reviewed replacement, not through permission for the original element.",
    status: "approved_replacement",
    actor: "coordinator",
  },
  {
    label: "Dismiss detection",
    title: "Dismiss as a false positive",
    description: "This removes the detection from active clearance work while preserving the evidence and audit history.",
    status: "false_positive",
    actor: "coordinator",
  },
  {
    label: "Counsel approval",
    title: "Record counsel approval",
    description: "Only production counsel should record this disposition. The action and rationale become part of the audit trail.",
    status: "counsel_approved",
    actor: "counsel",
  },
];

export default function EvidenceInspector({ projectId, item, useProfile, onChanged }: Props) {
  const nodes = evidenceNodes(item);
  const [selected, setSelected] = useState<EvidenceNode>(nodes[0]);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [disposition, setDisposition] = useState<Disposition | null>(null);
  const [rationale, setRationale] = useState("");
  const [actorName, setActorName] = useState("");
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [assignedTo, setAssignedTo] = useState(item.assigned_to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ledgerTrigger = useRef<HTMLButtonElement | null>(null);
  const documentTrigger = useRef<HTMLButtonElement | null>(null);
  const dispositionTrigger = useRef<HTMLButtonElement | null>(null);

  function selectNode(node: EvidenceNode) {
    setSelected(node);
    if (node.kind === "sources") setLedgerOpen(true);
  }

  function openDisposition(next: Disposition, trigger: HTMLButtonElement) {
    dispositionTrigger.current = trigger;
    setDisposition(next);
    setRationale("");
    setActorName("");
    setDocumentIds([]);
    setError("");
  }

  async function recordDisposition(event: React.FormEvent) {
    event.preventDefault();
    if (!disposition || !rationale.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.setStatus(
        projectId,
        item.id,
        disposition.status,
        disposition.actor,
        rationale.trim(),
        actorName.trim(),
        documentIds,
      );
      setDisposition(null);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The disposition could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.updateCoordination(projectId, item.id, assignedTo);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The assignment could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="evidence-inspector" aria-label={`Evidence for ${item.name}`}>
      <header>
        <div>
          <p className="eyebrow">{CATEGORY_LABEL[item.category] ?? item.category}</p>
          <h2>{item.name}</h2>
        </div>
        <StatusMark label={STATUS_LABEL[item.workflow_status]} tone={item.color} />
      </header>
      <EvidenceGraph
        item={item}
        selectedNodeId={selected.id}
        onSelectNode={(node) => {
          if (node.kind === "sources") ledgerTrigger.current = document.activeElement as HTMLButtonElement;
          selectNode(node);
        }}
      />
      <section className="evidence-node-detail" aria-live="polite">
        <p className="eyebrow">Selected relationship</p>
        <h3>{selected.label}</h3>
        <div>{selected.detail}</div>
      </section>

      <section className="case-coordination" aria-label="Case coordination">
        <div className="coordination-head">
          <p className="eyebrow">Human record</p>
          <button
            ref={documentTrigger}
            className="text-action"
            type="button"
            onClick={() => setDocumentsOpen(true)}
          >
            Documents · {item.documents.length}
          </button>
        </div>
        <form className="assignment-form" onSubmit={saveAssignment}>
          <label>
            Assigned to
            <input value={assignedTo} maxLength={80} onChange={(event) => setAssignedTo(event.target.value)} placeholder="Coordinator or counsel" />
          </label>
          <button type="submit" className="text-action" disabled={busy || assignedTo === item.assigned_to}>Save</button>
        </form>
        <div className="disposition-actions">
          {DISPOSITIONS.map((action) => (
            <button
              key={action.status}
              type="button"
              onClick={(event) => openDisposition(action, event.currentTarget)}
            >
              {action.label}
            </button>
          ))}
        </div>
        {error && !disposition ? <p className="form-error" role="alert">{error}</p> : null}
      </section>
      <p className="human-boundary">Research only. A human records every legal disposition.</p>
      <SourceLedger
        item={item}
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        returnFocusRef={ledgerTrigger}
      />
      <DocumentSheet
        open={documentsOpen}
        projectId={projectId}
        item={item}
        useProfile={useProfile}
        onClose={() => setDocumentsOpen(false)}
        onChanged={onChanged}
        returnFocusRef={documentTrigger}
      />
      <Dialog
        open={Boolean(disposition)}
        title={disposition?.title ?? "Record disposition"}
        description={disposition?.description}
        onClose={() => setDisposition(null)}
        returnFocusRef={dispositionTrigger}
      >
        <form className="disposition-form" onSubmit={recordDisposition}>
          {disposition?.status === "documented_permission" ? (
            <fieldset>
              <legend>Supporting production documents</legend>
              {!item.documents.length ? <p>Attach a document before recording permission.</p> : null}
              {item.documents.map((document) => (
                <label className="check-line" key={document.id}>
                  <input
                    type="checkbox"
                    checked={documentIds.includes(document.id)}
                    onChange={(event) => setDocumentIds((current) => event.target.checked
                      ? [...current, document.id]
                      : current.filter((id) => id !== document.id))}
                  />
                  {document.title}
                </label>
              ))}
            </fieldset>
          ) : null}
          <label>
            Recorded by
            <input value={actorName} onChange={(event) => setActorName(event.target.value)} placeholder={disposition?.actor === "counsel" ? "Counsel name" : "Name"} />
          </label>
          <label>
            Rationale
            <textarea required rows={4} value={rationale} onChange={(event) => setRationale(event.target.value)} />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <button type="button" className="button button--quiet" onClick={() => setDisposition(null)}>Cancel</button>
            <button
              type="submit"
              className="button button--primary"
              disabled={busy || !rationale.trim() || (disposition?.status === "documented_permission" && !documentIds.length)}
            >
              {busy ? "Recording…" : "Record disposition"}
            </button>
          </div>
        </form>
      </Dialog>
    </aside>
  );
}
