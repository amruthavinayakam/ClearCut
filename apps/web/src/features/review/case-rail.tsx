import type { ClearanceItem } from "@clearcut/contracts";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { cn } from "@/lib/utils";

import { CategoryIcon } from "./category-icon";

export function CaseRail({ items, selectedId, onSelect }: { items: ClearanceItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <aside className="flex min-w-0 flex-col border-b border-border xl:min-h-0 xl:border-b-0 xl:border-r">
      <div className="shrink-0 border-b border-border p-2"><div className="relative"><Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search cases" className="h-7 border-0 pl-7 shadow-none focus-visible:ring-0" placeholder="Search cases" /></div></div>
            {/* ScrollFade is positioned, which is also load-bearing here: an absolutely
          positioned descendant is clipped only by a positioned ancestor, so
          without it the screen-reader label inside every row escapes this
          scroller and stretches the page to the full height of the list. */}
      <ScrollFade className="xl:flex-1" viewportClassName="flex max-h-56 overflow-x-auto xl:block xl:min-h-0 xl:h-full xl:max-h-none xl:overflow-y-auto">
        {items.map((item, index) => (
          <button
            aria-pressed={selectedId === item.id}
            // xl:w-full is load-bearing: a button is a form control, so its
            // `width: auto` resolves to fit-content even as a grid container.
            // Without it each row sizes to its own label and the dividers come
            // out ragged once the rail stacks vertically.
            className={cn("grid min-h-11 min-w-[230px] grid-cols-[24px_1fr_auto] items-center gap-2.5 border-r border-border px-3 py-2.5 text-left transition-colors xl:w-full xl:min-w-0 xl:border-b xl:border-r-0", selectedId === item.id ? "bg-muted" : "hover:bg-muted/60")}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <CategoryIcon category={item.category} color={item.color} provenance={item.provenance} />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{item.name}</span>
              {item.provenance === "cut_only" && <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-risk-amber">Unscripted</span>}
            </span>
            <span className="font-mono text-[9px] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
          </button>
        ))}
      </ScrollFade>
    </aside>
  );
}
