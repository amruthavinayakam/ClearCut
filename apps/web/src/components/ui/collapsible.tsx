"use client"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { cn } from "@/lib/utils"

function Collapsible({ className, ...props }: CollapsiblePrimitive.Root.Props) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      className={cn("group/collapsible", className)}
      {...props}
    />
  )
}

function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "flex w-full items-center gap-1.5 text-left transition-colors duration-150 ease-out-quint hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

/**
 * The panel is not animated, deliberately.
 *
 * Animating it needs the panel kept mounted so there is a height to move from,
 * and with the panel mounted inside a scrolling region that measures itself,
 * toggling it reproducibly froze the renderer — twice, on a fresh page each
 * time. The transition did not even run: `max-height` jumped from 0 to its full
 * value inside one frame. A disclosure that opens instantly is a smaller cost
 * than one that hangs the page, so this stays plain until the interaction
 * between the panel's height and the scroll region's ResizeObserver is
 * understood rather than guessed at.
 */
function CollapsiblePanel({ className, ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-panel"
      className={cn(className)}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsiblePanel }
