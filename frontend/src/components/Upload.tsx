import { useRef, useState } from "react";

interface Props {
  busy: boolean;
  sampleAvailable: boolean;
  onSubmit: (script: File | null, cut: File | null, title: string) => void;
  onSample: () => void;
}

interface SlotProps {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled: boolean;
}

function Slot({ label, hint, accept, file, onFile, disabled }: SlotProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`dropzone${dragging ? " dragging" : ""}${file ? " filled" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const dropped = event.dataTransfer.files?.[0];
        if (dropped && !disabled) onFile(dropped);
      }}
    >
      <h3>{label}</h3>
      <p>{hint}</p>
      {file ? (
        <>
          <div className="filename">{file.name}</div>
          <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => onFile(null)}>
            Remove
          </button>
        </>
      ) : (
        <button
          className="btn small"
          style={{ marginTop: 10 }}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) onFile(chosen);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export default function Upload({ busy, sampleAvailable, onSubmit, onSample }: Props) {
  const [script, setScript] = useState<File | null>(null);
  const [cut, setCut] = useState<File | null>(null);
  const [title, setTitle] = useState("");

  return (
    <div className="card upload-card">
      <div className="drop-pair">
        <Slot
          label="Screenplay"
          hint="PDF, Fountain, or text"
          accept=".pdf,.txt,.fountain,.fdx,.md"
          file={script}
          onFile={setScript}
          disabled={busy}
        />
        <Slot
          label="Rough cut"
          hint="MP4 — 30 to 45 seconds works best"
          accept="video/mp4,video/quicktime"
          file={cut}
          onFile={setCut}
          disabled={busy}
        />
      </div>

      <input
        style={{
          width: "100%",
          marginTop: 14,
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          color: "var(--text)",
          padding: "9px 12px",
          font: "inherit",
          fontSize: 14,
        }}
        placeholder="Production title (optional)"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={busy}
      />

      <div className="row center" style={{ marginTop: 16 }}>
        <button
          className="btn primary"
          disabled={busy || (!script && !cut)}
          onClick={() => onSubmit(script, cut, title || "Untitled production")}
        >
          Run clearance scan
        </button>
        {sampleAvailable && (
          <button className="btn" disabled={busy} onClick={onSample}>
            Run the seeded demo
          </button>
        )}
      </div>

      <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 12.5, marginBottom: 0 }}>
        Upload both to see script-to-cut reconciliation — that is where unscripted
        elements surface.
      </p>
    </div>
  );
}
