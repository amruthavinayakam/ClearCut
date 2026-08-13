import { useEffect, useRef } from "react";

import { api } from "../../api/client";
import type { ClearanceItem, Project } from "../../types";
import { formatTimecode } from "../../types";


interface Props {
  project: Project;
  selectedId: string | null;
  seekTime: number | null;
  onSelect: (item: ClearanceItem) => void;
}

export default function PictureWorkspace({ project, selectedId, seekTime, onSelect }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const duration = project.cut?.duration_s ?? 0;

  useEffect(() => {
    if (seekTime === null || !video.current) return;
    video.current.currentTime = seekTime;
  }, [seekTime]);

  return (
    <section className="picture-workspace" aria-label="Picture and clearance timeline">
      {project.cut ? (
        <video ref={video} src={api.cutUrl(project.id)} controls preload="metadata" />
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
