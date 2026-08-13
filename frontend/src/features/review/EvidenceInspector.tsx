import { useRef, useState } from "react";

import StatusMark from "../../components/StatusMark";
import type { ClearanceItem } from "../../types";
import { CATEGORY_LABEL, STATUS_LABEL } from "../../types";
import EvidenceGraph, { evidenceNodes, type EvidenceNode } from "./EvidenceGraph";
import SourceLedger from "./SourceLedger";


export default function EvidenceInspector({ item }: { item: ClearanceItem }) {
  const nodes = evidenceNodes(item);
  const [selected, setSelected] = useState<EvidenceNode>(nodes[0]);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const ledgerTrigger = useRef<HTMLButtonElement | null>(null);

  function selectNode(node: EvidenceNode) {
    setSelected(node);
    if (node.kind === "sources") setLedgerOpen(true);
  }

  return (
    <aside className="evidence-inspector" aria-label={`Evidence for ${item.name}`}>
      <header>
        <div>
          <p className="eyebrow">{CATEGORY_LABEL[item.category] ?? item.category}</p>
          <h2>{item.name}</h2>
        </div>
        <StatusMark label={STATUS_LABEL[item.workflow_status]} tone={item.color} />
      </header>
      <EvidenceGraph
        item={item}
        selectedNodeId={selected.id}
        onSelectNode={(node) => {
          if (node.kind === "sources") ledgerTrigger.current = document.activeElement as HTMLButtonElement;
          selectNode(node);
        }}
      />
      <section className="evidence-node-detail" aria-live="polite">
        <p className="eyebrow">Selected relationship</p>
        <h3>{selected.label}</h3>
        <div>{selected.detail}</div>
      </section>
      <p className="human-boundary">Research only. A human records every legal disposition.</p>
      <SourceLedger
        item={item}
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        returnFocusRef={ledgerTrigger}
      />
    </aside>
  );
}
