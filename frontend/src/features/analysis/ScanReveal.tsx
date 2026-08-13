import { useEffect, useMemo, useState } from "react";

import type { ClearanceItem } from "../../types";
import { formatTimecode } from "../../types";
import { hasSeenReveal, markRevealSeen } from "../projects/project-preferences";


interface Signal {
  item: ClearanceItem;
  start: number;
  end: number;
}

interface Props {
  projectId: string;
  revisionKey: string;
  duration: number;
  items: ClearanceItem[];
  onSelect?: (itemId: string, time: number) => void;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

export default function ScanReveal({
  projectId,
  revisionKey,
  duration,
  items,
  onSelect,
}: Props) {
  const signals = useMemo<Signal[]>(
    () =>
      items
        .flatMap((item) =>
          item.cut_detections.map((detection) => ({
            item,
            start: detection.timecode.start,
            end: detection.timecode.end,
          })),
        )
        .sort((left, right) => left.start - right.start),
    [items],
  );
  const [staged, setStaged] = useState(
    () =>
      signals.length > 0 &&
      !prefersReducedMotion() &&
      !hasSeenReveal(projectId, revisionKey),
  );

  useEffect(() => {
    if (!staged) return;
    const timeout = window.setTimeout(
      () => {
        setStaged(false);
        markRevealSeen(projectId, revisionKey);
      },
      Math.min(900, 260 + signals.length * 55),
    );
    return () => window.clearTimeout(timeout);
  }, [projectId, revisionKey, signals.length, staged]);

  useEffect(() => {
    if (!staged) return;
    const settleFromWorkspace = () => {
      setStaged(false);
      markRevealSeen(projectId, revisionKey);
    };
    window.addEventListener("clearcut:settle-reveal", settleFromWorkspace);
    return () => window.removeEventListener("clearcut:settle-reveal", settleFromWorkspace);
  }, [projectId, revisionKey, staged]);

  function settle() {
    if (!staged) return;
    setStaged(false);
    markRevealSeen(projectId, revisionKey);
  }

  if (signals.length === 0) {
    return <p className="scan-reveal__empty">Cut signals will resolve here as detections arrive.</p>;
  }

  return (
    <div
      className={`scan-reveal${staged ? " scan-reveal--staged" : ""}`}
      onPointerDown={settle}
      onKeyDown={settle}
    >
      <div className="scan-reveal__track" aria-label="Cut detection timeline">
        {signals.map((signal, index) => (
          <button
            key={`${signal.item.id}-${signal.start}-${index}`}
            type="button"
            className={`scan-signal scan-signal--${signal.item.color}`}
            data-staged={staged ? "true" : "false"}
            aria-label={`${signal.item.name} at ${formatTimecode(signal.start)}`}
            title={`${signal.item.name} · ${formatTimecode(signal.start)}`}
            style={
              {
                left: `${Math.min(100, Math.max(0, (signal.start / Math.max(1, duration)) * 100))}%`,
                "--signal-delay": `${Math.min(index * 55, 440)}ms`,
              } as React.CSSProperties
            }
            onClick={() => {
              settle();
              onSelect?.(signal.item.id, signal.start);
            }}
          >
            <span className="sr-only">{signal.end - signal.start} second appearance</span>
          </button>
        ))}
      </div>
      <div className="scan-reveal__time" aria-hidden="true">
        <span>00:00</span>
        <span>{formatTimecode(duration)}</span>
      </div>
    </div>
  );
}
