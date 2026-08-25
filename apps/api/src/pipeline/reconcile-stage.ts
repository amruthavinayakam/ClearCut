import {
  ClearanceItemSchema,
  type ClearanceItem,
  type ReconciliationFinding,
} from "@clearcut/contracts";
import type { CutCandidate, GeminiClient, ScriptCandidate } from "@clearcut/integrations";

function stableId(name: string, category: string): string {
  const normalized = `${category}-${name}`.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `stable_${normalized.slice(0, 80)}`;
}

function emptyItem(input: {
  name: string;
  category: ClearanceItem["category"];
  description: string;
  provenance: ClearanceItem["provenance"];
  sourceVersion: string;
  confidence: ClearanceItem["detection_confidence"];
  priority: ClearanceItem["research_priority"];
  productionImpact: string;
}): ClearanceItem {
  return ClearanceItemSchema.parse({
    id: `item_${crypto.randomUUID()}`,
    stable_item_id: stableId(input.name, input.category),
    name: input.name,
    category: input.category,
    description: input.description,
    provenance: input.provenance,
    source_version: input.sourceVersion,
    script_references: [],
    cut_detections: [],
    detection_confidence: input.confidence,
    research_priority: input.priority,
    production_impact: input.productionImpact,
    workflow_status: "detected",
    candidate_rights_holders: [],
    licensing_routes: [],
    sources: [],
    evidence_gaps: [],
    unresolved_questions: [],
    recommended_actions: [],
    research_summary: "",
    research_error: null,
    task_run_id: null,
    documents: [],
    monitor_id: null,
    assigned_to: "",
    draft_request: null,
    audit_events: [],
    color: "red",
    citation_count: 0,
    is_resolved: false,
  });
}

function detection(candidate: CutCandidate, expected: boolean, duration: number) {
  const start = Math.min(Math.max(candidate.start_seconds, 0), duration);
  const end = Math.min(Math.max(candidate.end_seconds, start), duration);
  const representative = Math.min(Math.max(candidate.representative_seconds, start), end);
  return {
    timecode: { start, end },
    representative_time: representative,
    modality: candidate.modality,
    observation: candidate.observation,
    confidence: candidate.confidence,
    scene_match: null,
    expected_from_script: expected,
  };
}

export async function reconcileStage(input: {
  productionTitle: string;
  sourceVersion: string;
  durationSeconds: number;
  script: ScriptCandidate[];
  cut: CutCandidate[];
  gemini: GeminiClient;
}): Promise<{ items: ClearanceItem[]; findings: ReconciliationFinding[] }> {
  if (input.cut.length === 0) {
    const items = input.script.map((script) => {
      const item = emptyItem({
        name: script.name,
        category: script.category,
        description: script.description,
        provenance: "script_only",
        sourceVersion: input.sourceVersion,
        confidence: script.confidence,
        priority: script.priority,
        productionImpact: script.production_impact,
      });
      item.script_references.push({
        scene_index: script.scene_index,
        scene_heading: script.scene_heading,
        page: script.page,
        excerpt: script.excerpt,
        usage_note: script.usage_note,
      });
      return item;
    });
    return {
      items,
      findings: items.map((item) => ({
        kind: "script_only",
        item_id: item.id,
        item_name: item.name,
        explanation: "No rough cut was supplied for comparison.",
      })),
    };
  }

  const result = await input.gemini.reconcile({
    productionTitle: input.productionTitle,
    script: input.script,
    cut: input.cut,
  });
  const usedScript = new Set<number>();
  const usedCut = new Set<number>();
  const items: ClearanceItem[] = [];
  const findings: ReconciliationFinding[] = [];

  for (const match of result.matches) {
    const script = match.script_index == null ? null : input.script[match.script_index] ?? null;
    const cut = match.cut_index == null ? null : input.cut[match.cut_index] ?? null;
    if (script && usedScript.has(match.script_index!)) continue;
    if (cut && usedCut.has(match.cut_index!)) continue;
    if (!script && !cut) continue;
    if (script) usedScript.add(match.script_index!);
    if (cut) usedCut.add(match.cut_index!);
    const materiallyChanged = match.relationship === "materially_changed";
    const item = emptyItem({
      name: materiallyChanged && cut ? cut.name : script?.name ?? cut!.name,
      category: materiallyChanged && cut ? cut.category : script?.category ?? cut!.category,
      description: materiallyChanged && cut ? cut.description : script?.description ?? cut!.description,
      provenance: script && cut ? "both" : script ? "script_only" : "cut_only",
      sourceVersion: input.sourceVersion,
      confidence: cut?.confidence ?? script?.confidence ?? "medium",
      priority: cut && !script ? "high" : materiallyChanged ? "high" : script?.priority ?? "high",
      productionImpact: cut && !script
        ? "Entered through filmed material; no prior clearance research exists."
        : script?.production_impact ?? "Requires coordinator review.",
    });
    if (script) item.script_references.push({
      scene_index: script.scene_index,
      scene_heading: script.scene_heading,
      page: script.page,
      excerpt: script.excerpt,
      usage_note: script.usage_note,
    });
    if (cut) item.cut_detections.push(detection(cut, Boolean(script), input.durationSeconds));
    items.push(item);
    findings.push({
      kind: match.relationship,
      item_id: item.id,
      item_name: item.name,
      explanation: match.explanation,
    });
  }

  for (const [index, script] of input.script.entries()) {
    if (usedScript.has(index)) continue;
    const item = emptyItem({
      name: script.name, category: script.category, description: script.description,
      provenance: "script_only", sourceVersion: input.sourceVersion, confidence: script.confidence,
      priority: script.priority, productionImpact: script.production_impact,
    });
    item.script_references.push({ scene_index: script.scene_index, scene_heading: script.scene_heading, page: script.page, excerpt: script.excerpt, usage_note: script.usage_note });
    items.push(item);
    findings.push({ kind: "script_only", item_id: item.id, item_name: item.name, explanation: "Present in the screenplay but not detected in this cut." });
  }
  for (const [index, cut] of input.cut.entries()) {
    if (usedCut.has(index)) continue;
    const item = emptyItem({
      name: cut.name, category: cut.category, description: cut.description, provenance: "cut_only",
      sourceVersion: input.sourceVersion, confidence: cut.confidence, priority: "high",
      productionImpact: "Entered through filmed material; no prior clearance research exists.",
    });
    item.cut_detections.push(detection(cut, false, input.durationSeconds));
    items.push(item);
    findings.push({ kind: "cut_only", item_id: item.id, item_name: item.name, explanation: "Not in the screenplay—entered through production and has never been researched." });
  }
  return { items, findings };
}
