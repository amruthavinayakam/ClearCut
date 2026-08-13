import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../api/client";
import { followInternalLink } from "../../app/router";
import Dialog from "../../components/Dialog";
import type { Project, ProjectRevision } from "../../types";
import VersionRipple from "./VersionRipple";


interface Props {
  projectId: string;
  revisionId: string;
}

export default function RevisionCompare({ projectId, revisionId }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [revision, setRevision] = useState<ProjectRevision | null>(null);
  const [previous, setPrevious] = useState<ProjectRevision | null>(null);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const applyTrigger = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const [nextProject, nextRevision] = await Promise.all([
        api.getProject(projectId),
        api.getRevision(projectId, revisionId),
      ]);
      const predecessor = nextRevision.predecessor_id
        ? await api.getRevision(projectId, nextRevision.predecessor_id)
        : null;
      setProject(nextProject);
      setRevision(nextRevision);
      setPrevious(predecessor);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The comparison could not be loaded.");
    }
  }, [projectId, revisionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (revision?.state !== "processing") return;
    const timer = window.setInterval(() => void load(), 1800);
    return () => window.clearInterval(timer);
  }, [load, revision?.state]);

  async function apply() {
    if (!revision) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.applyRevision(projectId, revision.id, revision.predecessor_id);
      setProject(result.project);
      setRevision(result.revision);
      setConfirmOpen(false);
    } catch (reason) {
      setConfirmOpen(false);
      setError(reason instanceof Error ? reason.message : "The revision could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !revision) {
    return (
      <main className="revision-state">
        <p className="eyebrow">Comparison unavailable</p>
        <h1>The active revision has not changed.</h1>
        <p role="alert">{error}</p>
        <button className="button" type="button" onClick={() => void load()}>Retry</button>
      </main>
    );
  }
  if (!revision || !project) {
    return <main className="revision-state" aria-busy="true"><p className="eyebrow">Opening comparison</p><h1>Reading both production states.</h1></main>;
  }

  const reopened = revision.changes.filter((change) =>
    change.kind === "materially_changed" || change.kind === "decision_stale"
  ).length;

  return (
    <main className="revision-compare">
      <header className="revision-head">
        <div>
          <p className="eyebrow">Revision {revision.sequence}</p>
          <h1>{project.title}</h1>
          <p>{previous?.cut?.label ?? previous?.script?.label ?? "Previous record"} → {revision.cut?.label ?? revision.script?.label ?? "Candidate record"}</p>
        </div>
        <a href={`/projects/${project.id}`} onClick={(event) => followInternalLink(event, `/projects/${project.id}`)}>Active project</a>
      </header>

      {revision.state === "processing" ? (
        <section className="revision-processing" aria-live="polite" aria-busy="true">
          <span className="analysis-pulse" aria-hidden="true" />
          <div><p className="eyebrow">Comparison running</p><h2>Scanning the candidate as a separate production state.</h2><p>The current cases and decisions remain available and unchanged.</p></div>
        </section>
      ) : null}

      {revision.state === "failed" ? (
        <section className="revision-failed">
          <p className="eyebrow">Comparison stopped</p>
          <h2>The active revision is still intact.</h2>
          <p>{revision.error}</p>
          <a className="button" href={`/projects/${project.id}/revisions/new`} onClick={(event) => followInternalLink(event, `/projects/${project.id}/revisions/new`)}>Upload another revision</a>
        </section>
      ) : null}

      {(revision.state === "ready" || revision.state === "applied") && previous ? (
        <>
          <VersionRipple previous={previous} revision={revision} />
          <footer className="revision-apply">
            <div>
              <p className="eyebrow">{revision.state === "applied" ? "Applied" : "Candidate only"}</p>
              <strong>{reopened} case{reopened === 1 ? "" : "s"} will reopen when applied.</strong>
              <span>Removed elements remain in revision history. Unchanged evidence and human records carry forward.</span>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
            </div>
            {revision.state === "ready" ? (
              <button ref={applyTrigger} className="button button--primary" type="button" onClick={() => setConfirmOpen(true)}>Apply revision</button>
            ) : (
              <a className="button button--primary" href={`/projects/${project.id}`} onClick={(event) => followInternalLink(event, `/projects/${project.id}`)}>Open active review</a>
            )}
          </footer>
        </>
      ) : null}

      <Dialog
        open={confirmOpen}
        title={`Apply revision ${revision.sequence}?`}
        description={`This promotes the comparison built from revision ${previous?.sequence ?? "—"} and reopens ${reopened} changed case${reopened === 1 ? "" : "s"}.`}
        onClose={() => setConfirmOpen(false)}
        returnFocusRef={applyTrigger}
      >
        <div className="dialog-actions">
          <button className="button button--quiet" type="button" onClick={() => setConfirmOpen(false)}>Keep current revision</button>
          <button className="button button--primary" type="button" disabled={busy} onClick={() => void apply()}>{busy ? "Applying…" : "Apply reviewed revision"}</button>
        </div>
      </Dialog>
    </main>
  );
}
