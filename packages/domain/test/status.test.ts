import { describe, expect, test } from "bun:test";

import { applyDisposition, DomainError } from "../src";
import { item } from "./helpers";

describe("clearance status ownership", () => {
  test("agent cannot issue a coordinator disposition", () => {
    expect(() => applyDisposition(item(), {
      actor: "agent",
      status: "coordinator_verified",
      rationale: "Research complete.",
    })).toThrow(new DomainError("human_owned_status", "Agent and system actors cannot record a human disposition."));
  });

  test("late agent research preserves a human outcome", () => {
    const reviewed = item({
      workflow_status: "counsel_approved",
      audit_events: [{
        id: "evt_human",
        at: "2026-08-24T13:00:00Z",
        actor: "counsel",
        actor_name: "Mara Chen",
        action: "status_change",
        from_status: "evidence_ready",
        to_status: "counsel_approved",
        rationale: "Reviewed with counsel.",
        source_version: "cut_fixture",
        detail: {},
      }],
    });

    const result = applyDisposition(reviewed, {
      actor: "agent",
      status: "evidence_ready",
      rationale: "A new public source arrived.",
    });

    expect(result.workflow_status).toBe("counsel_approved");
    expect(result.audit_events).toHaveLength(1);
  });

  test("documented permission requires a document owned by the case", () => {
    expect(() => applyDisposition(item(), {
      actor: "coordinator",
      status: "documented_permission",
      rationale: "Permission is recorded.",
      document_ids: ["doc_other"],
    })).toThrow(new DomainError("supporting_document_required", "Select a supporting document attached to this case."));
  });
});
