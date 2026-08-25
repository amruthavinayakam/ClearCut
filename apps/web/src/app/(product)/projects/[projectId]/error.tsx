"use client";

import { Button } from "@/components/ui/button";

export default function ProjectError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-[calc(100dvh-3rem)] place-items-center p-6"><section className="w-full max-w-md border-t border-border pt-5"><p className="font-mono text-[10px] tracking-[0.1em] text-risk-red">PROJECT LOAD FAILED</p><h1 className="mt-3 text-lg font-medium">The production could not be opened.</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">No review state was changed. Retry the validated server snapshot.</p><Button className="mt-5" onClick={reset}>Retry project</Button></section></main>;
}
