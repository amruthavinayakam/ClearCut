import { describe, expect, test } from "bun:test";

import { packetReadiness, recordPacketExport } from "../src";
import { readyProject } from "./helpers";

describe("packet rules", () => {
  test("readiness reports incomplete research and recorded scope gaps", () => {
    const project = readyProject();
    project.use_profile = { media: ["streaming"], territories: ["US"], starts_on: null, ends_on: null };
    project.items[0].workflow_status = "reopened_by_revision";
    project.items[0].research_error = "Updated use has not been researched.";
    project.items[0].documents = [{
      id: "doc_festival",
      kind: "license",
      title: "Festival licence",
      notes: "",
      covers_territory: "US",
      covers_term: "Perpetual",
      covers_media: "festival",
      original_filename: "festival.pdf",
      mime_type: "application/pdf",
      size_bytes: 120,
      storage_key: "documents/festival.pdf",
      media: ["festival"],
      territories: ["US"],
      starts_on: null,
      ends_on: null,
      perpetual: true,
      covered_use: "",
      attached_at: "2026-08-24T13:00:00Z",
      attached_by: "Mara Chen",
    }];

    expect(packetReadiness(project)).toEqual({
      ready: false,
      incomplete_item_ids: ["item_brand"],
      scope_gaps: [{
        item_id: "item_brand",
        document_id: "doc_festival",
        gaps: ["Streaming is not listed in recorded media."],
      }],
    });
  });

  test("confirmed export is idempotent by request id", () => {
    const project = readyProject();
    const once = recordPacketExport(project, "export-1");
    const twice = recordPacketExport(once, "export-1");

    expect(twice.audit_events.filter((event) => event.action === "packet_exported")).toHaveLength(1);
    expect(project.audit_events).toHaveLength(0);
  });
});
