import { useRef, useState } from "react";

import { api, type PreflightResult } from "../../api/client";
import type { Project, ProjectRevision } from "../../types";
import FileField from "../projects/FileField";


interface Props {
  project: Project;
  onCreated: (revision: ProjectRevision) => void;
}

interface FileState {
  file: File | null;
  result: PreflightResult | null;
  checking: boolean;
}

const EMPTY: FileState = { file: null, result: null, checking: false };

export default function NewRevision({ project, onCreated }: Props) {
  const [script, setScript] = useState<FileState>(EMPTY);
  const [cut, setCut] = useState<FileState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef({ screenplay: 0, cut: 0 });

  async function inspect(kind: "screenplay" | "cut", file: File) {
    const request = ++sequence.current[kind];
    const update = kind === "screenplay" ? setScript : setCut;
    update({ file, result: null, checking: true });
    try {
      const result = await api.preflight(file);
      if (sequence.current[kind] === request) update({ file, result, checking: false });
    } catch (reason) {
      if (sequence.current[kind] !== request) return;
      update({
        file,
        checking: false,
        result: {
          kind,
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          accepted: false,
          details: {},
          errors: [{ code: "preflight_failed", message: (reason as Error).message }],
        },
      });
    }
  }

  function remove(kind: "screenplay" | "cut") {
    sequence.current[kind] += 1;
    (kind === "screenplay" ? setScript : setCut)(EMPTY);
  }

  const nextScript = script.result?.accepted ? script.file : null;
  const nextCut = cut.result?.accepted ? cut.file : null;
  const canSubmit = Boolean(nextScript || nextCut) && !busy && !script.checking && !cut.checking;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      onCreated(await api.createRevision(project.id, nextScript, nextCut));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The revision could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="revision-intake">
      <header className="revision-head">
        <div>
          <p className="eyebrow">Production revision</p>
          <h1>Compare the next cut without disturbing the current record.</h1>
          <p>{project.title}</p>
        </div>
        <a href={`/projects/${project.id}`}>Cancel</a>
      </header>

      <section className="revision-baseline" aria-label="Current active revision">
        <p className="eyebrow">Current</p>
        <div><span>Screenplay</span><strong>{project.script?.label ?? "None"}</strong></div>
        <div><span>Cut</span><strong>{project.cut?.label ?? "None"}</strong></div>
        <small>The active cases and human dispositions stay untouched while comparison runs.</small>
      </section>

      <section className="intake-step">
        <span className="intake-step__number">01</span>
        <FileField
          kind="screenplay"
          label="Revised screenplay"
          hint={project.script ? `Leave empty to retain ${project.script.label}` : "PDF, Fountain, FDX, Markdown, or plain text"}
          accept=".pdf,.txt,.fountain,.fdx,.md"
          file={script.file}
          result={script.result}
          checking={script.checking}
          disabled={busy}
          onFile={(file) => void inspect("screenplay", file)}
          onRemove={() => remove("screenplay")}
        />
      </section>
      <section className="intake-step">
        <span className="intake-step__number">02</span>
        <FileField
          kind="cut"
          label="Revised rough cut"
          hint={project.cut ? `Leave empty to retain ${project.cut.label}` : "MP4, MOV, M4V, or WebM"}
          accept="video/mp4,video/quicktime,video/webm,.m4v"
          file={cut.file}
          result={cut.result}
          checking={cut.checking}
          disabled={busy}
          onFile={(file) => void inspect("cut", file)}
          onRemove={() => remove("cut")}
        />
      </section>

      <footer className="intake__submit">
        <p>
          {nextScript ? "New screenplay" : project.script ? `Retain ${project.script.label}` : "No screenplay"} · {" "}
          {nextCut ? "new cut" : project.cut ? `retain ${project.cut.label}` : "no cut"}
        </p>
        {error ? <p className="intake__error" role="alert">{error}</p> : null}
        <button className="button button--primary" type="button" disabled={!canSubmit} onClick={() => void submit()}>
          {busy ? "Uploading revision…" : "Build comparison"}
        </button>
      </footer>
    </main>
  );
}
