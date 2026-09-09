import type { ClearanceItem, Project } from "@clearcut/contracts";
import { packetReadiness } from "@clearcut/domain";

import { documentScope } from "./documents";
import { projectSummary } from "./projects";

const COLOR_LABEL: Record<string, string> = {
  red: "UNRESOLVED",
  amber: "EVIDENCE INCOMPLETE",
  blue: "COORDINATOR VERIFIED",
  green: "DOCUMENTED",
  gray: "DISMISSED",
};

const PRIORITY: Record<string, number> = {
  reopened_by_revision: 0,
  reopened_by_monitor: 0,
  detected: 1,
  researching: 1,
  unresolved: 1,
  evidence_ready: 2,
  waiting_on_rights_holder: 2,
  replacement_requested: 2,
};

/**
 * Flattens provider text into a single safe line.
 *
 * Source excerpts and research summaries are markdown written by someone else.
 * Pasted verbatim they take over the document: a newline ends the blockquote
 * that was meant to contain them, and the excerpt's own `#` headings then
 * outrank the packet's, while a stray `|` breaks the surrounding table.
 */
function inlineText(value: string, limit = 280): string {
  const flat = value.replace(/\s+/g, " ").trim();
  const cut = flat.lastIndexOf(" ", limit);
  const clipped = flat.length <= limit
    ? flat
    : `${flat.slice(0, cut > limit / 2 ? cut : limit).trimEnd()}…`;
  // Collapsing the whitespace above is what actually contains the text. Only a
  // leading marker can still open a block, and a pipe can still split a cell —
  // escaping anything further would just litter the prose with backslashes.
  return clipped.replaceAll("|", "\\|").replace(/^([#>\-+*]|\d+\.)/, "\\$1");
}

/** Multi-line provider prose: keep the paragraphs, neutralise the line starts. */
function blockText(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => inlineText(paragraph, 4_000))
    .filter(Boolean)
    .join("\n\n");
}

/** Table cells additionally cannot contain a bare pipe or a line break. */
function cell(value: string): string {
  return value.replace(/\s+/g, " ").replaceAll("|", "\\|").trim() || "—";
}

/** Link text cannot contain unbalanced brackets. */
function linkText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/([[\]])/g, "\\$1").trim();
}

function timecode(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remaining.toFixed(3).padStart(6, "0")}`;
}

function itemMarkdown(project: Project, item: ClearanceItem): string[] {
  const lines = [
    `## ${COLOR_LABEL[item.color] ?? item.color.toLocaleUpperCase()} — ${inlineText(item.name, 200)}`,
    "",
    `**Category:** ${item.category} · **Status:** \`${item.workflow_status}\` · **Detection confidence:** ${item.detection_confidence} · **Priority:** ${item.research_priority}`,
    "",
    item.provenance === "cut_only" ? "**UNSCRIPTED** — entered through the filmed material" : item.provenance === "both" ? "In script and cut" : "In script only",
    "",
  ];
  if (item.description) lines.push(blockText(item.description), "");
  if (item.cut_detections.length) {
    lines.push("### On screen", "");
    for (const detection of item.cut_detections) {
      lines.push(`- \`${timecode(detection.timecode.start)} – ${timecode(detection.timecode.end)}\` (${detection.modality}) — ${inlineText(detection.observation, 400)}`);
    }
    lines.push("");
  }
  if (item.candidate_rights_holders.length) {
    lines.push("### Candidate rights holders", "", "| Name | Role | Rights | Confidence |", "|---|---|---|---|");
    for (const holder of item.candidate_rights_holders) {
      lines.push(`| ${cell(holder.name)} | ${cell(holder.role)} | ${cell(holder.rights_implicated.join(", "))} | ${cell(holder.confidence)} |`);
    }
    lines.push("", "*Candidates derived from public sources — confirm before reliance.*", "");
  }
  if (item.licensing_routes.length) {
    lines.push("### Licensing routes", "");
    for (const route of item.licensing_routes) {
      const organization = route.url ? `[${linkText(route.organization)}](${route.url})` : inlineText(route.organization, 200);
      lines.push(`- **${organization}** — ${inlineText(route.route, 400)}${route.contact ? ` — ${inlineText(route.contact, 200)}` : ""}`);
    }
    lines.push("");
  }
  if (item.research_summary) lines.push("### Research summary", "", blockText(item.research_summary), "");
  if (item.evidence_gaps.length) lines.push("### Evidence gaps", "", ...item.evidence_gaps.map((gap) => `- ${inlineText(gap, 600)}`), "");
  if (item.documents.length) {
    lines.push("### Attached documents", "");
    for (const document of item.documents) {
      const scope = documentScope(project, document);
      lines.push(`- **${document.kind}** — ${inlineText(document.title, 200)}`);
      lines.push(`  - Recorded scope comparison: **${scope.outcome}**`);
      lines.push(...scope.gaps.map((gap) => `  - ${gap}`));
    }
    lines.push("");
  }
  lines.push("### Sources", "");
  if (item.sources.length === 0) {
    lines.push("- *No public sources retrieved. This item is unresolved.*");
  } else {
    const seen = new Set<string>();
    for (const source of item.sources) {
      if (seen.has(source.url)) continue;
      seen.add(source.url);
      lines.push(`- [${linkText(source.title ?? source.url)}](${source.url}) — *via ${source.via.replaceAll("_", " ")}, retrieved ${source.retrieved_at.slice(0, 10)}*`);
      if (source.excerpt) lines.push(`  > ${inlineText(source.excerpt)}`);
    }
  }
  lines.push("", "---", "");
  return lines;
}

export function packetMarkdown(project: Project): string {
  const summary = projectSummary(project);
  const readiness = packetReadiness(project);
  const active = project.revisions?.find((revision) => revision.id === project.active_revision_id);
  const lines = [
    `# Clearance Research Packet — ${project.title}`,
    "",
    `*Generated by ClearCut on ${project.updated_at}*`,
    "",
  ];
  if (project.phase !== "ready" || !readiness.ready || project.items.some((item) => item.sources.length === 0)) {
    lines.push("> **INCOMPLETE RESEARCH — export is permitted for working review, but this packet contains open or unresearched items.**", "");
  }
  lines.push(
    "> **Research for human legal review.** ClearCut does not issue legal clearance. Candidate ownership and contact routes come from public research and must be confirmed before reliance.",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Script version | \`${project.script?.label ?? "—"}\` |`,
    `| Cut version | \`${project.cut?.label ?? "—"}\` |`,
    active ? `| Active revision | \`${active.sequence} · ${active.id}\` |` : "| Active revision | `Legacy project · no snapshot` |",
    `| Clearance items | ${summary.total_items} |`,
    `| **Unscripted items** | **${summary.unscripted_items}** |`,
    `| Sources cited | ${summary.total_citations} |`,
    `| Resolved by a human | ${summary.resolved_items} |`,
    `| **AI-issued approvals** | **${summary.ai_issued_approvals}** |`,
    "",
  );
  const ordered = [...project.items].sort((left, right) =>
    (PRIORITY[left.workflow_status] ?? 3) - (PRIORITY[right.workflow_status] ?? 3)
    || left.name.localeCompare(right.name)
  );
  for (const item of ordered) lines.push(...itemMarkdown(project, item));
  return lines.join("\n");
}
