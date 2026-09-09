import type { ClearanceItem, EvidenceSource, Project } from "@clearcut/contracts";
import { applyDisposition, hasHumanDecision } from "@clearcut/domain";
import type { Dossier, DossierSynthesis, GeminiClient, ParallelClient } from "@clearcut/integrations";

import type { ProjectRepository } from "../repositories/project-repository";
import type { ProjectEventBus } from "../services/events";
import { withSummary } from "../services/projects";

/**
 * How a case is researched.
 *
 * `fast` retrieves with Parallel Search and reasons over what came back with a
 * Gemini agent. `deep` hands the whole case to a Parallel Task, which searches
 * again on its own and returns a richer basis — measured between 100s and 250s
 * per case against seconds for `fast`, with tails well beyond that.
 */
export type ResearchDepth = "fast" | "deep";

/** Citations resolved from indexes back to the sources actually retrieved. */
function synthesisBasis(synthesis: DossierSynthesis, sources: EvidenceSource[]): Dossier["basis"] {
  return synthesis.basis.map((entry) => ({
    field: entry.field,
    reasoning: entry.reasoning,
    confidence: entry.confidence,
    citations: entry.source_indexes
      .map((index) => sources[index])
      .filter((source): source is EvidenceSource => Boolean(source))
      .map((source) => ({ url: source.url, title: source.title, excerpts: [source.excerpt] })),
  }));
}

function taskSources(item: ClearanceItem, basis: Dossier["basis"]): EvidenceSource[] {
  const known = new Set(item.sources.map((source) => source.url));
  const sources: EvidenceSource[] = [];
  for (const field of basis) {
    for (const citation of field.citations) {
      if (known.has(citation.url)) continue;
      known.add(citation.url);
      sources.push({
        url: citation.url,
        title: citation.title,
        excerpt: citation.excerpts[0]?.slice(0, 1_200) ?? "",
        publish_date: null,
        retrieved_at: new Date().toISOString(),
        via: "parallel_task",
        field: field.field || null,
      });
    }
  }
  return sources;
}

async function mapConcurrent<T>(values: T[], limit: number, work: (value: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), values.length) }, async () => {
    while (cursor < values.length) {
      const value = values[cursor++];
      await work(value);
    }
  });
  await Promise.all(workers);
}

/**
 * How long one case may spend in structured research before the pipeline gives
 * up on it.
 *
 * Research runs concurrently, but the production is only `ready` once every
 * case has settled — so a single hung run holds the whole thing in "analysing"
 * indefinitely while the other results sit there finished. A case that has not
 * returned by now is an outlier, and an outlier should become a visible gap
 * rather than an open-ended wait.
 */
const CASE_RESEARCH_TIMEOUT_MS: Record<ResearchDepth, number> = { fast: 90_000, deep: 5 * 60_000 };

function withDeadline<T>(work: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export async function researchStage(input: {
  project: Project;
  repository: ProjectRepository;
  parallel: ParallelClient;
  events: ProjectEventBus;
  gemini: GeminiClient;
  concurrency: number;
  depth: ResearchDepth;
  /** Overridable so the deadline can be exercised without waiting for it. */
  caseTimeoutMs?: number;
}): Promise<Project> {
  const { project, repository, parallel, gemini, events, depth } = input;
  const caseTimeout = input.caseTimeoutMs ?? CASE_RESEARCH_TIMEOUT_MS[depth];

  /** Retrieval always runs on Parallel; only the reasoning over it moves. */
  const assemble = async (item: ClearanceItem, sources: EvidenceSource[]): Promise<Dossier> => {
    if (depth === "deep") return parallel.buildDossier(item, project.title, sources);
    const synthesis = await gemini.synthesizeDossier({ productionTitle: project.title, item, sources });
    const { basis: _basis, ...fields } = synthesis;
    return { ...fields, run_id: `gemini-synthesis:${item.stable_item_id}`, basis: synthesisBasis(synthesis, sources) };
  };

  await mapConcurrent(project.items.map((_, index) => index), input.concurrency, async (index) => {
    let item = project.items[index];
    if (!hasHumanDecision(item)) {
      item = applyDisposition(item, {
        actor: "agent",
        status: "researching",
        rationale: "Automated evidence gathering started.",
      });
      project.items[index] = item;
      await repository.save(withSummary(project));
      events.publish(project.id, { type: "item_status", item_id: item.id, status: item.workflow_status, color: item.color });
    }

    let sources: EvidenceSource[] = [];
    try {
      sources = await parallel.searchClearanceItem(item, project.title, project.id);
      item.sources = [...item.sources, ...sources.filter((source) => !item.sources.some((known) => known.url === source.url))];
      events.publish(project.id, {
        type: "search_results",
        item_id: item.id,
        item_name: item.name,
        sources: sources.slice(0, 8).map((source) => ({ url: source.url, title: source.title, excerpt: source.excerpt.slice(0, 220) })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Parallel Search failed.";
      item.research_error = `Search: ${message}`;
      events.publish(project.id, { type: "search_failed", item_id: item.id, message });
    }

    try {
      const dossier = await withDeadline(
        assemble(item, item.sources),
        caseTimeout,
        "Structured research did not return within the time budget for this case.",
      );
      item = {
        ...item,
        candidate_rights_holders: dossier.candidate_rights_holders,
        licensing_routes: dossier.licensing_routes,
        research_summary: dossier.research_summary,
        evidence_gaps: dossier.evidence_gaps,
        unresolved_questions: dossier.unresolved_questions,
        recommended_actions: dossier.recommended_actions,
        task_run_id: dossier.run_id,
        sources: [...item.sources, ...taskSources(item, dossier.basis)],
        research_error: item.research_error,
      };
      const target = dossier.candidate_rights_holders.length > 0 ? "evidence_ready" : "unresolved";
      if (!hasHumanDecision(item)) {
        item = applyDisposition(item, {
          actor: "agent",
          status: target,
          rationale: target === "evidence_ready"
            ? `${dossier.candidate_rights_holders.length} candidate rights holder(s) and ${item.sources.length} source(s) assembled for human review.`
            : "No candidate rights holder could be established from public sources.",
        });
      }
    } catch (error) {
      item.research_error = error instanceof Error ? error.message : "Structured research failed.";
      if (!hasHumanDecision(item)) {
        item = applyDisposition(item, {
          actor: "agent",
          status: "unresolved",
          rationale: `Structured research failed: ${item.research_error}`,
        });
      }
    }

    item.citation_count = new Set(item.sources.map((source) => source.url)).size;
    project.items[index] = item;
    project.updated_at = new Date().toISOString();
    await repository.save(withSummary(project));
    events.publish(project.id, {
      type: "item_researched",
      item_id: item.id,
      item_name: item.name,
      status: item.workflow_status,
      color: item.color,
      citations: item.citation_count,
      holders: item.candidate_rights_holders.length,
    });
  });
  return withSummary(project);
}
