import type { ClearanceItem } from "@clearcut/contracts";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function CaseRail({ items, selectedId, onSelect }: { items: ClearanceItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <aside className="min-w-0 border-b border-border xl:border-b-0 xl:border-r">
      <div className="border-b border-border p-2"><div className="relative"><Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search cases" className="h-7 border-0 pl-7 shadow-none focus-visible:ring-0" placeholder="Search cases" /></div></div>
      <div className="flex max-h-56 overflow-x-auto xl:block xl:max-h-[calc(100dvh-10rem)] xl:overflow-y-auto">
        {items.map((item, index) => (
          <button
            aria-pressed={selectedId === item.id}
            // xl:w-full is load-bearing: a button is a form control, so its
            // `width: auto` resolves to fit-content even as a grid container.
            // Without it each row sizes to its own label and the dividers come
            // out ragged once the rail stacks vertically.
            className={cn("grid min-w-[230px] grid-cols-[8px_1fr_auto] gap-2 border-r border-border px-3 py-3 text-left transition-colors xl:w-full xl:min-w-0 xl:border-b xl:border-r-0", selectedId === item.id ? "bg-muted" : "hover:bg-muted/60")}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <span className={`risk-dot risk-dot--${item.color} mt-1`} />
            <span className="min-w-0"><span className="block truncate text-xs font-medium">{item.name}</span><span className="mt-1 block truncate text-[10px] capitalize text-muted-foreground">{item.category.replaceAll("_", " ")} · {item.provenance.replaceAll("_", " ")}</span></span>
            <span className="font-mono text-[9px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
