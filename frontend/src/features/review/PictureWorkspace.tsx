import { useEffect, useRef } from "react";

import { api } from "../../api/client";
import type { ClearanceItem, Project } from "../../types";
import { formatTimecode } from "../../types";


interface Props {
  project: Project;
  selectedId: string | null;
  seekTime: number | null;
  onSelect: (item: ClearanceItem) => void;
  initialPosition?: number;
  onPosition?: (position: number) => void;
}

export default function PictureWorkspace({ project, selectedId, seekTime, onSelect, initialPosition = 0, onPosition }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const lastPosition = useRef(-1);
  const duration = project.cut?.duration_s ?? 0;

  useEffect(() => {
    if (seekTime === null || !video.current) return;
    video.current.currentTime = seekTime;
  }, [seekTime]);

  return (
    <section className="picture-workspace" aria-label="Picture and clearance timeline">
      {project.cut ? (
        <video
          ref={video}
          src={api.cutUrl(project.id)}
          controls
          preload="metadata"
          onLoadedMetadata={() => {
            if (video.current && seekTime === null) video.current.currentTime = Math.min(initialPosition, video.current.duration || initialPosition);
          }}
          onTimeUpdate={() => {
            if (!video.current || !onPosition) return;
            const second = Math.floor(video.current.currentTime);
            if (second === lastPosition.current) return;
            lastPosition.current = second;
            onPosition(video.current.currentTime);
          }}
        />
      ) : (
        <div className="picture-workspace__script">
          <p className="eyebrow">{project.script?.label ?? "Screenplay"}</p>
          <h2>{project.script?.title || project.title}</h2>
          <p>Picture has not been supplied for this project.</p>
        </div>
      )}
      {project.cut && (
        <div className="review-timeline">
          <div className="review-timeline__track">
            {project.items.flatMap((item) =>
              item.cut_detections.map((detection, index) => (
                <button
                  key={`${item.id}-${index}`}
                  type="button"
                  className={`review-marker review-marker--${item.color}`}
                  aria-label={`${item.name} at ${formatTimecode(detection.timecode.start)}`}
                  aria-pressed={selectedId === item.id}
                  style={{ left: `${(detection.timecode.start / Math.max(1, duration)) * 100}%` }}
                  onClick={() => onSelect(item)}
                />
              )),
            )}
          </div>
          <div className="review-timeline__scale" aria-hidden="true">
            <span>00:00</span>
            <span>{formatTimecode(duration)}</span>
          </div>
        </div>
      )}
    </section>
  );
}
