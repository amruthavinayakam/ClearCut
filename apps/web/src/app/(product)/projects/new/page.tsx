import { IntakeForm } from "./intake-form";

export default function NewProjectPage() {
  return (
    <main className="min-h-dvh">
      <header className="flex min-h-40 items-end border-b border-border px-4 pb-5 sm:px-6 lg:px-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">NEW PRODUCTION / INTAKE</p>
          <h1 className="mt-2 text-xl font-medium tracking-[-0.025em]">Start a clearance scan</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Add the screenplay, the current cut, or both. Using both lets ClearCut surface page-to-screen changes and cut-only elements.</p>
        </div>
      </header>
      <div className="py-6"><IntakeForm /></div>
    </main>
  );
}
