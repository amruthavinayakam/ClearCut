import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api";
import type { ClearanceItem, Project } from "../types";
import { formatTimecode } from "../types";

interface Props {
  project: Project;
  selectedId: string | null;
  onSelect: (itemId: string) => void;
  /** Populated with a seek function so siblings can scrub the player. */
  seekRef?: React.MutableRefObject<(seconds: number) => void>;
}

interface Marker {
  item: ClearanceItem;
  start: number;
  end: number;
  lane: number;
}

/** Pack overlapping markers into lanes so nothing is hidden behind anything. */
function layout(items: ClearanceItem[]): { markers: Marker[]; lanes: number } {
  const flat: Omit<Marker, "lane">[] = [];
  for (const item of items) {
    for (const detection of item.cut_detections) {
      flat.push({ item, start: detection.timecode.start, end: detection.timecode.end });
    }
  }
  flat.sort((a, b) => a.start - b.start);

  const laneEnds: number[] = [];
  const markers: Marker[] = flat.map((entry) => {
    let lane = laneEnds.findIndex((end) => entry.start >= end - 0.01);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = entry.end;
    return { ...entry, lane };
  });

  return { markers, lanes: Math.max(1, laneEnds.length) };
}

export default function Heatmap({ project, selectedId, onSelect, seekRef }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);

  const duration = project.cut?.duration_s || 0;
  const { markers, lanes } = useMemo(() => layout(project.items), [project.items]);

  // Keep the playhead in sync without re-rendering on every frame.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => setTime(video.currentTime);
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, [project.cut?.media_url]);

  function seek(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(seconds, duration || video.duration || 0));
    void video.play().catch(() => undefined);
  }

  useEffect(() => {
    if (seekRef) seekRef.current = seek;
  });

  function seekFromClick(event: React.MouseEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track || !duration) return;
    const bounds = track.getBoundingClientRect();
    seek(((event.clientX - bounds.left) / bounds.width) * duration);
  }

  const ticks = useMemo(() => {
    if (!duration) return [];
    const step = duration <= 60 ? 10 : Math.ceil(duration / 6 / 10) * 10;
    const values: number[] = [];
    for (let t = 0; t <= duration; t += step) values.push(t);
    return values;
  }, [duration]);

  const laneHeight = 13;
  const trackHeight = Math.max(46, lanes * (laneHeight + 3) + 6);

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Rights heatmap</span>
        <span className="plain">
          {project.cut ? `${project.cut.label} · ${duration.toFixed(0)}s` : "no cut uploaded"}
        </span>
      </div>

      <div className="player-wrap">
        {project.cut ? (
          <video ref={videoRef} src={api.cutUrl(project.id)} controls preload="metadata" />
        ) : (
          <div className="no-cut">
            No rough cut for this project. Upload one to see timecoded detections — the
            unscripted elements only show up here.
          </div>
        )}
      </div>

      {project.cut && (
        <div className="heatmap">
          <div className="heatmap-scale">
            {ticks.map((tick) => (
              <span key={tick} style={{ left: `${(tick / duration) * 100}%` }}>
                {formatTimecode(tick).slice(0, 5)}
              </span>
            ))}
          </div>

          <div
            className="heatmap-track"
            ref={trackRef}
            style={{ height: trackHeight }}
            onClick={seekFromClick}
          >
            {markers.map((marker, index) => {
              const left = (marker.start / duration) * 100;
              const width = Math.max(0.9, ((marker.end - marker.start) / duration) * 100);
              const unresolved = marker.item.color === "red";
              return (
                <div
                  key={`${marker.item.id}-${index}`}
                  className={`heat-marker ${marker.item.color}${
                    selectedId === marker.item.id ? " selected" : ""
                  }${unresolved ? " pulsing" : ""}`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    top: 4 + marker.lane * (laneHeight + 3),
                    height: laneHeight,
                  }}
                  title={`${marker.item.name} — ${formatTimecode(marker.start)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(marker.item.id);
                    seek(marker.start + 0.15);
                  }}
                />
              );
            })}
            {duration > 0 && (
              <div className="heatmap-playhead" style={{ left: `${(time / duration) * 100}%` }} />
            )}
          </div>

          <div className="heatmap-legend">
            <span className="key">
              <i className="dot" style={{ background: "var(--red)" }} /> Unresolved
            </span>
            <span className="key">
              <i className="dot" style={{ background: "var(--amber)" }} /> Evidence incomplete
            </span>
            <span className="key">
              <i className="dot" style={{ background: "var(--blue)" }} /> Coordinator verified
            </span>
            <span className="key">
              <i className="dot" style={{ background: "var(--green)" }} /> Documented
            </span>
            <span className="key">
              <i className="dot" style={{ background: "var(--gray)" }} /> Dismissed
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
