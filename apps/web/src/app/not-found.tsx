import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <section className="w-full max-w-md border-t border-border pt-5">
        <p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">404 / NOT FOUND</p>
        <h1 className="mt-3 text-lg font-medium">That production record does not exist.</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have been archived, removed, or opened from an expired link.</p>
        <Link className={buttonVariants({ className: "mt-6" })} href="/">Return to productions</Link>
      </section>
    </main>
  );
}
