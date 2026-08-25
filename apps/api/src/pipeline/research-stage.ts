import type { ClearanceItem, EvidenceSource, Project } from "@clearcut/contracts";
import { applyDisposition, hasHumanDecision } from "@clearcut/domain";
import type { ParallelClient } from "@clearcut/integrations";

import type { ProjectRepository } from "../repositories/project-repository";
import type { ProjectEventBus } from "../services/events";
import { withSummary } from "../services/projects";

function taskSources(item: ClearanceItem, basis: Awaited<ReturnType<ParallelClient["buildDossier"]>>["basis"]): EvidenceSource[] {
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

export async function researchStage(input: {
  project: Project;
  repository: ProjectRepository;
  parallel: ParallelClient;
  events: ProjectEventBus;
  concurrency: number;
}): Promise<Project> {
  const { project, repository, parallel, events } = input;
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
      const dossier = await parallel.buildDossier(item, project.title, sources);
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
