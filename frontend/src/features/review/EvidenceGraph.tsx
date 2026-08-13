import type { ClearanceItem } from "../../types";
import { formatTimecode } from "../../types";


export type EvidenceKind =
  | "anchor"
  | "relationship"
  | "identity"
  | "holders"
  | "routes"
  | "sources"
  | "documents"
  | "gaps"
  | "actions";

export interface EvidenceNode {
  id: string;
  kind: EvidenceKind;
  label: string;
  summary: string;
  detail: React.ReactNode;
}

interface Props {
  item: ClearanceItem;
  selectedNodeId?: string;
  onSelectNode?: (node: EvidenceNode) => void;
}

export function evidenceNodes(item: ClearanceItem): EvidenceNode[] {
  const firstCut = item.cut_detections[0];
  const firstScript = item.script_references[0];
  const anchor = firstCut
    ? {
        label: `Frame ${formatTimecode(firstCut.timecode.start)}`,
        summary: `${firstCut.modality} · ${firstCut.observation}`,
        detail: item.cut_detections.map((detection, index) => (
          <p key={index}>
            {formatTimecode(detection.timecode.start)}–{formatTimecode(detection.timecode.end)} · {detection.observation}
          </p>
        )),
      }
    : {
        label: firstScript ? `Script scene ${firstScript.scene_index}` : "Source reference",
        summary: firstScript?.scene_heading || "No source anchor recorded",
        detail: firstScript?.excerpt || "No source detail recorded.",
      };
  const relationship =
    item.provenance === "cut_only"
      ? "None — unscripted; entered through production"
      : item.provenance === "both"
        ? "Present in the screenplay and rough cut"
        : "Screenplay only; not detected in this cut";
  const nodes: EvidenceNode[] = [
    { id: "anchor", kind: "anchor", ...anchor },
    {
      id: "relationship",
      kind: "relationship",
      label: "Script → cut relationship",
      summary: relationship,
      detail: relationship,
    },
    {
      id: "identity",
      kind: "identity",
      label: item.name,
      summary: item.category,
      detail: item.description,
    },
  ];
  if (item.candidate_rights_holders.length) {
    nodes.push({
      id: "holders",
      kind: "holders",
      label: `Candidate rights holders · ${item.candidate_rights_holders.length}`,
      summary: item.candidate_rights_holders.map((holder) => holder.name).join(", "),
      detail: item.candidate_rights_holders.map((holder, index) => (
        <div key={`${holder.name}-${index}`} className="graph-detail-row">
          <strong>{holder.name}</strong>
          <span>{holder.role || "Role not established"} · {holder.confidence} confidence</span>
          {holder.basis && <p>{holder.basis}</p>}
        </div>
      )),
    });
  }
  if (item.licensing_routes.length) {
    nodes.push({
      id: "routes",
      kind: "routes",
      label: `Licensing routes · ${item.licensing_routes.length}`,
      summary: item.licensing_routes.map((route) => route.organization).join(", "),
      detail: item.licensing_routes.map((route, index) => (
        <div key={`${route.organization}-${index}`} className="graph-detail-row">
          <strong>{route.organization}</strong>
          <span>{route.route}</span>
          {route.contact && <p>{route.contact}</p>}
        </div>
      )),
    });
  }
  if (item.sources.length) {
    nodes.push({
      id: "sources",
      kind: "sources",
      label: `Public sources · ${item.sources.length}`,
      summary: "Open the source ledger for citations and retrieval context.",
      detail: `${item.sources.length} cited public sources`,
    });
  }
  if (item.documents.length) {
    nodes.push({
      id: "documents",
      kind: "documents",
      label: `Production documents · ${item.documents.length}`,
      summary: item.documents.map((document) => document.title).join(", "),
      detail: item.documents.map((document) => document.title).join(", "),
    });
  }
  if (item.evidence_gaps.length) {
    nodes.push({
      id: "gaps",
      kind: "gaps",
      label: `Evidence gaps · ${item.evidence_gaps.length}`,
      summary: item.evidence_gaps[0],
      detail: (
        <ul>{item.evidence_gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
      ),
    });
  }
  if (item.recommended_actions.length) {
    nodes.push({
      id: "actions",
      kind: "actions",
      label: "Recommended human action",
      summary: item.recommended_actions[0],
      detail: (
        <ol>{item.recommended_actions.map((action, index) => <li key={index}>{action}</li>)}</ol>
      ),
    });
  }
  return nodes;
}

export default function EvidenceGraph({ item, selectedNodeId, onSelectNode }: Props) {
  const nodes = evidenceNodes(item);
  return (
    <div className="evidence-graph" aria-label={`Evidence relationship for ${item.name}`}>
      {nodes.map((node, index) => (
        <div className="evidence-graph__branch" key={node.id}>
          {index > 0 && <span className="evidence-graph__edge" aria-hidden="true" />}
          <button
            type="button"
            className={selectedNodeId === node.id ? "is-selected" : ""}
            style={{ "--node-index": index } as React.CSSProperties}
            onClick={() => onSelectNode?.(node)}
          >
            <span>{node.label}</span>
            <small>{node.summary}</small>
          </button>
        </div>
      ))}
    </div>
  );
}
