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
 * The panel animates open and closed.
 *
 * `height: auto` cannot be interpolated, so the collapse runs on `max-height`
 * between two pixel values: zero and the height Base UI measures for the
 * content and publishes as `--collapsible-panel-height`. Using the measured
 * value rather than a guessed ceiling means the motion neither clips long
 * content nor spends most of its duration animating empty space.
 *
 * Padding belongs on the content inside, never on the animated track.
 */
function CollapsiblePanel({ className, children, ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      // Kept in the DOM while closed: a box that does not exist has no state to
      // animate from, so the panel simply appeared at full size.
      keepMounted
      data-slot="collapsible-panel"
      className={cn(
        "max-h-[var(--collapsible-panel-height)] overflow-hidden transition-[max-height,opacity] duration-200 ease-out-quint",
        "data-closed:max-h-0 data-closed:opacity-0",
        className
      )}
      {...props}
    >
      {children}
    </CollapsiblePrimitive.Panel>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsiblePanel }
