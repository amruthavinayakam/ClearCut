import { useId, useState } from "react";

import type { PreflightResult } from "../../api/client";


interface Props {
  kind: "screenplay" | "cut";
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  result: PreflightResult | null;
  checking: boolean;
  disabled: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}

function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileField({
  kind,
  label,
  hint,
  accept,
  file,
  result,
  checking,
  disabled,
  onFile,
  onRemove,
}: Props) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const accepted = result?.accepted === true;

  return (
    <div
      className={`file-field${dragging ? " file-field--dragging" : ""}${
        result && !accepted ? " file-field--error" : ""
      }`}
      data-testid={`${kind}-dropzone`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const dropped = event.dataTransfer.files?.[0];
        if (dropped && !disabled) onFile(dropped);
      }}
    >
      <div className="file-field__copy">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>

      {!file ? (
        <label className="file-field__choose" htmlFor={id}>
          Choose {kind}
        </label>
      ) : (
        <div className="file-field__asset">
          <span className="file-field__name">{file.name}</span>
          <span>{fileSize(result?.size_bytes ?? file.size)}</span>
          <span>{result?.mime_type || file.type || "Type unknown"}</span>
          {checking && <span className="file-field__checking">Checking…</span>}
          {accepted && kind === "screenplay" && (
            <span>
              {String(result.details.page_count ?? "—")} pages · {String(result.details.scene_count ?? "—")} scenes · text readable
            </span>
          )}
          {accepted && kind === "cut" && (
            <span>{Number(result.details.duration_s ?? 0).toFixed(1)} seconds</span>
          )}
          {result?.errors.map((error) => (
            <span className="file-field__error" role="alert" key={error.code}>
              {error.message}
            </span>
          ))}
          <div className="file-field__actions">
            <label htmlFor={id}>Replace</label>
            <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}>
              Remove
            </button>
          </div>
        </div>
      )}

      <input
        className="sr-only"
        id={id}
        aria-label={`Choose ${kind}`}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) onFile(selected);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
