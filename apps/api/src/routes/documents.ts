import { extname } from "node:path";

import type { Hono } from "hono";

import { DocumentMetadataPatchSchema, type ProductionDocument } from "@clearcut/contracts";

import type { ApiDependencies, ClearCutEnv } from "../context";
import { ApiProblem } from "../middleware/errors";
import { commaList, documentScope, patchDocument, requireDocument } from "../services/documents";
import { audit, requireItem } from "../services/items";

const DOCUMENT_KINDS = new Set(["release", "license", "permit", "correspondence", "other"]);

function booleanField(value: FormDataEntryValue | FormDataEntryValue[] | undefined): boolean {
  return typeof value === "string" && value.toLocaleLowerCase() === "true";
}

function stringField(value: FormDataEntryValue | FormDataEntryValue[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export function registerDocumentRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.post("/api/projects/:projectId/items/:itemId/documents", async (context) => {
    const project = await dependencies.repository.require(context.req.param("projectId"));
    const item = requireItem(project, context.req.param("itemId"));
    const body = await context.req.parseBody();
    if (!(body.file instanceof File)) throw new ApiProblem(422, "file_required", "Choose a production document.");
    if (body.file.size > dependencies.config.maxUploadBytes) throw new ApiProblem(413, "too_large", "Document is too large.");
    const kind = stringField(body.kind) || "license";
    if (!DOCUMENT_KINDS.has(kind)) throw new ApiProblem(422, "unsupported_document_type", "Unsupported document type.");
    const suffix = extname(body.file.name).toLocaleLowerCase().replace(/[^.a-z0-9]/g, "");
    const asset = await dependencies.assetStore.put(body.file.stream(), {
      key: `projects/${project.id}/documents/${crypto.randomUUID()}${suffix}`,
      filename: body.file.name || "document",
      contentType: body.file.type || "application/octet-stream",
      sizeBytes: body.file.size,
    });
    const timestamp = new Date().toISOString();
    const document: ProductionDocument = {
      id: `doc_${crypto.randomUUID()}`,
      kind: kind as ProductionDocument["kind"],
      title: stringField(body.title).trim() || body.file.name || "Untitled document",
      notes: stringField(body.notes).trim(),
      covers_territory: stringField(body.covers_territory),
      covers_term: stringField(body.covers_term),
      covers_media: stringField(body.covers_media),
      original_filename: asset.filename,
      mime_type: asset.contentType,
      size_bytes: asset.sizeBytes,
      storage_key: asset.key,
      media: commaList(stringField(body.media)),
      territories: commaList(stringField(body.territories)),
      starts_on: stringField(body.starts_on) || null,
      ends_on: stringField(body.ends_on) || null,
      perpetual: booleanField(body.perpetual),
      covered_use: stringField(body.covered_use).trim(),
      attached_at: timestamp,
      attached_by: stringField(body.attached_by).trim(),
    };
    item.documents.push(document);
    item.audit_events.push(audit({
      actor: "coordinator",
      actorName: document.attached_by,
      action: "document_attached",
      rationale: `Attached ${document.kind}: ${document.title}`,
      sourceVersion: item.source_version,
      detail: { document_id: document.id },
    }));
    project.updated_at = timestamp;
    await dependencies.repository.save(project);
    return context.json({ item_id: item.id, document, scope: documentScope(project, document) });
  });

  app.get("/api/projects/:projectId/items/:itemId/documents/:documentId", async (context) => {
    const project = await dependencies.repository.require(context.req.param("projectId"));
    const document = requireDocument(project, context.req.param("itemId"), context.req.param("documentId"));
    if (!document.storage_key) throw new ApiProblem(404, "document_asset_missing", "Document asset is missing.");
    const asset = await dependencies.assetStore.read(document.storage_key);
    const filename = document.original_filename.replaceAll('"', "") || "document";
    return new Response(asset.body, {
      headers: {
        "content-type": document.mime_type,
        "content-length": String(asset.sizeBytes),
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  app.patch("/api/projects/:projectId/items/:itemId/documents/:documentId", async (context) => {
    const patch = DocumentMetadataPatchSchema.parse(await context.req.json());
    const project = await dependencies.repository.require(context.req.param("projectId"));
    const document = patchDocument(project, context.req.param("itemId"), context.req.param("documentId"), patch);
    project.updated_at = new Date().toISOString();
    await dependencies.repository.save(project);
    return context.json({ item_id: context.req.param("itemId"), document, scope: documentScope(project, document) });
  });

  app.delete("/api/projects/:projectId/items/:itemId/documents/:documentId", async (context) => {
    const project = await dependencies.repository.require(context.req.param("projectId"));
    const item = requireItem(project, context.req.param("itemId"));
    const document = requireDocument(project, item.id, context.req.param("documentId"));
    if (document.storage_key) await dependencies.assetStore.delete(document.storage_key);
    item.documents = item.documents.filter((candidate) => candidate.id !== document.id);
    item.audit_events.push(audit({
      actor: "coordinator",
      action: "document_removed",
      rationale: `Removed ${document.title} from the recorded evidence.`,
      sourceVersion: item.source_version,
      detail: { document_id: document.id },
    }));
    project.updated_at = new Date().toISOString();
    await dependencies.repository.save(project);
    return new Response(null, { status: 204 });
  });
}
