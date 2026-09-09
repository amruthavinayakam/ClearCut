import type { ClearanceItem, Project } from "@clearcut/contracts";
import { Film } from "lucide-react";
import { useMemo } from "react";

import { VideoPlayer, type PictureMarker } from "./video-player";

export function PictureWorkspace({ project, selected, onSelect }: { project: Project; selected: ClearanceItem | null; onSelect: (id: string) => void }) {
  const detection = selected?.cut_detections[0];

  // One marker per case, on the first place it appears in the picture.
  const markers = useMemo<PictureMarker[]>(
    () => project.items.flatMap((item) =>
      item.cut_detections.slice(0, 1).map((cut) => ({ item, time: cut.representative_time }))),
    [project.items],
  );

  return (
    <section
      // min-h-0 lets this column be bounded by the page rather than by the
      // video's natural height, which is what made it overrun.
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-media"
      data-selected-case={selected?.id ?? ""}
      data-testid="media-canvas"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 px-3 text-white/60">
        <span className="font-mono text-[9px] tracking-[0.08em]">PICTURE / {project.cut?.label ?? "NO CUT"}</span>
        {detection && <span className="font-mono text-[9px]">{detection.timecode.start.toFixed(1)}–{detection.timecode.end.toFixed(1)}s</span>}
      </div>

      {project.cut ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <VideoPlayer
            duration={project.cut.duration_s ?? 0}
            key={project.cut.id}
            markers={markers}
            onSelectMarker={(id) => onSelect(id)}
            seekTo={detection?.representative_time ?? null}
            selectedId={selected?.id ?? null}
            src={`/api/projects/${project.id}/cut`}
          />
          {selected && (
            <div className="pointer-events-none absolute left-3 top-3 border border-white/15 bg-black/70 px-2 py-1 font-mono text-[9px] text-white/70">
              {selected.name.toUpperCase()} / {selected.color.toUpperCase()}
            </div>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center text-center text-white/50">
          <div>
            <Film className="mx-auto size-5" />
            <p className="mt-2 text-xs">No rough cut uploaded</p>
          </div>
        </div>
      )}
    </section>
  );
}
