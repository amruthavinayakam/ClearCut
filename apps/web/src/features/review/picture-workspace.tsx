import type { ClearanceItem, Project } from "@clearcut/contracts";
import { Film } from "lucide-react";
import { useEffect, useRef } from "react";

import { Timeline } from "./timeline";

export function PictureWorkspace({ project, selected, onSelect }: { project: Project; selected: ClearanceItem | null; onSelect: (id: string) => void }) {
  const detection = selected?.cut_detections[0];
  const videoRef = useRef<HTMLVideoElement>(null);
  const seek = (seconds: number) => {
    if (!videoRef.current) return;
    try {
      videoRef.current.currentTime = seconds;
    } catch {
      // Metadata loading will retry the seek through onLoadedMetadata.
    }
  };

  useEffect(() => {
    if (detection) seek(detection.representative_time);
  }, [detection]);

  const selectAtTime = (id: string, representativeTime: number) => {
    seek(representativeTime);
    onSelect(id);
  };

  return (
    <section className="flex min-h-[420px] min-w-0 flex-col bg-media" data-selected-case={selected?.id ?? ""} data-testid="media-canvas">
      <div className="flex h-10 items-center justify-between border-b border-white/10 px-3 text-white/60"><span className="font-mono text-[9px] tracking-[0.08em]">PICTURE / {project.cut?.label ?? "NO CUT"}</span>{detection && <span className="font-mono text-[9px]">{detection.timecode.start.toFixed(1)}–{detection.timecode.end.toFixed(1)}s</span>}</div>
      <div className="relative grid flex-1 place-items-center overflow-hidden bg-[#111214]">
        {project.cut ? <video className="max-h-[58dvh] w-full object-contain" controls key={project.cut.id} onLoadedMetadata={() => detection && seek(detection.representative_time)} preload="metadata" ref={videoRef} src={`/api/projects/${project.id}/cut`} /> : <div className="text-center text-white/50"><Film className="mx-auto size-5" /><p className="mt-2 text-xs">No rough cut uploaded</p></div>}
        {selected && <div className="pointer-events-none absolute left-3 top-3 border border-white/15 bg-black/70 px-2 py-1 font-mono text-[9px] text-white/70">{selected.name.toUpperCase()} / {selected.color.toUpperCase()}</div>}
      </div>
      <Timeline duration={project.cut?.duration_s ?? 0} items={project.items} onSelect={selectAtTime} selectedId={selected?.id ?? null} />
    </section>
  );
}
