import { useEffect, useMemo, useState } from "react";

import type { ClearanceItem, ProjectRevision, RevisionChange, RevisionChangeKind } from "../../types";


interface Props {
  previous: ProjectRevision;
  revision: ProjectRevision;
}

const LABEL: Record<RevisionChangeKind, string> = {
  unchanged: "Unchanged",
  added: "New",
  removed: "Removed",
  materially_changed: "Changed",
  decision_stale: "Reopened",
};

function at(item: ClearanceItem | undefined): number | null {
  return item?.cut_detections[0]?.timecode.start ?? null;
}

function humanStatus(status: string | null): string {
  if (!status) return "None";
  return status.split("_").join(" ").replace(/^./, (value: string) => value.toUpperCase());
}

export default function VersionRipple({ previous, revision }: Props) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const [settled, setSettled] = useState(reduced);
  const previousItems = useMemo(
    () => new Map(previous.items.map((item) => [item.id, item])),
    [previous.items],
  );
  const candidateItems = useMemo(
    () => new Map(revision.items.map((item) => [item.id, item])),
    [revision.items],
  );
  const duration = Math.max(previous.cut?.duration_s ?? 0, revision.cut?.duration_s ?? 0, 1);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => setSettled(true), 520);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  function marker(change: RevisionChange, track: "before" | "after") {
    const item = track === "before"
      ? previousItems.get(change.before_item_id ?? "")
      : candidateItems.get(change.after_item_id ?? "");
    const time = at(item);
    if (time === null) return null;
    const label = `${LABEL[change.kind]} · ${change.item_name}`;
    return (
      <button
        key={`${track}-${change.stable_item_id}`}
        type="button"
        className={`ripple-signal ripple-signal--${change.kind}`}
        style={{ left: `${Math.min(100, Math.max(0, time / duration * 100))}%` }}
        aria-label={`${label} at ${Math.round(time)} seconds`}
        data-change={change.kind}
        title={`${label} · ${time.toFixed(1)}s`}
      />
    );
  }

  return (
    <section className="version-ripple" aria-label="Version Ripple" data-settled={settled}>
      <header>
        <div>
          <p className="eyebrow">Version Ripple</p>
          <h2>What moved between cuts.</h2>
        </div>
        <span>{revision.changes.filter((change) => change.kind !== "unchanged").length} changes</span>
      </header>
      <div className="ripple-tracks">
        <div className="ripple-track">
          <span>{previous.cut?.label ?? previous.script?.label ?? `Revision ${previous.sequence}`}</span>
          <div>{revision.changes.map((change) => change.before_item_id ? marker(change, "before") : null)}</div>
        </div>
        <div className="ripple-track ripple-track--candidate">
          <span>{revision.cut?.label ?? revision.script?.label ?? `Revision ${revision.sequence}`}</span>
          <div>{revision.changes.map((change) => change.after_item_id ? marker(change, "after") : null)}</div>
        </div>
        <div className="ripple-scale"><span>0:00</span><span>{Math.round(duration)}s</span></div>
      </div>
      <ol className="ripple-changes">
        {revision.changes.map((change) => (
          <li key={`${change.kind}-${change.stable_item_id}`} data-change={change.kind}>
            <div>
              <strong>{LABEL[change.kind]} · {change.item_name}</strong>
              <span>{change.explanation}</span>
            </div>
            <div>
              {change.previous_status ? <span>Previous disposition: {humanStatus(change.previous_status)}</span> : null}
              <small>{change.match_basis}</small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
