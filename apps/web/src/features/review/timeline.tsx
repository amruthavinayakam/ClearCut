import type { ClearanceItem } from "@clearcut/contracts";

export function Timeline({ items, duration, selectedId, onSelect }: { items: ClearanceItem[]; duration: number; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="border-t border-border bg-background px-4 py-3">
      <div className="relative h-8" aria-label="Risk timeline">
        <div className="absolute inset-x-0 top-3 h-px bg-border" />
        {items.flatMap((item) => item.cut_detections.slice(0, 1).map((detection) => {
          const left = duration ? Math.min(100, (detection.representative_time / duration) * 100) : 0;
          return <button aria-label={`${item.name} at ${detection.representative_time.toFixed(1)} seconds`} className={`absolute top-1 size-3 -translate-x-1/2 rounded-full border-2 border-background risk-fill--${item.color} ${selectedId === item.id ? "ring-2 ring-primary/30" : ""}`} key={item.id} onClick={() => onSelect(item.id)} style={{ left: `${left}%` }} type="button" />;
        }))}
      </div>
      <div className="flex justify-between font-mono text-[9px] text-muted-foreground"><span>00:00</span><span>{Math.floor(duration / 60).toString().padStart(2, "0")}:{Math.floor(duration % 60).toString().padStart(2, "0")}</span></div>
    </div>
  );
}
