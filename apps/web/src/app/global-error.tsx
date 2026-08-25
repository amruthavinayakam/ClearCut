"use client";

import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html className={`${GeistSans.variable} ${GeistMono.variable}`} lang="en">
      <body className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
        <main className="w-full max-w-md border-t border-border pt-5">
          <p className="font-mono text-[10px] tracking-[0.1em] text-destructive">SYSTEM ERROR</p>
          <h1 className="mt-3 text-lg font-medium">ClearCut could not open this workspace.</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">The stored project was not changed. Retry the request or return to the production library.</p>
          <Button className="mt-6" onClick={reset}>Retry</Button>
        </main>
      </body>
    </html>
  );
}
