import { useRef, useState } from "react";

import { api, type PreflightResult } from "../../api/client";
import type { Project } from "../../types";
import FileField from "./FileField";


interface Props {
  onCreated: (project: Project) => void;
}

interface FileState {
  file: File | null;
  result: PreflightResult | null;
  checking: boolean;
}

const EMPTY_FILE: FileState = { file: null, result: null, checking: false };

export default function NewProject({ onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState<FileState>(EMPTY_FILE);
  const [cut, setCut] = useState<FileState>(EMPTY_FILE);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    (kind === "screenplay" ? setScript : setCut)(EMPTY_FILE);
  }

  const acceptedScript = script.result?.accepted ? script.file : null;
  const acceptedCut = cut.result?.accepted ? cut.file : null;
  const canSubmit = Boolean(acceptedScript || acceptedCut) && !busy && !script.checking && !cut.checking;

  let summary = "Add a screenplay, a rough cut, or both to begin.";
  if (acceptedScript && acceptedCut) {
    summary = "The screenplay and rough cut will be analyzed and reconciled against each other.";
  } else if (acceptedScript) {
    summary = "The screenplay will be analyzed without picture evidence from a rough cut.";
  } else if (acceptedCut) {
    summary = "The rough cut will be analyzed without screenplay context.";
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const project = await api.createProject(
        acceptedScript,
        acceptedCut,
        title.trim() || "Untitled production",
        setProgress,
      );
      onCreated(project);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <main className="intake">
      <header className="intake__head">
        <p className="eyebrow">New clearance scan</p>
        <h1>Bring the page and the screen together.</h1>
        <p>Either asset can begin a project. Together, they reveal what changed in production.</p>
      </header>

      <section className="intake-step" aria-labelledby="production-title-label">
        <span className="intake-step__number">01</span>
        <div>
          <label id="production-title-label" htmlFor="production-title">Production title</label>
          <input
            id="production-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Untitled production"
            disabled={busy}
          />
        </div>
      </section>

      <section className="intake-step">
        <span className="intake-step__number">02</span>
        <FileField
          kind="screenplay"
          label="Screenplay"
          hint="PDF, Fountain, FDX, Markdown, or plain text"
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
        <span className="intake-step__number">03</span>
        <FileField
          kind="cut"
          label="Rough cut"
          hint="MP4, MOV, M4V, or WebM"
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
        <p>{summary}</p>
        {progress !== null && progress > 0 && progress < 1 && (
          <p className="intake__progress" role="status">
            Uploading {Math.round(progress * 100)}%
          </p>
        )}
        {error && <p className="intake__error" role="alert">{error}</p>}
        <button
          className="button button--primary"
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {busy ? "Uploading production…" : "Start clearance analysis"}
        </button>
      </footer>
    </main>
  );
}
