import type { ActivityEvent, Project, ProjectPhase } from "@clearcut/contracts";
import { buildCandidateRevision, ensureInitialRevision } from "@clearcut/domain";
import type { GeminiClient, ParallelClient } from "@clearcut/integrations";

import type { AssetStore } from "../repositories/asset-store";
import type { ProjectRepository } from "../repositories/project-repository";
import type { ProjectEventBus } from "../services/events";
import { withSummary } from "../services/projects";
import { cutStage } from "./cut-stage";
import { reconcileStage } from "./reconcile-stage";
import type { ResearchDepth } from "./research-stage";
import { researchStage } from "./research-stage";
import { screenplayStage } from "./screenplay-stage";

export type OrchestratorDependencies = {
  repository: ProjectRepository;
  assetStore: AssetStore;
  gemini: GeminiClient;
  parallel: ParallelClient;
  events: ProjectEventBus;
  researchConcurrency: number;
  researchDepth: ResearchDepth;
  caseResearchTimeoutMs: number | null;
};

/** Phases a production can be left in only by finishing. */
const SETTLED_PHASES = new Set<ProjectPhase>(["ready", "failed"]);

/** A case still owed research: everything else has either settled or been decided by a human. */
function awaitsResearch(item: Project["items"][number]): boolean {
  return item.workflow_status === "detected" || item.workflow_status === "researching";
}

function activity(phase: string, message: string, detail: Record<string, unknown> = {}): ActivityEvent {
  return { id: `activity_${crypto.randomUUID()}`, at: new Date().toISOString(), phase, message, detail };
}

export class ProjectOrchestrator {
  constructor(readonly dependencies: OrchestratorDependencies) {}

  async #progress(project: Project, phase: ProjectPhase, message: string, detail: Record<string, unknown> = {}) {
    project.phase = phase;
    project.updated_at = new Date().toISOString();
    project.activity_events.push(activity(phase, message, detail));
    project.activity_events = project.activity_events.slice(-500);
    await this.dependencies.repository.save(withSummary(project));
    this.dependencies.events.publish(project.id, { type: "progress", phase, message, detail });
  }

  async run(projectId: string): Promise<void> {
    const project = await this.dependencies.repository.require(projectId);
    try {
      if (project.script) await this.#progress(project, "scanning_script", `Reading ${project.script.filename}`);
      if (project.cut) await this.#progress(project, "scanning_cut", `Analysing ${project.cut.filename}`);

      const [screenplay, cut] = await Promise.all([
        screenplayStage(project.script, project.title, this.dependencies.assetStore, this.dependencies.gemini),
        cutStage(project.cut, project.title, "", this.dependencies.assetStore, this.dependencies.gemini),
      ]);
      if (project.script && screenplay.metadata) {
        project.script.title = screenplay.metadata.title;
        project.script.page_count = screenplay.metadata.pageCount;
        project.script.scene_count = screenplay.metadata.sceneCount;
        project.title = screenplay.metadata.title || project.title;
        const history = project.script_history.find((version) => version.id === project.script?.id);
        if (history) Object.assign(history, project.script);
        await this.#progress(project, "scanning_script", `${screenplay.candidates.length} candidate(s) found in the screenplay`, { count: screenplay.candidates.length });
      }
      if (project.cut) {
        await this.#progress(project, "scanning_cut", `${cut.detections.length} element(s) detected in the cut`, {
          count: cut.detections.length,
          notes: cut.notes,
          detections: cut.detections.map((detection) => ({ name: detection.name, category: detection.category, start: detection.start_seconds, end: detection.end_seconds })),
        });
      }

      await this.#progress(project, "reconciling", "Comparing the page against the screen");
      const reconciled = await reconcileStage({
        productionTitle: project.title,
        sourceVersion: project.cut?.label ?? project.script?.label ?? "source-v1",
        durationSeconds: project.cut?.duration_s ?? Number.MAX_SAFE_INTEGER,
        script: screenplay.candidates,
        cut: cut.detections,
        gemini: this.dependencies.gemini,
      });
      project.items = reconciled.items;
      project.reconciliation = reconciled.findings;
      await this.#progress(project, "reconciling", `${project.items.length} clearance case(s) assembled`, {
        unscripted: reconciled.findings.filter((finding) => finding.kind === "cut_only").length,
        materially_changed: reconciled.findings.filter((finding) => finding.kind === "materially_changed").length,
      });

      if (project.items.length > 0) {
        await this.#progress(project, "researching", `Researching ${project.items.length} case(s)—Search, then Task`, { total: project.items.length });
        await researchStage({
          project,
          repository: this.dependencies.repository,
          parallel: this.dependencies.parallel,
          events: this.dependencies.events,
          gemini: this.dependencies.gemini,
          concurrency: this.dependencies.researchConcurrency,
          depth: this.dependencies.researchDepth,
          caseTimeoutMs: this.dependencies.caseResearchTimeoutMs ?? undefined,
        });
      }

      project.phase = "ready";
      project.error = null;
      project.updated_at = new Date().toISOString();
      project.activity_events.push(activity("ready", "Evidence ready for human review", { item_count: project.items.length }));
      ensureInitialRevision(project);
      const ready = await this.dependencies.repository.save(withSummary(project));
      this.dependencies.events.publish(project.id, { type: "done", phase: ready.phase });
    } catch (error) {
      project.phase = "failed";
      project.error = "Analysis stopped before completion. Existing results remain available.";
      project.updated_at = new Date().toISOString();
      project.activity_events.push(activity("failed", project.error, {
        recoverable: true,
        cause: error instanceof Error ? error.message : "Unknown pipeline failure",
      }));
      await this.dependencies.repository.save(withSummary(project));
      this.dependencies.events.publish(project.id, { type: "error", phase: "failed", message: project.error, recoverable: true });
    }
  }

  /**
   * Finishes a run whose process did not survive it.
   *
   * A run lives in one process, so anything that ends the process — a redeploy,
   * a crash, an instance recycling — leaves the production frozen in whatever
   * non-terminal phase it had reached, even when every case underneath it had
   * already finished and been saved. Nothing ever moved it again, and the page
   * showed an analysis that would never end.
   *
   * Resuming picks up from the saved record rather than starting over: rescanning
   * would rebuild the case list from scratch and throw away the evidence already
   * gathered. Only cases still owed research are researched again.
   */
  async resume(projectId: string): Promise<void> {
    const project = await this.dependencies.repository.require(projectId);
    if (SETTLED_PHASES.has(project.phase)) return;
    // Interrupted before any case existed: there is no partial work to rescue.
    if (project.items.length === 0) return this.run(projectId);

    try {
      const pending = project.items.flatMap((item, index) => (awaitsResearch(item) ? [index] : []));
      if (pending.length > 0) {
        await this.#progress(project, "researching", `Resuming ${pending.length} unfinished case(s)`, { total: pending.length });
        await researchStage({
          project,
          repository: this.dependencies.repository,
          parallel: this.dependencies.parallel,
          events: this.dependencies.events,
          gemini: this.dependencies.gemini,
          concurrency: this.dependencies.researchConcurrency,
          depth: this.dependencies.researchDepth,
          indexes: pending,
          caseTimeoutMs: this.dependencies.caseResearchTimeoutMs ?? undefined,
        });
      }

      project.phase = "ready";
      project.error = null;
      project.updated_at = new Date().toISOString();
      project.activity_events.push(activity("ready", "Evidence ready for human review", { item_count: project.items.length, resumed: true }));
      ensureInitialRevision(project);
      const ready = await this.dependencies.repository.save(withSummary(project));
      this.dependencies.events.publish(project.id, { type: "done", phase: ready.phase });
    } catch (error) {
      project.phase = "failed";
      project.error = "Analysis stopped before completion. Existing results remain available.";
      project.updated_at = new Date().toISOString();
      project.activity_events.push(activity("failed", project.error, {
        recoverable: true,
        cause: error instanceof Error ? error.message : "Unknown pipeline failure",
      }));
      await this.dependencies.repository.save(withSummary(project));
      this.dependencies.events.publish(project.id, { type: "error", phase: "failed", message: project.error, recoverable: true });
    }
  }

  /**
   * Resumes every production a previous process left mid-analysis.
   *
   * Safe to run at startup: a run cannot outlive its process, so a production
   * still sitting in a non-terminal phase has no one working on it.
   */
  async recoverInterrupted(): Promise<number> {
    const projects = await this.dependencies.repository.list({ includeArchived: true });
    const interrupted = projects.filter((project) => !SETTLED_PHASES.has(project.phase));
    for (const project of interrupted) await this.resume(project.id);
    return interrupted.length;
  }

  async runRevision(projectId: string, revisionId: string): Promise<void> {
    const project = await this.dependencies.repository.require(projectId);
    const placeholder = project.revisions.find((revision) => revision.id === revisionId);
    if (!placeholder) return;
    try {
      const [screenplay, cut] = await Promise.all([
        screenplayStage(placeholder.script, project.title, this.dependencies.assetStore, this.dependencies.gemini),
        cutStage(placeholder.cut, project.title, "", this.dependencies.assetStore, this.dependencies.gemini),
      ]);
      const reconciled = await reconcileStage({
        productionTitle: screenplay.metadata?.title || project.title,
        sourceVersion: placeholder.cut?.label ?? placeholder.script?.label ?? "revision",
        durationSeconds: placeholder.cut?.duration_s ?? Number.MAX_SAFE_INTEGER,
        script: screenplay.candidates,
        cut: cut.detections,
        gemini: this.dependencies.gemini,
      });
      const candidate = buildCandidateRevision(project, reconciled.items, {
        script: placeholder.script,
        cut: placeholder.cut,
        revisionId: placeholder.id,
      });
      candidate.sequence = placeholder.sequence;
      candidate.created_at = placeholder.created_at;
      project.revisions = project.revisions.map((revision) => revision.id === revisionId ? candidate : revision);
      project.updated_at = new Date().toISOString();
      project.activity_events.push(activity("revision_ready", `Revision ${candidate.sequence} is ready for comparison.`, { revision_id: revisionId }));
      await this.dependencies.repository.save(withSummary(project));
    } catch (error) {
      placeholder.state = "failed";
      placeholder.error = "Comparison stopped. The active revision was not changed.";
      project.activity_events.push(activity("revision_failed", placeholder.error, {
        revision_id: revisionId,
        cause: error instanceof Error ? error.message : "Unknown revision failure",
      }));
      await this.dependencies.repository.save(withSummary(project));
    }
  }
}
