import { useEffect, useRef, useState } from "react";

import { api } from "../../api/client";
import Dialog from "../../components/Dialog";
import Drawer from "../../components/Drawer";
import type { ClearanceItem, IntendedUseProfile, ProductionDocument, ScopeAssessment as Assessment } from "../../types";
import ScopeAssessment, { assessDocumentScope } from "./ScopeAssessment";


interface Props {
  open: boolean;
  projectId: string;
  item: ClearanceItem;
  useProfile: IntendedUseProfile;
  onClose: () => void;
  onChanged: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

const EMPTY_META = {
  kind: "license",
  title: "",
  notes: "",
  media: "",
  territories: "",
  starts_on: "",
  ends_on: "",
  perpetual: false,
  covered_use: "",
  attached_by: "",
};

export default function DocumentSheet({
  open,
  projectId,
  item,
  useProfile,
  onClose,
  onChanged,
  returnFocusRef,
}: Props) {
  const [documents, setDocuments] = useState(item.documents);
  const [assessments, setAssessments] = useState<Record<string, Assessment>>({});
  const [metadata, setMetadata] = useState(EMPTY_META);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remove, setRemove] = useState<ProductionDocument | null>(null);
  const removeTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => setDocuments(item.documents), [item.documents]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.attachDocument(projectId, item.id, file, metadata);
      setDocuments((current) => [...current, result.document]);
      setAssessments((current) => ({ ...current, [result.document.id]: result.scope }));
      setFile(null);
      setMetadata(EMPTY_META);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The document could not be attached.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!remove) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteDocument(projectId, item.id, remove.id);
      setDocuments((current) => current.filter((document) => document.id !== remove.id));
      setRemove(null);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The document could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Drawer
        open={open}
        title={`Documents · ${item.name}`}
        onClose={onClose}
        returnFocusRef={returnFocusRef}
      >
        <p className="sheet-intro">
          Attach the actual production record, then record only the scope visible in that record.
        </p>
        <form className="document-form" onSubmit={submit} noValidate>
          <label>
            Document file
            <input
              type="file"
              required
              onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <div className="form-pair">
            <label>
              Type
              <select value={metadata.kind} onChange={(event) => setMetadata({ ...metadata, kind: event.target.value })}>
                <option value="license">License</option>
                <option value="release">Release</option>
                <option value="permit">Permit</option>
                <option value="correspondence">Correspondence</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Title
              <input required value={metadata.title} onChange={(event) => setMetadata({ ...metadata, title: event.target.value })} />
            </label>
          </div>
          <div className="form-pair">
            <label>
              Recorded media
              <input placeholder="theatrical, streaming" value={metadata.media} onChange={(event) => setMetadata({ ...metadata, media: event.target.value })} />
            </label>
            <label>
              Recorded territories
              <input placeholder="US, CA" value={metadata.territories} onChange={(event) => setMetadata({ ...metadata, territories: event.target.value })} />
            </label>
          </div>
          <div className="form-pair">
            <label>
              Term begins
              <input type="date" value={metadata.starts_on} onChange={(event) => setMetadata({ ...metadata, starts_on: event.target.value })} />
            </label>
            <label>
              Term ends
              <input type="date" disabled={metadata.perpetual} value={metadata.ends_on} onChange={(event) => setMetadata({ ...metadata, ends_on: event.target.value })} />
            </label>
          </div>
          <label className="check-line">
            <input type="checkbox" checked={metadata.perpetual} onChange={(event) => setMetadata({ ...metadata, perpetual: event.target.checked, ends_on: event.target.checked ? "" : metadata.ends_on })} />
            Perpetual term is stated
          </label>
          <label>
            Covered use
            <input value={metadata.covered_use} onChange={(event) => setMetadata({ ...metadata, covered_use: event.target.value })} />
          </label>
          <label>
            Attached by
            <input value={metadata.attached_by} onChange={(event) => setMetadata({ ...metadata, attached_by: event.target.value })} />
          </label>
          <label>
            Notes
            <textarea rows={3} value={metadata.notes} onChange={(event) => setMetadata({ ...metadata, notes: event.target.value })} />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button--primary" type="submit" disabled={busy || !file}>
            {busy ? "Attaching…" : "Attach document"}
          </button>
        </form>

        <section className="document-list" aria-label="Attached documents">
          <p className="eyebrow">Recorded evidence · {documents.length}</p>
          {!documents.length ? <p>No production documents attached.</p> : null}
          {documents.map((document) => (
            <article key={document.id}>
              <header>
                <div>
                  <strong>{document.title}</strong>
                  <span>{document.kind} · {document.original_filename || "metadata only"}</span>
                </div>
                <div className="document-actions">
                  {document.storage_key ? <a href={api.documentUrl(projectId, item.id, document.id)}>Download</a> : null}
                  <button ref={removeTrigger} type="button" onClick={() => setRemove(document)}>Remove</button>
                </div>
              </header>
              <ScopeAssessment assessment={assessments[document.id] ?? assessDocumentScope(useProfile, document)} />
            </article>
          ))}
        </section>
      </Drawer>
      <Dialog
        open={Boolean(remove)}
        title="Remove this production document?"
        description="The file and its recorded scope will be removed from this case. The audit event remains."
        onClose={() => setRemove(null)}
        returnFocusRef={removeTrigger}
      >
        <div className="dialog-actions">
          <button type="button" className="button button--quiet" onClick={() => setRemove(null)}>Keep document</button>
          <button type="button" className="button" disabled={busy} onClick={confirmRemove}>Remove document</button>
        </div>
      </Dialog>
    </>
  );
}
