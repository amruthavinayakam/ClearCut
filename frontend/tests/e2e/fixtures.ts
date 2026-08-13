import type { Page, Route } from "@playwright/test";

import type {
  ClearanceItem,
  ProductionDocument,
  Project,
  ProjectRevision,
  RevisionChange,
  WorkflowStatus,
} from "../../src/types";


const NOW = "2026-08-13T12:00:00Z";

function item(
  id: string,
  name: string,
  category: string,
  status: WorkflowStatus,
  at: number,
  options: Partial<ClearanceItem> = {},
): ClearanceItem {
  const color = status.startsWith("reopened") || ["detected", "researching", "unresolved"].includes(status)
    ? "red"
    : status === "evidence_ready"
      ? "amber"
      : status === "coordinator_verified"
        ? "blue"
        : ["documented_permission", "counsel_approved", "approved_replacement"].includes(status)
          ? "green"
          : "gray";
  return {
    id,
    stable_item_id: `stable_${id}`,
    name,
    category,
    description: `${name} appears in the current cut.`,
    provenance: "cut_only",
    source_version: "rough-cut-v1",
    script_references: [],
    cut_detections: [{
      timecode: { start: at, end: at + 4 },
      representative_time: at + 1,
      modality: "visual",
      observation: `${name} visible in frame.`,
      confidence: "high",
      scene_match: null,
      expected_from_script: false,
    }],
    detection_confidence: "high",
    research_priority: "high",
    production_impact: "Review before delivery.",
    workflow_status: status,
    candidate_rights_holders: [{
      name: `${name} Rights LLC`,
      role: "candidate administrator",
      rights_implicated: ["display"],
      share: "",
      confidence: "medium",
      basis: "Public catalogue record.",
    }],
    licensing_routes: [],
    sources: [{
      url: `https://example.test/${id}`,
      title: `${name} catalogue`,
      excerpt: "Public catalogue record.",
      publish_date: null,
      retrieved_at: NOW,
      via: "parallel_search",
      field: "rights holder",
    }],
    evidence_gaps: ["Direct authority has not been confirmed."],
    unresolved_questions: [],
    recommended_actions: ["Confirm authority with production counsel."],
    research_summary: "Cited public records identify a candidate route; authority remains unconfirmed.",
    research_error: null,
    task_run_id: null,
    documents: [],
    monitor_id: null,
    assigned_to: "",
    draft_request: null,
    audit_events: [],
    color,
    citation_count: 1,
    is_resolved: ["documented_permission", "counsel_approved", "approved_replacement", "false_positive"].includes(status),
    ...options,
  };
}

const document: ProductionDocument = {
  id: "doc_fixture",
  kind: "license",
  title: "Festival licence",
  notes: "Countersigned copy",
  covers_territory: "",
  covers_term: "",
  covers_media: "",
  original_filename: "festival-licence.pdf",
  mime_type: "application/pdf",
  size_bytes: 24,
  storage_key: "a".repeat(32),
  media: ["festival"],
  territories: ["US"],
  starts_on: null,
  ends_on: null,
  perpetual: true,
  covered_use: "",
  attached_at: NOW,
  attached_by: "Mara Chen",
};

function summary(items: ClearanceItem[]): Project["summary"] {
  const colors = { red: 0, amber: 0, blue: 0, green: 0, gray: 0 };
  items.forEach((value) => { colors[value.color] += 1; });
  return {
    colors,
    by_category: Object.fromEntries(items.map((value) => [value.category, 1])),
    total_items: items.length,
    unscripted_items: items.filter((value) => value.provenance === "cut_only").length,
    resolved_items: items.filter((value) => value.is_resolved).length,
    total_citations: new Set(items.flatMap((value) => value.sources.map((source) => source.url))).size,
    reconciliation: { in_both: 0, script_only: 0, cut_only: items.length, materially_changed: 0, approval_stale: 0 },
    ai_issued_approvals: 0,
  };
}

export interface FixtureState {
  project: Project;
  previousRevision: ProjectRevision;
  candidateRevision: ProjectRevision;
  exports: number;
  created: boolean;
}

export function fixtureState(): FixtureState {
  const items = [
    item("item_art", "Harbor Lights, 1961", "artwork", "evidence_ready", 12),
    item("item_brand", "Northstar Cola", "brand", "coordinator_verified", 28),
    item("item_music", "Midnight Orchard", "music", "documented_permission", 44, { documents: [document] }),
  ];
  const project: Project = {
    id: "proj_fixture",
    title: "Night Drive",
    created_at: NOW,
    updated_at: NOW,
    archived_at: null,
    phase: "ready",
    error: null,
    script: {
      id: "script_1", label: "script-v1", filename: "night-drive.fountain", title: "Night Drive",
      page_count: 92, scene_count: 54, storage_key: "b".repeat(32), mime_type: "text/plain", size_bytes: 8000,
    },
    cut: {
      id: "cut_1", label: "rough-cut-v1", filename: "night-drive-v1.mp4", duration_s: 80,
      media_url: "/api/projects/proj_fixture/cut", storage_key: "c".repeat(32), mime_type: "video/mp4", size_bytes: 12000,
    },
    items,
    reconciliation: [],
    audit_events: [],
    activity_events: [{ id: "activity_1", at: NOW, phase: "ready", message: "Evidence ready for review.", detail: {} }],
    use_profile: { media: ["streaming"], territories: ["US"], starts_on: null, ends_on: null },
    active_revision_id: "revision_1",
    summary: summary(items),
  };
  const previousRevision: ProjectRevision = {
    id: "revision_1", sequence: 1, script: project.script, cut: project.cut, state: "applied",
    items: structuredClone(items), changes: [], predecessor_id: null, created_at: NOW, applied_at: NOW, error: null,
  };
  const candidateItems = [
    structuredClone(items[1]),
    item("item_art_v2", "Harbor Lights, 1961", "artwork", "evidence_ready", 18, { stable_item_id: items[0].stable_item_id }),
    item("item_poster", "Harbor Festival poster", "artwork", "detected", 60),
    item("item_music_v2", "Midnight Orchard", "music", "documented_permission", 50, { stable_item_id: items[2].stable_item_id, documents: [document] }),
  ];
  const changes: RevisionChange[] = [
    { kind: "unchanged", stable_item_id: items[1].stable_item_id, item_name: items[1].name, before_item_id: items[1].id, after_item_id: items[1].id, explanation: "Identity and anchors are unchanged.", match_basis: "normalized category and name", previous_status: items[1].workflow_status },
    { kind: "materially_changed", stable_item_id: items[0].stable_item_id, item_name: items[0].name, before_item_id: items[0].id, after_item_id: "item_art_v2", explanation: "The artwork occupies a different use in the candidate cut.", match_basis: "explicit stable identity", previous_status: items[0].workflow_status },
    { kind: "added", stable_item_id: "stable_item_poster", item_name: "Harbor Festival poster", before_item_id: null, after_item_id: "item_poster", explanation: "New clearance element in the candidate revision.", match_basis: "no safe predecessor match", previous_status: null },
    { kind: "decision_stale", stable_item_id: items[2].stable_item_id, item_name: items[2].name, before_item_id: items[2].id, after_item_id: "item_music_v2", explanation: "The documented use moved in the candidate cut.", match_basis: "normalized category and name", previous_status: items[2].workflow_status },
  ];
  const candidateRevision: ProjectRevision = {
    id: "revision_2", sequence: 2, script: project.script,
    cut: { ...project.cut, id: "cut_2", label: "rough-cut-v2", filename: "night-drive-v2.mp4", duration_s: 86 },
    state: "ready", items: candidateItems, changes, predecessor_id: previousRevision.id,
    created_at: NOW, applied_at: null, error: null,
  };
  return { project, previousRevision, candidateRevision, exports: 0, created: false };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

export async function installFixtureApi(page: Page, state = fixtureState()): Promise<FixtureState> {
  // Match only root API requests. A broad `**/api/**` glob also intercepts the
  // application's `/src/api/client.ts` module in Vite and prevents React from
  // mounting at all.
  await page.route(/^https?:\/\/[^/]+\/api(?:\/|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === "/api/config") return json(route, {
      mock_research: false, parallel_configured: true, vertex: true, project: "fixture-project",
      search_mode: "one-shot", processor: "core", gcs_bucket: null, webhooks_enabled: false, sample_available: false,
    });
    if (path === "/api/projects" && method === "GET") return json(route, { projects: state.created || url.searchParams.has("include_archived") ? [{
      id: state.project.id, title: state.project.title, phase: state.project.phase, created_at: NOW, updated_at: NOW,
      script_label: state.project.script?.label ?? null, cut_label: state.project.cut?.label ?? null,
      unresolved_count: state.project.items.filter((value) => !value.is_resolved).length,
      total_items: state.project.items.length, state_label: "Needs review", archived_at: null,
    }] : [] });
    if (path === "/api/uploads/preflight") {
      const text = request.postData() ?? "";
      const cut = /\.mp4|video\/mp4/i.test(text);
      return json(route, {
        kind: cut ? "cut" : "screenplay", filename: cut ? "revision.mp4" : "screenplay.fountain",
        mime_type: cut ? "video/mp4" : "text/plain", size_bytes: 24, accepted: true,
        details: cut ? { duration_s: 80 } : { title: "Night Drive", page_count: 92, scene_count: 54, readable_text: true }, errors: [],
      });
    }
    if (path === "/api/projects" && method === "POST") {
      state.created = true;
      state.project = { ...state.project, phase: "researching", title: "First Light" };
      return json(route, state.project);
    }
    if (path.endsWith("/stream")) {
      state.project = { ...state.project, phase: "ready", title: state.project.title, summary: summary(state.project.items) };
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: `data: ${JSON.stringify({ type: "snapshot", project: state.project })}\n\ndata: ${JSON.stringify({ type: "done", phase: "ready" })}\n\n`,
      });
    }
    if (path.endsWith("/monitors")) return json(route, { monitors: [] });
    if (path.endsWith("/cut")) return route.fulfill({ status: 200, contentType: "video/mp4", body: "" });
    if (path.endsWith("/packet-exports") && method === "POST") {
      state.exports += 1;
      state.project.audit_events.push({ id: `export_${state.exports}`, at: NOW, actor: "coordinator", actor_name: "", action: "packet_exported", from_status: null, to_status: null, rationale: "Exported", source_version: "rough-cut-v1" });
      return route.fulfill({ status: 200, contentType: "text/markdown", body: "# Clearance Research Packet — Night Drive" });
    }
    if (path.endsWith("/revisions") && method === "POST") return json(route, state.candidateRevision);
    if (path.endsWith(`/revisions/${state.previousRevision.id}`) && method === "GET") return json(route, state.previousRevision);
    if (path.endsWith(`/revisions/${state.candidateRevision.id}/apply`) && method === "POST") {
      state.candidateRevision.state = "applied";
      state.candidateRevision.applied_at = NOW;
      state.project.active_revision_id = state.candidateRevision.id;
      state.project.cut = state.candidateRevision.cut;
      state.project.items = state.candidateRevision.items.map((value) => {
        const changed = state.candidateRevision.changes.find((change) => change.stable_item_id === value.stable_item_id);
        return changed?.kind === "materially_changed" || changed?.kind === "decision_stale"
          ? { ...value, workflow_status: "reopened_by_revision" as const, color: "red" as const, is_resolved: false }
          : value;
      });
      state.project.summary = summary(state.project.items);
      return json(route, { revision: state.candidateRevision, project: state.project, already_applied: false });
    }
    if (path.endsWith(`/revisions/${state.candidateRevision.id}`) && method === "GET") return json(route, state.candidateRevision);
    if (path.match(/\/items\/[^/]+\/documents$/) && method === "POST") {
      const itemId = path.split("/").at(-2) ?? "";
      const target = state.project.items.find((value) => value.id === itemId);
      if (target) target.documents = [document];
      return json(route, {
        item_id: itemId, document,
        scope: { outcome: "partial", gaps: ["Streaming is not listed in recorded media."] },
      });
    }
    if (path.match(/\/items\/[^/]+\/documents\/[^/]+$/) && method === "GET") {
      return route.fulfill({ status: 200, contentType: "application/pdf", body: "permission" });
    }
    if (path.match(/\/items\/[^/]+\/status$/) && method === "POST") {
      const itemId = path.split("/").at(-2) ?? "";
      const body = request.postDataJSON() as { status: WorkflowStatus };
      const target = state.project.items.find((value) => value.id === itemId);
      if (target) target.workflow_status = body.status;
      return json(route, { item_id: itemId, status: body.status });
    }
    if (path.includes("/revisions/") && method === "GET") return json(route, state.candidateRevision);
    if (path === `/api/projects/${state.project.id}` && method === "GET") return json(route, state.project);
    if (path === `/api/projects/${state.project.id}/use-profile` && method === "PATCH") return json(route, { use_profile: state.project.use_profile });
    if (path.includes("/coordination") && method === "PATCH") return json(route, { item_id: "item_art", assigned_to: "Mara" });
    return json(route, { detail: `Unhandled fixture route: ${method} ${path}` }, 404);
  });
  return state;
}
