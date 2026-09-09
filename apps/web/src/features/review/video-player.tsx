"use client";

import type { ClearanceItem } from "@clearcut/contracts";
import { Maximize2, Pause, PictureInPicture2, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Picture viewer for a clearance review.
 *
 * The native control bar is deliberately off. With it on there were two
 * scrubbers stacked — the browser's and the risk timeline — telling the same
 * story about the same footage. Here the clearance markers sit *on* the
 * scrubber, so one track carries both position and risk.
 *
 * Overlay language follows grizzshutsdown/simpleplayer: translucent glass
 * controls over the picture, a hover fill previewing the seek target, and a
 * centre play affordance.
 */

function timecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

export type PictureMarker = {
  item: ClearanceItem;
  time: number;
};

export function VideoPlayer({
  src,
  poster,
  duration: declaredDuration,
  markers,
  selectedId,
  onSelectMarker,
  seekTo,
}: {
  src: string;
  poster?: string;
  duration: number;
  markers: PictureMarker[];
  selectedId: string | null;
  onSelectMarker: (id: string, time: number) => void;
  seekTo: number | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(declaredDuration);
  const [muted, setMuted] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const span = duration > 0 ? duration : declaredDuration;

  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = Math.max(0, span ? Math.min(seconds, span) : seconds);
      setCurrent(video.currentTime);
    } catch {
      // Seeking before metadata is ready throws; onLoadedMetadata retries.
    }
  }, [span]);

  // A case selected anywhere in the workspace drives the picture.
  useEffect(() => {
    if (seekTo !== null) seek(seekTo);
  }, [seekTo, seek]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }, []);

  // Space, Enter and K toggle playback while the picture has focus.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key === " " || key === "enter" || key === "k") {
      event.preventDefault();
      toggle();
    } else if (key === "arrowright") {
      event.preventDefault();
      seek(current + 5);
    } else if (key === "arrowleft") {
      event.preventDefault();
      seek(current - 5);
    }
  };

  const ratioFromEvent = (clientX: number): number => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  };

  const scrubTo = (clientX: number) => {
    if (!span) return;
    seek(ratioFromEvent(clientX) * span);
  };

  // Dragging continues outside the track, as a scrubber should.
  useEffect(() => {
    if (!scrubbing) return;
    const move = (event: PointerEvent) => scrubTo(event.clientX);
    const up = () => setScrubbing(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  const progress = span ? Math.min(100, (current / span) * 100) : 0;

  return (
    <div
      className="group/player relative flex min-h-0 flex-1 flex-col bg-[#0d0e10] outline-none"
      onKeyDown={onKeyDown}
      role="group"
      tabIndex={0}
    >
      <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden">
        <video
          className="size-full object-contain"
          onDurationChange={(event) => setDuration(event.currentTarget.duration || declaredDuration)}
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration || declaredDuration);
            if (seekTo !== null) seek(seekTo);
          }}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
          onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
          playsInline
          poster={poster}
          preload="metadata"
          ref={videoRef}
          src={src}
        />

        {/* Centre affordance: visible while paused, out of the way while playing. */}
        <button
          aria-label={playing ? "Pause" : "Play"}
          className="absolute inset-0 grid place-items-center"
          onClick={toggle}
          type="button"
        >
          <span
            className={`grid size-14 place-items-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-sm transition-opacity ${
              playing ? "opacity-0 group-hover/player:opacity-70" : "opacity-90"
            }`}
          >
            {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
          </span>
        </button>
      </div>

      {/* One control surface: transport, then the track that carries the cases. */}
      <div className="border-t border-white/10 bg-black/40 px-3 pb-2 pt-1.5 backdrop-blur-sm">
        <div
          aria-label="Picture scrubber and risk timeline"
          className="relative h-6 cursor-pointer touch-none"
          onPointerDown={(event) => {
            event.preventDefault();
            setScrubbing(true);
            scrubTo(event.clientX);
          }}
          onPointerLeave={() => setHoverRatio(null)}
          onPointerMove={(event) => setHoverRatio(ratioFromEvent(event.clientX))}
          ref={trackRef}
          role="slider"
          aria-valuemax={Math.round(span)}
          aria-valuemin={0}
          aria-valuenow={Math.round(current)}
          tabIndex={-1}
        >
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/15">
            {/* Hover preview trails the cursor ahead of the played fill. */}
            {hoverRatio !== null && (
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/25"
                style={{ width: `${hoverRatio * 100}%` }}
              />
            )}
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>

          {/* Clearance cases, positioned on the same track as playback. */}
          {markers.map(({ item, time }) => {
            const left = span ? Math.min(100, (time / span) * 100) : 0;
            const active = selectedId === item.id;
            return (
              <button
                // Seconds rather than a timecode: assistive tech reads the
                // precise position, while the visible tooltip stays the name.
                aria-label={`${item.name} at ${time.toFixed(1)} seconds`}
                className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40 transition-transform risk-fill--${item.color} ${
                  active ? "scale-150 ring-2 ring-white/70" : "hover:scale-125"
                }`}
                key={item.id}
                onClick={(event) => {
                  event.stopPropagation();
                  // Seek here rather than relying on the derived seekTo prop:
                  // clicking the marker of the already-selected case leaves
                  // that prop unchanged, so the effect would never re-fire.
                  seek(time);
                  onSelectMarker(item.id, time);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                style={{ left: `${left}%` }}
                title={item.name}
                type="button"
              />
            );
          })}

          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
            style={{ left: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-white/70">
          <div className="flex items-center gap-1">
            <button aria-label={playing ? "Pause" : "Play"} className="grid size-6 place-items-center rounded hover:bg-white/10" onClick={toggle} type="button">
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
            <button
              aria-label={muted ? "Unmute" : "Mute"}
              className="grid size-6 place-items-center rounded hover:bg-white/10"
              onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }}
              type="button"
            >
              {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            </button>
            <span className="ml-1 font-mono text-[10px] tabular-nums">
              {timecode(current)} / {timecode(span)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label="Picture in picture"
              className="grid size-6 place-items-center rounded hover:bg-white/10"
              onClick={() => void videoRef.current?.requestPictureInPicture?.().catch(() => undefined)}
              type="button"
            >
              <PictureInPicture2 className="size-3.5" />
            </button>
            <button
              aria-label="Fullscreen"
              className="grid size-6 place-items-center rounded hover:bg-white/10"
              onClick={() => void videoRef.current?.requestFullscreen?.().catch(() => undefined)}
              type="button"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
