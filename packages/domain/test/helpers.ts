import fixture from "../../../fixtures/project-ready.json";
import { ProjectSchema, type ClearanceItem, type Project } from "@clearcut/contracts";

export function readyProject(): Project {
  return ProjectSchema.parse(structuredClone(fixture));
}

export function item(overrides: Partial<ClearanceItem> = {}): ClearanceItem {
  const source = readyProject().items[0];
  return {
    ...structuredClone(source),
    id: overrides.id ?? crypto.randomUUID(),
    stable_item_id: overrides.stable_item_id ?? crypto.randomUUID(),
    audit_events: [],
    documents: [],
    ...overrides,
  };
}
