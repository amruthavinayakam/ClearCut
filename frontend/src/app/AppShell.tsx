import type { PropsWithChildren } from "react";

import { followInternalLink } from "./router";


interface Props extends PropsWithChildren {
  configIssue?: string;
  projectIndexIssue?: string;
  onRetryConfig?: () => void;
  onRetryProjects?: () => void;
}

export function BootScreen({ delayed }: { delayed: boolean }) {
  return (
    <main className="boot-screen" aria-busy="true" aria-label="Opening ClearCut">
      <div className="boot-wordmark">ClearCut</div>
      {delayed && (
        <div className="boot-structure" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      <span className="sr-only">Opening project workspace</span>
    </main>
  );
}

export default function AppShell({
  children,
  configIssue,
  projectIndexIssue,
  onRetryConfig,
  onRetryProjects,
}: Props) {
  return (
    <div className="app-shell">
      <header className="shell-header">
        <a href="/" onClick={(event) => followInternalLink(event, "/")}>
          <span className="shell-mark" aria-hidden="true" />
          ClearCut
        </a>
        <span>Research for human legal review</span>
      </header>

      {(configIssue || projectIndexIssue) && (
        <aside className="capability-notices" aria-label="Service notices">
          {configIssue && (
            <p>
              <span>Configuration unavailable. Project creation may be limited.</span>
              <button type="button" onClick={onRetryConfig}>Retry configuration</button>
            </p>
          )}
          {projectIndexIssue && (
            <p>
              <span>Project index unavailable. You can still start a new clearance scan.</span>
              <button type="button" onClick={onRetryProjects}>Retry projects</button>
            </p>
          )}
        </aside>
      )}

      {children}
    </div>
  );
}
