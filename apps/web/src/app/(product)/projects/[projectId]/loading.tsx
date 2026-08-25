export default function ProjectLoading() {
  return (
    <main className="min-h-dvh">
      <div className="h-16 border-b border-border" />
      <div className="grid min-h-[calc(100dvh-4rem)] grid-cols-[260px_1fr_360px]">
        <div className="border-r border-border p-3"><div className="h-7 animate-pulse bg-muted" /></div>
        <div className="bg-media" />
        <div className="border-l border-border p-4"><div className="h-24 animate-pulse bg-muted" /></div>
      </div>
    </main>
  );
}
