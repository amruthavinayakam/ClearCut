# ClearCut Next.js + Bun + Cloudflare Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Vite/FastAPI application with a behaviorally complete Next.js product and Bun API deployed Cloudflare-first, while preserving every existing clearance workflow and human-review invariant.

**Architecture:** A Bun workspace separates shared Zod contracts, pure domain logic, the Next.js App Router application, a Hono API running on Bun, and a thin Cloudflare edge Worker. Local development uses Portless with memory/filesystem adapters; production uses OpenNext Workers, one named Bun Container, D1, and R2 with direct browser uploads.

**Tech Stack:** Bun, TypeScript, Next.js 16.2+, React 19, Hono, Zod, Tailwind CSS v4, shadcn/ui Base UI primitives, Geist Sans/Mono, Vitest, Bun test, Playwright, OpenNext for Cloudflare, Wrangler v4, Cloudflare Containers, D1, and R2.

**Spec:** `docs/superpowers/specs/2026-08-24-next-bun-technical-redesign-design.md`

## Global Constraints

- Use the latest stable Next.js release at scaffold time, at least 16.2 within the 16.x stable line; never use canary.
- Bun is the package manager, script runner, API runtime, and API test runner.
- Browser API requests are same-origin under `/api/*`; production API requests never enter a Next.js Route Handler.
- Local product URLs are `https://clearcut.lcl` and `https://clearcut-api.lcl`; no development command may emit `.localhost`.
- Production runs Next.js through `@opennextjs/cloudflare` and runs Hono with the Bun runtime inside one named Cloudflare Container.
- Production metadata is stored in D1 and assets in R2; local defaults are memory and an explicit filesystem directory.
- Large uploads go directly from the browser to R2 through short-lived scoped upload sessions.
- Agent/system actors can advance research only through `evidence_ready`; human outcomes require the existing actor, rationale, and document checks.
- Revision application uses the stored comparison, is predecessor-checked and idempotent, and never accepts a browser-authored change set.
- Packet preview creates no audit event; confirmed export creates exactly one audit event.
- Fixture research is visibly prefixed `MOCK:` and is never presented as live evidence.
- Use Geist Sans and Geist Mono only. The UI is ultraminimal, technical, neutral, and non-editorial: no serif, warm paper, gradients, glass, decorative card grids, or chat-first pipeline UI.
- The old application remains runnable until the replacement passes the complete release flow; compatibility code is removed in the cutover task.

## File and package map

```text
apps/web/                       Next.js routes, product shell, feature UI, browser state
apps/api/                       Bun/Hono routes, services, orchestration, local adapters
apps/edge/                      Cloudflare Worker route, Container class, binding bridge
packages/contracts/             Canonical Zod HTTP, SSE, repository, and integration shapes
packages/domain/                Pure workflow, scope, reconciliation, revision, packet rules
packages/integrations/          Gemini, Parallel, provider media-staging clients
packages/ui/                    ClearCut-owned shadcn primitives and semantic tokens
fixtures/                       Deterministic project, stream, research, and revision fixtures
infra/d1/                       Ordered D1 migrations
docs/superpowers/               Approved design and this execution plan
```

---

### Task 1: Establish the Bun workspace and canonical contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/project.ts`
- Create: `packages/contracts/src/api.ts`
- Create: `packages/contracts/src/events.ts`
- Create: `packages/contracts/test/contracts.test.ts`
- Create: `fixtures/project-ready.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `ProjectSchema`, `ProjectListItemSchema`, `ProjectRevisionSchema`, `MonitorRecordSchema`, `PreflightResultSchema`, `ApiErrorSchema`, and `ProjectStreamEventSchema`.
- Produces: inferred `Project`, `ProjectListItem`, `ProjectRevision`, `MonitorRecord`, `PreflightResult`, `ApiError`, and `ProjectStreamEvent` types.
- Consumes: current field names and enum values from `frontend/src/types.ts` and `backend/app/models.py` without translation.

- [ ] **Step 1: Write the failing contract fixture test**

```ts
import { describe, expect, test } from "bun:test";
import fixture from "../../../fixtures/project-ready.json";
import { ProjectSchema, ProjectStreamEventSchema } from "../src";

describe("shared contracts", () => {
  test("parses the ready-project parity fixture", () => {
    expect(ProjectSchema.parse(fixture).id).toBe("proj_fixture");
  });

  test("rejects untyped stream events", () => {
    expect(() => ProjectStreamEventSchema.parse({ type: "progress" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify the missing package failure**

Run: `bun test packages/contracts/test/contracts.test.ts`

Expected: FAIL because `packages/contracts/src` does not exist.

- [ ] **Step 3: Add the root workspace and contract schemas**

The root manifest must use these package names and scripts:

```json
{
  "name": "clearcut",
  "private": true,
  "packageManager": "bun@1.3.8",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "concurrently -k -n web,api 'bun --filter @clearcut/web dev' 'bun --filter @clearcut/api dev'",
    "typecheck": "bun --filter '*' typecheck",
    "lint": "bun --filter '*' lint",
    "test": "bun test packages apps",
    "test:e2e": "bun --filter @clearcut/web test:e2e",
    "build": "bun --filter @clearcut/api build && bun --filter @clearcut/web build",
    "cf:typegen": "bun --filter @clearcut/web cf:typegen && bun --filter @clearcut/edge cf:typegen",
    "cf:check": "bun --filter @clearcut/web cf:check && bun --filter @clearcut/edge cf:check"
  }
}
```

Every enum is a `z.enum`, object fields preserve the current snake_case wire format, dates remain ISO strings, nullable values use `.nullable()`, and external API objects use strict schemas. Export inferred types from `packages/contracts/src/index.ts`; do not retain a separate handwritten web type model.

- [ ] **Step 4: Run contract and TypeScript checks**

Run: `bun test packages/contracts/test/contracts.test.ts`

Expected: PASS with two tests.

Run: `bunx tsc -p packages/contracts/tsconfig.json --noEmit`

Expected: exit 0.

- [ ] **Step 5: Commit the workspace contract gate**

```bash
git add package.json tsconfig.base.json packages/contracts fixtures/project-ready.json .gitignore bun.lock
git commit -m "feat: establish Bun workspace contracts"
```

### Task 2: Port the pure safety and revision domain

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/src/status.ts`
- Create: `packages/domain/src/scope.ts`
- Create: `packages/domain/src/reconciliation.ts`
- Create: `packages/domain/src/revisions.ts`
- Create: `packages/domain/src/packet.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/test/status.test.ts`
- Create: `packages/domain/test/scope.test.ts`
- Create: `packages/domain/test/revisions.test.ts`
- Create: `packages/domain/test/packet.test.ts`

**Interfaces:**
- Consumes: contract types from `@clearcut/contracts`.
- Produces: `canActorSet(actor, status)`, `applyDisposition(item, change)`, `assessScope(intended, recorded)`, `compareRevisions(before, after)`, `applyRevision(project, revisionId, predecessorId)`, `packetReadiness(project)`, and `recordPacketExport(project, requestId)`.
- Throws: `ApprovalDenied`, `RevisionComparisonError`, and `RevisionConflictError` with stable machine codes.

- [ ] **Step 1: Write failing invariant tests**

```ts
import { describe, expect, test } from "bun:test";
import { applyDisposition, applyRevision, recordPacketExport } from "../src";
import fixture from "../../../fixtures/project-ready.json";

test("agent cannot issue a human disposition", () => {
  expect(() => applyDisposition(fixture.items[0], {
    actor: "agent", status: "coordinator_verified", rationale: "researched"
  })).toThrow("human_owned_status");
});

test("late research preserves a human outcome", () => {
  const item = { ...fixture.items[0], workflow_status: "counsel_approved" };
  expect(applyDisposition(item, {
    actor: "agent", status: "evidence_ready", rationale: "new source"
  }).workflow_status).toBe("counsel_approved");
});

test("packet export is idempotent by request id", () => {
  const once = recordPacketExport(structuredClone(fixture), "export-1");
  const twice = recordPacketExport(once, "export-1");
  expect(twice.audit_events.filter((event) => event.action === "packet_exported")).toHaveLength(1);
});
```

- [ ] **Step 2: Verify the domain tests fail**

Run: `bun test packages/domain/test`

Expected: FAIL on unresolved domain exports.

- [ ] **Step 3: Port rules as pure immutable functions**

Use exact signatures:

```ts
export type DispositionChange = {
  actor: Actor;
  actor_name?: string;
  status: WorkflowStatus;
  rationale: string;
  source_version?: string;
};

export function applyDisposition(item: ClearanceItem, change: DispositionChange): ClearanceItem;
export function assessScope(intended: IntendedUseProfile, recorded: DocumentScope): ScopeAssessment;
export function compareRevisions(before: ProjectRevision, items: ClearanceItem[]): RevisionChange[];
export function applyRevision(project: Project, revisionId: string, predecessorId: string | null): RevisionApplyResult;
export function recordPacketExport(project: Project, requestId: string): Project;
```

Port the behavior asserted by `backend/tests/test_scope.py`, `test_revisions.py`, `test_documents_api.py`, and `test_export_api.py`. Functions return new objects and never mutate caller-owned values.

- [ ] **Step 4: Run every domain test**

Run: `bun test packages/domain/test`

Expected: PASS, including actor ownership, rationale, document requirement, all five revision outcomes, predecessor conflict, idempotent application, carry-forward, and packet audit semantics.

- [ ] **Step 5: Commit the safety domain**

```bash
git add packages/domain
git commit -m "feat: port clearance safety domain"
```

### Task 3: Build local repositories, asset storage, and media parsing

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/repositories/project-repository.ts`
- Create: `apps/api/src/repositories/memory-project-repository.ts`
- Create: `apps/api/src/repositories/asset-store.ts`
- Create: `apps/api/src/repositories/filesystem-asset-store.ts`
- Create: `apps/api/src/media/screenplay.ts`
- Create: `apps/api/src/media/probe.ts`
- Create: `apps/api/test/repositories.test.ts`
- Create: `apps/api/test/screenplay.test.ts`
- Create: `fixtures/media/the_long_way_down.fountain`
- Create: `fixtures/media/the_long_way_down.pdf`
- Create: `fixtures/media/the_long_way_down_roughcut.mp4`

**Interfaces:**
- Produces: `ProjectRepository`, `MemoryProjectRepository`, `AssetStore`, and `FilesystemAssetStore`.
- Produces: `parseScreenplay(bytes, filename): Promise<ScreenplayDocument>` and `probeVideo(path): Promise<VideoMetadata>`.
- Consumes: `ProjectSchema` at every repository read/write boundary.

- [ ] **Step 1: Write failing repository and parser tests**

```ts
test("repository round-trips through the project schema", async () => {
  const repository = new MemoryProjectRepository();
  await repository.save(ProjectSchema.parse(fixture));
  expect((await repository.require(fixture.id)).title).toBe(fixture.title);
});

test("asset keys cannot escape the configured root", async () => {
  const store = new FilesystemAssetStore(tempRoot);
  await expect(store.read("../secret")).rejects.toThrow("invalid_asset_key");
});

test("fountain parsing preserves scene anchors", async () => {
  const result = await parseScreenplay(await Bun.file(fountainPath).bytes(), "sample.fountain");
  expect(result.scenes[0].heading).toMatch(/^INT\.|^EXT\./);
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `bun test apps/api/test/repositories.test.ts apps/api/test/screenplay.test.ts`

Expected: FAIL because the adapters are absent.

- [ ] **Step 3: Implement validated local adapters**

```ts
export interface ProjectRepository {
  list(options?: { includeArchived?: boolean }): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  require(id: string): Promise<Project>;
  save(project: Project): Promise<Project>;
}

export interface AssetStore {
  put(input: ReadableStream<Uint8Array>, metadata: AssetMetadata): Promise<StoredAsset>;
  stat(key: string): Promise<StoredAsset>;
  read(key: string, range?: ByteRange): Promise<AssetRead>;
  delete(key: string): Promise<void>;
  localPath?<T>(key: string, use: (path: string) => Promise<T>): Promise<T>;
}
```

Use Bun file streams, validated opaque keys, `pdfjs-dist` for PDF text extraction, Fountain/plain-text parsing ported from `backend/app/screenplay.py`, and `ffprobe` through `Bun.spawn` with argument arrays only.

- [ ] **Step 4: Run adapter tests and fixture probes**

Run: `bun test apps/api/test/repositories.test.ts apps/api/test/screenplay.test.ts`

Expected: PASS with filesystem traversal, overwrite, range, delete, PDF text-layer, plain text, Fountain, and unreadable-video coverage.

- [ ] **Step 5: Commit local persistence and parsing**

```bash
git add apps/api fixtures/media
git commit -m "feat: add Bun repositories and media parsing"
```

### Task 4: Add the Hono system, upload, and project lifecycle API

**Files:**
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/context.ts`
- Create: `apps/api/src/middleware/errors.ts`
- Create: `apps/api/src/middleware/request-id.ts`
- Create: `apps/api/src/routes/system.ts`
- Create: `apps/api/src/routes/uploads.ts`
- Create: `apps/api/src/routes/projects.ts`
- Create: `apps/api/src/routes/assets.ts`
- Create: `apps/api/src/services/projects.ts`
- Create: `apps/api/src/services/uploads.ts`
- Create: `apps/api/test/system.test.ts`
- Create: `apps/api/test/projects.test.ts`
- Create: `apps/api/test/uploads.test.ts`

**Interfaces:**
- Produces: `createApp(dependencies): Hono<ClearCutEnv>` and `startServer(config): Server`.
- Produces routes: `GET /api/health`, `GET /api/config`, `POST /api/uploads/preflight`, `POST /api/projects`, `POST /api/projects/sample`, `GET /api/projects`, `GET/PATCH /api/projects/:id`, and `GET /api/projects/:id/cut`.
- Consumes: repositories and parsers from Task 3 and contracts from Task 1.

- [ ] **Step 1: Write failing request-level tests**

```ts
test("health has the shared success shape", async () => {
  const response = await app.request("/api/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("invalid upload returns a stable ApiError", async () => {
  const body = new FormData();
  body.set("file", new File(["bad"], "payload.exe"));
  const response = await app.request("/api/uploads/preflight", { method: "POST", body });
  expect(ApiErrorSchema.parse(await response.json()).code).toBe("unsupported_type");
});
```

- [ ] **Step 2: Verify route tests fail**

Run: `bun test apps/api/test/system.test.ts apps/api/test/projects.test.ts apps/api/test/uploads.test.ts`

Expected: FAIL because `createApp` is absent.

- [ ] **Step 3: Implement the minimal lifecycle modules**

Each route parses input with Zod, delegates to a service, and parses output before returning it. `ApiError` is:

```ts
export type ApiError = {
  code: string;
  message: string;
  request_id: string;
  field_errors?: Record<string, string[]>;
  retry?: { allowed: boolean; after_ms?: number };
};
```

Local multipart uploads stream to `AssetStore`; project creation saves phase `created` before returning and starts analysis only through the injected job runner. Range requests return `206`, `Content-Range`, `Accept-Ranges`, and the exact requested bytes.

- [ ] **Step 4: Run the lifecycle test gate**

Run: `bun test apps/api/test/system.test.ts apps/api/test/projects.test.ts apps/api/test/uploads.test.ts`

Expected: PASS for config disclosure, upload limits, preflight errors, project creation/list/archive/restore, missing projects, sample creation, and cut byte ranges.

- [ ] **Step 5: Verify local Portless startup**

Run: `bun --filter @clearcut/api dev`

Expected: the API registers `https://clearcut-api.lcl`; `curl -sk https://clearcut-api.lcl/api/health` returns `{"status":"ok"}`.

- [ ] **Step 6: Commit the lifecycle API**

```bash
git add apps/api
git commit -m "feat: add Bun project lifecycle API"
```

### Task 5: Port documents, dispositions, scope, coordination, and packet export

**Files:**
- Create: `apps/api/src/routes/items.ts`
- Create: `apps/api/src/routes/documents.ts`
- Create: `apps/api/src/routes/packets.ts`
- Create: `apps/api/src/services/items.ts`
- Create: `apps/api/src/services/documents.ts`
- Create: `apps/api/src/services/packets.ts`
- Create: `apps/api/test/items.test.ts`
- Create: `apps/api/test/documents.test.ts`
- Create: `apps/api/test/packets.test.ts`

**Interfaces:**
- Produces current status, coordination, use-profile, document CRUD, scope, packet preview, and confirmed packet export routes.
- Consumes: Task 2 domain functions and Task 3 repositories.
- Maintains: current request and response field names consumed by the existing frontend client.

- [ ] **Step 1: Write failing human-ownership and audit tests**

```ts
test("agent disposition cannot cross evidence_ready", async () => {
  const response = await postStatus({ actor: "agent", status: "counsel_approved", rationale: "source" });
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("human_owned_status");
});

test("packet preview is read-only and export is idempotently audited", async () => {
  const before = await repository.require(projectId);
  await app.request(`/api/projects/${projectId}/packet.md`);
  expect((await repository.require(projectId)).audit_events).toEqual(before.audit_events);
  await exportPacket("request-1");
  await exportPacket("request-1");
  expect((await repository.require(projectId)).audit_events.filter(e => e.action === "packet_exported")).toHaveLength(1);
});
```

- [ ] **Step 2: Verify mutation tests fail**

Run: `bun test apps/api/test/items.test.ts apps/api/test/documents.test.ts apps/api/test/packets.test.ts`

Expected: FAIL on missing routes.

- [ ] **Step 3: Implement route/service modules**

Implement the existing endpoints from `backend/app/main.py:733-1035` and packet endpoints at `backend/app/main.py:444-479`. Store document metadata separately from bytes. Require a rationale for coordinator/counsel status changes, require qualifying documents for approval-like outcomes, preserve human status during late research, and create one audit event per accepted mutation.

- [ ] **Step 4: Run mutation and packet tests**

Run: `bun test apps/api/test/items.test.ts apps/api/test/documents.test.ts apps/api/test/packets.test.ts`

Expected: PASS for attach/download/update/delete, scope gaps, assignment, draft request, use profile, actor denial, rationale requirements, document requirements, and packet audit behavior.

- [ ] **Step 5: Commit the human workflow API**

```bash
git add apps/api
git commit -m "feat: port human clearance workflow"
```

### Task 6: Port immutable revisions and Version Ripple

**Files:**
- Create: `apps/api/src/routes/revisions.ts`
- Create: `apps/api/src/services/revisions.ts`
- Create: `apps/api/test/revisions.test.ts`
- Create: `fixtures/revision-comparison.json`

**Interfaces:**
- Produces: list/get/create/apply revision routes using `ProjectRevisionSchema` and `RevisionApplyResultSchema`.
- Consumes: `compareRevisions` and `applyRevision` from Task 2.
- Guarantees: stored comparisons, immutable candidates, predecessor checks, idempotent apply, and human-record carry-forward.

- [ ] **Step 1: Write failing revision API tests**

```ts
test("apply rejects a stale predecessor", async () => {
  const response = await applyCandidate("revision_from_another_tab");
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("revision_conflict");
});

test("repeating apply is idempotent", async () => {
  expect((await applyCandidate(activeRevision)).already_applied).toBe(false);
  expect((await applyCandidate(activeRevision)).already_applied).toBe(true);
});
```

- [ ] **Step 2: Verify revision tests fail**

Run: `bun test apps/api/test/revisions.test.ts`

Expected: FAIL on missing revision routes.

- [ ] **Step 3: Implement the revision service and routes**

`POST /revisions` stores a processing placeholder before analysis. `POST /revisions/:revisionId/apply` accepts only `{ predecessor_id }`; it loads the stored candidate and comparison, applies it once, marks the prior active state unchanged, reopens `added`, `materially_changed`, and `decision_stale` cases, and never accepts client changes.

- [ ] **Step 4: Run revision parity tests**

Run: `bun test packages/domain/test/revisions.test.ts apps/api/test/revisions.test.ts`

Expected: PASS for all five outcomes, candidate failures, predecessor conflict, idempotency, carry-forward, and audit history.

- [ ] **Step 5: Commit revisions**

```bash
git add apps/api fixtures/revision-comparison.json
git commit -m "feat: port immutable revision workflow"
```

### Task 7: Port Gemini, Parallel, pipeline orchestration, SSE, monitors, and copilot

**Files:**
- Create: `packages/integrations/package.json`
- Create: `packages/integrations/src/gemini/client.ts`
- Create: `packages/integrations/src/gemini/media-stager.ts`
- Create: `packages/integrations/src/parallel/client.ts`
- Create: `packages/integrations/src/index.ts`
- Create: `packages/integrations/test/gemini.test.ts`
- Create: `packages/integrations/test/parallel.test.ts`
- Create: `apps/api/src/pipeline/orchestrator.ts`
- Create: `apps/api/src/pipeline/screenplay-stage.ts`
- Create: `apps/api/src/pipeline/cut-stage.ts`
- Create: `apps/api/src/pipeline/reconcile-stage.ts`
- Create: `apps/api/src/pipeline/research-stage.ts`
- Create: `apps/api/src/services/events.ts`
- Create: `apps/api/src/routes/stream.ts`
- Create: `apps/api/src/routes/monitors.ts`
- Create: `apps/api/src/routes/chat.ts`
- Create: `apps/api/src/middleware/webhook-auth.ts`
- Create: `apps/api/test/pipeline.test.ts`
- Create: `apps/api/test/stream.test.ts`
- Create: `apps/api/test/monitors.test.ts`
- Create: `fixtures/research/search.json`
- Create: `fixtures/research/dossier.json`
- Create: `fixtures/research/monitor.json`

**Interfaces:**
- Produces: `GeminiClient.scanScreenplay`, `scanCut`, `answerCopilot`; `ParallelClient.searchClearanceItem`, `buildDossier`, `createMonitor`, and `readMonitorEvents`.
- Produces: `ProjectEventBus.publish`, `subscribe`, and `snapshotSince`; typed SSE at `GET /api/projects/:id/stream`.
- Consumes: repository saves after every meaningful stage and fixture/live integration mode from config.

- [ ] **Step 1: Write failing adapter-order and SSE recovery tests**

```ts
test("each case performs Search before Task with bounded concurrency", async () => {
  await orchestrator.run(project.id);
  expect(calls.filter(c => c.itemId === "item_brand").map(c => c.kind)).toEqual(["search", "task"]);
  expect(maxActiveResearch).toBeLessThanOrEqual(4);
});

test("stream opens with a snapshot and monotonic event ids", async () => {
  const frames = await readSse(app, `/api/projects/${project.id}/stream`, 3);
  expect(frames[0].event.type).toBe("snapshot");
  expect(frames.map(frame => Number(frame.id))).toEqual([1, 2, 3]);
});
```

- [ ] **Step 2: Verify integration and pipeline tests fail**

Run: `bun test packages/integrations/test apps/api/test/pipeline.test.ts apps/api/test/stream.test.ts apps/api/test/monitors.test.ts`

Expected: FAIL on missing adapters and orchestrator.

- [ ] **Step 3: Implement fetch-based adapters and fixture mode**

```ts
export interface GeminiClient {
  scanScreenplay(input: ScreenplayScanInput): Promise<ScreenplayFinding[]>;
  scanCut(input: CutScanInput): Promise<CutFinding[]>;
  answerCopilot(input: CopilotInput): Promise<CopilotResponse>;
}

export interface ParallelClient {
  searchClearanceItem(input: ResearchInput): Promise<SearchEvidence[]>;
  buildDossier(input: DossierInput): Promise<RightsDossier>;
  createMonitor(input: MonitorInput): Promise<MonitorRecord>;
  readMonitorEvents(input: MonitorEventsInput): Promise<MonitorEvent[]>;
}
```

Port prompts, query construction, schema validation, citations, candidate holders, routes, monitor behavior, and error semantics from the Python integration files. Fixture implementations load checked-in data, retain `MOCK:` prefixes, and cannot be enabled silently after a live failure.

- [ ] **Step 4: Implement orchestration and stream recovery**

Run screenplay and cut scans concurrently when both exist; reconcile deterministically; run per-item Search then Task under `RESEARCH_CONCURRENCY`; persist each stage; publish typed events with monotonic IDs; retain a bounded replay buffer; emit heartbeats; and expose polling-compatible snapshots. Constant-time webhook authentication and event-id idempotency are mandatory.

- [ ] **Step 5: Run the agent pipeline gate**

Run: `bun test packages/integrations/test apps/api/test/pipeline.test.ts apps/api/test/stream.test.ts apps/api/test/monitors.test.ts`

Expected: PASS for partial provider failure, citation retention, Search-before-Task, concurrency, no fake live success, SSE snapshot/order/replay/heartbeat, monitor reopen, webhook retries, copilot read-only behavior, and late-research safety.

- [ ] **Step 6: Commit integrations and orchestration**

```bash
git add packages/integrations apps/api fixtures/research
git commit -m "feat: port agent pipeline and live progress"
```

### Task 8: Add Cloudflare edge, D1, R2, direct uploads, and the Bun Container

**Files:**
- Create: `apps/edge/package.json`
- Create: `apps/edge/wrangler.jsonc`
- Create: `apps/edge/src/worker.ts`
- Create: `apps/edge/src/container.ts`
- Create: `apps/edge/src/bindings.ts`
- Create: `apps/edge/src/uploads.ts`
- Create: `apps/edge/src/errors.ts`
- Create: `apps/edge/test/worker.test.ts`
- Create: `apps/api/Dockerfile`
- Create: `apps/api/src/repositories/d1-project-repository.ts`
- Create: `apps/api/src/repositories/r2-asset-store.ts`
- Create: `apps/api/src/repositories/cloudflare-binding-client.ts`
- Create: `apps/api/test/cloudflare-repositories.test.ts`
- Create: `infra/d1/0001_initial.sql`
- Create: `infra/r2/cors.json`

**Interfaces:**
- Produces: edge `/api/*` forwarding, `ClearCutApiContainer`, private `https://bindings.internal/*` D1/R2 bridge, upload signing, and object verification.
- Produces: D1 and R2 implementations of the existing repository interfaces.
- Consumes: one stable container name `clearcut-api-primary` and Cloudflare bindings generated by Wrangler.

- [ ] **Step 1: Write failing edge and repository contract tests**

```ts
test("public requests cannot call the internal binding origin", async () => {
  const response = await worker.fetch(new Request("https://app.test/api/__bindings/projects"), env, ctx);
  expect(response.status).toBe(404);
});

test("SSE passes through without buffering or cache headers", async () => {
  const response = await worker.fetch(new Request("https://app.test/api/projects/p/stream"), env, ctx);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.body).toBe(containerStream);
});
```

- [ ] **Step 2: Verify Cloudflare tests fail**

Run: `bun test apps/edge/test apps/api/test/cloudflare-repositories.test.ts`

Expected: FAIL because the edge package and adapters are absent.

- [ ] **Step 3: Implement the named Container and streaming gateway**

`ClearCutApiContainer` extends Cloudflare's `Container`, starts `bun run src/server.ts`, uses the checked-in Dockerfile, and routes all public API requests through `env.CLEARCUT_API.getByName("clearcut-api-primary")`. Forward method, headers, body, abort signal, and response stream unchanged. The binding bridge is reachable only through the Container outbound handler and validates an internal nonce plus a fixed operation allowlist.

- [ ] **Step 4: Implement D1/R2 adapters and direct upload lifecycle**

D1 rows store canonical validated project JSON plus indexed summary columns and event-idempotency records. R2 stores opaque keys. Upload sessions bind `{ session_id, project_id, kind, key, size_bytes, content_type, expires_at, completed_at }`; signing never accepts a caller-provided bucket or arbitrary key; finalization checks head metadata and is idempotent. Multipart part sizes obey R2 limits, and CORS contains only explicit product/preview origins.

- [ ] **Step 5: Add Wrangler type generation and dry-run checks**

Run: `bun --filter @clearcut/edge cf:typegen`

Expected: exit 0 and generated binding types include `DB`, `ASSETS`, and `CLEARCUT_API`.

Run: `bun --filter @clearcut/edge cf:check`

Expected: Worker and Container configuration validates without deployment.

- [ ] **Step 6: Run the Cloudflare adapter gate**

Run: `bun test apps/edge/test apps/api/test/cloudflare-repositories.test.ts`

Expected: PASS for route forwarding, same-origin headers, SSE pass-through, abort propagation, bridge isolation, D1 round-trip, R2 range read, upload expiry/scoping/finalization, and provider staging cleanup.

- [ ] **Step 7: Commit Cloudflare infrastructure**

```bash
git add apps/edge apps/api infra
git commit -m "feat: add Cloudflare production runtime"
```

### Task 9: Scaffold Next.js, OpenNext, shadcn/ui, Geist, and the product shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/open-next.config.ts`
- Create: `apps/web/wrangler.jsonc`
- Create: `apps/web/components.json`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/loading.tsx`
- Create: `apps/web/src/app/global-error.tsx`
- Create: `apps/web/src/app/not-found.tsx`
- Create: `apps/web/src/app/(product)/layout.tsx`
- Create: `apps/web/src/app/(product)/_components/product-shell.tsx`
- Create: `apps/web/src/app/(product)/_components/boot-screen.tsx`
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/project-preferences.ts`
- Create: `packages/ui/package.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/components/button.tsx`
- Create: `packages/ui/src/components/input.tsx`
- Create: `packages/ui/src/components/textarea.tsx`
- Create: `packages/ui/src/components/label.tsx`
- Create: `packages/ui/src/components/select.tsx`
- Create: `packages/ui/src/components/checkbox.tsx`
- Create: `packages/ui/src/components/dialog.tsx`
- Create: `packages/ui/src/components/sheet.tsx`
- Create: `packages/ui/src/components/command.tsx`
- Create: `packages/ui/src/components/tabs.tsx`
- Create: `packages/ui/src/components/table.tsx`
- Create: `packages/ui/src/components/dropdown-menu.tsx`
- Create: `packages/ui/src/components/tooltip.tsx`
- Create: `packages/ui/src/components/scroll-area.tsx`
- Create: `packages/ui/src/components/separator.tsx`
- Create: `packages/ui/src/components/skeleton.tsx`
- Create: `packages/ui/src/components/alert-dialog.tsx`
- Create: `packages/ui/src/components/sonner.tsx`
- Create: `apps/web/src/app/shell.test.tsx`

**Interfaces:**
- Produces: stable product layout, independent boot resources, typed API client, product navigation, command palette host, and browser preference adapter.
- Consumes: `@clearcut/contracts` only for API shapes; no handwritten duplicate types.

- [ ] **Step 1: Write failing shell tests**

```tsx
test("configuration and project boot failures recover independently", async () => {
  render(<BootScreen config={failed("config")} projects={ready([])} />);
  expect(screen.getByText("CONFIG")).toHaveTextContent("RETRY");
  expect(screen.getByText("PROJECTS")).toHaveTextContent("READY");
});

test("shell exposes the primary product navigation", () => {
  render(<ProductShell><div /></ProductShell>);
  expect(screen.getByRole("link", { name: "Productions" })).toBeVisible();
  expect(screen.getByRole("link", { name: "New scan" })).toBeVisible();
});
```

- [ ] **Step 2: Verify shell tests fail**

Run: `bun --filter @clearcut/web test -- shell.test.tsx`

Expected: FAIL because the Next application is absent.

- [ ] **Step 3: Scaffold with pinned product choices**

Install Next stable, React 19, OpenNext Cloudflare, Tailwind v4, shadcn CLI output, Base UI-backed primitives, Geist, Testing Library, Vitest, and Playwright. Configure `next.config.ts` to rewrite local `/api/:path*` to `CLEARCUT_API_ORIGIN=https://clearcut-api.lcl`. The web `dev` script must be exactly Portless-backed and register `https://clearcut.lcl`.

Define semantic OKLCH variables for neutral background/sidebar/text/border, graphite media canvas, technical blue action, restrained red/amber/green, 6/8/10px radii, and overlay-only shadows. Use Geist Sans globally and Geist Mono for technical data.

- [ ] **Step 4: Implement shell, boot, errors, and command host**

Use Server Components for the root frames and a small client component for navigation state and `Cmd/Ctrl+K`. The delayed boot sequence appears only after 350ms and updates `CONFIG`, `PROJECTS`, and `WORKSPACE` rows in place. No spinner, display headline, serif, gradient, glass, or card grid is allowed.

- [ ] **Step 5: Run shell, build, and OpenNext checks**

Run: `bun --filter @clearcut/web test -- shell.test.tsx`

Expected: PASS.

Run: `bun --filter @clearcut/web build`

Expected: Next production build exits 0.

Run: `bun --filter @clearcut/web cf:check`

Expected: OpenNext bundle and Wrangler dry run exit 0.

- [ ] **Step 6: Commit the product shell**

```bash
git add apps/web packages/ui bun.lock package.json
git commit -m "feat: scaffold Next product shell"
```

### Task 10: Build the production library and complete intake flow

**Files:**
- Create: `apps/web/src/app/(product)/page.tsx`
- Create: `apps/web/src/app/(product)/_components/production-library.tsx`
- Create: `apps/web/src/app/(product)/projects/new/page.tsx`
- Create: `apps/web/src/app/(product)/projects/new/intake-form.tsx`
- Create: `apps/web/src/app/(product)/projects/new/file-row.tsx`
- Create: `apps/web/src/features/uploads/upload-client.ts`
- Create: `apps/web/src/features/projects/production-library.test.tsx`
- Create: `apps/web/src/features/uploads/intake-form.test.tsx`

**Interfaces:**
- Produces: searchable/archive-aware library and screenplay/cut/both intake with preflight, progress, replacement, recovery, and direct-R2 support.
- Consumes: project list, config, preflight, local multipart, upload-session, upload-finalize, and project-create contracts.

- [ ] **Step 1: Write failing library and intake tests**

```tsx
test("library exposes phase and unresolved work without cards", () => {
  render(<ProductionLibrary projects={[projectSummary]} archived={false} />);
  expect(screen.getByRole("table")).toBeVisible();
  expect(screen.getByText("Needs review")).toBeVisible();
  expect(screen.getByText("3 unresolved")).toBeVisible();
});

test("intake preserves the valid file when the other file fails", async () => {
  render(<IntakeForm client={clientWithRejectedCut} />);
  await chooseScreenplayAndCut();
  expect(screen.getByText("Screenplay ready")).toBeVisible();
  expect(screen.getByText("The video container is unreadable")).toBeVisible();
});
```

- [ ] **Step 2: Verify feature tests fail**

Run: `bun --filter @clearcut/web test -- production-library.test.tsx intake-form.test.tsx`

Expected: FAIL on absent components.

- [ ] **Step 3: Implement the library**

Render a flat desktop table and semantic mobile rows with production, phase, unresolved, critical, input coverage, and last activity. Search and state filters occupy one toolbar. Archive/restore is contextual, and the empty state reuses the table frame. One `New scan` action is primary.

- [ ] **Step 4: Implement local and R2 intake transports**

`UploadClient` exposes:

```ts
export interface UploadClient {
  preflight(file: File): Promise<PreflightResult>;
  upload(input: UploadInput, onProgress: (progress: number) => void): Promise<UploadedAsset>;
  createProject(input: CreateProjectInput): Promise<Project>;
}
```

Local mode posts multipart through XHR for progress. Cloudflare mode creates an upload session, sends single or multipart R2 requests directly, finalizes, then creates the project from opaque asset references. Abort, retry, replace, and per-file errors preserve the other valid input.

- [ ] **Step 5: Run feature and accessibility tests**

Run: `bun --filter @clearcut/web test -- production-library.test.tsx intake-form.test.tsx`

Expected: PASS for filters, archive/restore, empty state, screenplay/cut/both validation, progress, retry, replacement, and focusable errors.

- [ ] **Step 6: Commit library and intake**

```bash
git add apps/web
git commit -m "feat: build production library and intake"
```

### Task 11: Build analysis, SSE recovery, media review, and the evidence inspector

**Files:**
- Create: `apps/web/src/app/(product)/projects/[projectId]/page.tsx`
- Create: `apps/web/src/app/(product)/projects/[projectId]/loading.tsx`
- Create: `apps/web/src/app/(product)/projects/[projectId]/error.tsx`
- Create: `apps/web/src/features/analysis/analysis-workspace.tsx`
- Create: `apps/web/src/features/analysis/use-project-feed.ts`
- Create: `apps/web/src/features/review/review-workspace.tsx`
- Create: `apps/web/src/features/review/case-rail.tsx`
- Create: `apps/web/src/features/review/picture-workspace.tsx`
- Create: `apps/web/src/features/review/timeline.tsx`
- Create: `apps/web/src/features/review/evidence-inspector.tsx`
- Create: `apps/web/src/features/review/evidence-graph.tsx`
- Create: `apps/web/src/features/review/source-ledger.tsx`
- Create: `apps/web/src/features/analysis/analysis-workspace.test.tsx`
- Create: `apps/web/src/features/review/review-workspace.test.tsx`

**Interfaces:**
- Produces: phase-selected stable project route, typed SSE cache, polling recovery, selected-case URL state, video/timeline coordination, evidence tabs, and rights-route detail.
- Consumes: project snapshot, stream events, cut range endpoint, item research route, and browser project preferences.

- [ ] **Step 1: Write failing analysis and review tests**

```tsx
test("SSE failure becomes visible polling instead of frozen live state", async () => {
  render(<AnalysisWorkspace initialProject={processing} feed={failingFeed} />);
  expect(await screen.findByText("Polling for updates")).toBeVisible();
  expect(client.getProject).toHaveBeenCalled();
});

test("selected case controls picture and inspector and survives the URL", async () => {
  render(<ReviewWorkspace project={readyProject} searchParams={{ case: "item_logo" }} />);
  expect(screen.getByRole("heading", { name: "Northstar Cola" })).toBeVisible();
  expect(screen.getByTestId("media-canvas")).toHaveAttribute("data-selected-case", "item_logo");
});
```

- [ ] **Step 2: Verify workspace tests fail**

Run: `bun --filter @clearcut/web test -- analysis-workspace.test.tsx review-workspace.test.tsx`

Expected: FAIL on missing workspaces.

- [ ] **Step 3: Implement analysis as structured execution output**

The left rail renders ordered stages, the center renders grouped activity/findings, and the right inspector renders coverage, elapsed time, active operation, fixture/live mode, and connection state. The first usable case exposes `Review available cases` before global completion. Events update a schema-validated normalized snapshot; reconnection uses bounded backoff and polling fallback.

- [ ] **Step 4: Implement the responsive review workspace**

Desktop is `case rail | media + timeline | evidence inspector`; tablet moves the inspector to a Sheet; mobile uses media-first content, a bottom case drawer, and full-height evidence sheets. The URL owns selected case and filters. Local storage owns queue width, open inspector, and playback position. Keyboard case navigation never hijacks form or media-control focus.

- [ ] **Step 5: Implement the evidence system**

Overview shows risk, status, provenance, exact use, and next human action. Sources is a flat citation ledger. Rights route shows candidate holders, contacts, gaps, and questions. Documents and Activity have stable tabs. Evidence graph nodes represent detection, source, holder, route, document, and gap relationships without force-layout animation.

- [ ] **Step 6: Run workspace tests**

Run: `bun --filter @clearcut/web test -- analysis-workspace.test.tsx review-workspace.test.tsx`

Expected: PASS for SSE/polling, partial readiness, deep links, filters, timeline seek, reload preferences, source selection, responsive inspectors, keyboard navigation, and reduced motion.

- [ ] **Step 7: Commit analysis and review**

```bash
git add apps/web
git commit -m "feat: build analysis and review workspaces"
```

### Task 12: Build documents, scope, human dispositions, revisions, packet, commands, and copilot

**Files:**
- Create: `apps/web/src/features/documents/document-sheet.tsx`
- Create: `apps/web/src/features/documents/scope-assessment.tsx`
- Create: `apps/web/src/features/review/human-disposition.tsx`
- Create: `apps/web/src/app/(product)/projects/[projectId]/revisions/new/page.tsx`
- Create: `apps/web/src/app/(product)/projects/[projectId]/revisions/[revisionId]/page.tsx`
- Create: `apps/web/src/features/revisions/revision-intake.tsx`
- Create: `apps/web/src/features/revisions/version-ripple.tsx`
- Create: `apps/web/src/app/(product)/projects/[projectId]/packet/page.tsx`
- Create: `apps/web/src/features/packet/packet-preview.tsx`
- Create: `apps/web/src/features/commands/command-palette.tsx`
- Create: `apps/web/src/features/copilot/copilot-sheet.tsx`
- Create: `apps/web/src/features/monitoring/monitor-control.tsx`
- Create: `apps/web/src/features/documents/document-sheet.test.tsx`
- Create: `apps/web/src/features/revisions/version-ripple.test.tsx`
- Create: `apps/web/src/features/packet/packet-preview.test.tsx`
- Create: `apps/web/src/features/commands/command-palette.test.tsx`
- Create: `apps/web/src/features/monitoring/monitor-control.test.tsx`

**Interfaces:**
- Produces: complete secondary workflows without leaving the stable product shell.
- Consumes: document, scope, status, coordination, use-profile, revision, packet, monitor, draft-request, and chat endpoints.

- [ ] **Step 1: Write failing human workflow tests**

```tsx
test("human disposition names the actor and requires rationale", async () => {
  render(<HumanDisposition item={item} client={client} />);
  await user.click(screen.getByRole("button", { name: "Coordinator verified" }));
  expect(screen.getByText("Coordinator action")).toBeVisible();
  expect(screen.getByRole("button", { name: "Record disposition" })).toBeDisabled();
});

test("packet preview does not export until explicit confirmation", async () => {
  render(<PacketPreview project={project} client={client} />);
  expect(client.exportPacket).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm and export Markdown" }));
  expect(screen.getByRole("dialog", { name: "Export current packet?" })).toBeVisible();
});
```

- [ ] **Step 2: Verify secondary-flow tests fail**

Run: `bun --filter @clearcut/web test -- document-sheet.test.tsx version-ripple.test.tsx packet-preview.test.tsx command-palette.test.tsx monitor-control.test.tsx`

Expected: FAIL on missing features.

- [ ] **Step 3: Implement documents and human decisions**

Use desktop side sheets and full-height mobile sheets. Document forms record type, media, territories, dates/term, intended use, notes, file, replacement, edit, and delete confirmation. Scope is a label/value comparison, never a legal conclusion. Human actions show actor, rationale requirement, supporting-document requirement, and immutable audit consequence before submit.

- [ ] **Step 4: Implement revisions and packet**

Revision intake reuses file rows. Comparison renders the five-outcome summary, flat diff table, contextual explanation inspector, predecessor conflict, and one `Apply reviewed revision` action. Packet uses a wide technical document column with fixed readiness inspector; preview is read-only and export requires confirmation.

- [ ] **Step 5: Implement commands, monitoring, and copilot**

`Cmd/Ctrl+K` exposes navigation and deterministic commands and ignores shortcuts inside editable fields. A case can start one Parallel Monitor watch, display its active state and retrieved events, and surface webhook-triggered reopen history without overwriting the prior human record. Copilot is a contextual Sheet with structured citations/tool calls; it summarizes stored state and may request research but exposes no status mutation command.

- [ ] **Step 6: Run secondary-flow tests**

Run: `bun --filter @clearcut/web test -- document-sheet.test.tsx version-ripple.test.tsx packet-preview.test.tsx command-palette.test.tsx monitor-control.test.tsx`

Expected: PASS for scope gaps, upload recovery, disposition safeguards, version outcomes, predecessor conflict, export confirmation, keyboard commands, monitor creation/reopen history, focus restoration, and read-only copilot.

- [ ] **Step 7: Commit secondary workflows**

```bash
git add apps/web
git commit -m "feat: complete clearance review workflows"
```

### Task 13: Prove the complete flow, polish the ultraminimal UI, and cut over

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/tests/e2e/fixtures.ts`
- Create: `apps/web/tests/e2e/full-flow.spec.ts`
- Create: `apps/web/tests/e2e/accessibility.spec.ts`
- Create: `apps/web/tests/e2e/visual.spec.ts`
- Create through the visual test runner: `apps/web/tests/e2e/__screenshots__/boot.png`
- Create through the visual test runner: `apps/web/tests/e2e/__screenshots__/library.png`
- Create through the visual test runner: `apps/web/tests/e2e/__screenshots__/intake.png`
- Create through the visual test runner: `apps/web/tests/e2e/__screenshots__/processing.png`
- Create through the visual test runner: `apps/web/tests/e2e/__screenshots__/review.png`
- Create through the visual test runner: `apps/web/tests/e2e/__screenshots__/partial-scope.png`
- Create through the visual test runner: `apps/web/tests/e2e/__screenshots__/revision.png`
- Create through the visual test runner: `apps/web/tests/e2e/__screenshots__/packet.png`
- Create through the visual test runner: `apps/web/tests/e2e/__screenshots__/tablet-review.png`
- Create through the visual test runner: `apps/web/tests/e2e/__screenshots__/mobile-library.png`
- Create through the visual test runner: `apps/web/tests/e2e/__screenshots__/mobile-review.png`
- Modify: `README.md`
- Modify: `idea.md`
- Modify: `.env.example`
- Modify: `Dockerfile`
- Delete after parity: `frontend/`
- Delete after parity: `backend/`
- Delete after parity: `requirements.txt`
- Delete after parity: `requirements-dev.txt`

**Interfaces:**
- Consumes: the actual Next and Bun services in explicit fixture mode; browser interception is not the primary API substitute.
- Produces: the final release gate, Cloudflare dry-run gate, updated operational documentation, and one default implementation.

- [ ] **Step 1: Write the full failing browser flow**

```ts
test("boot through confirmed packet export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "New scan" }).click();
  await attachFixtureInputs(page);
  await page.getByRole("button", { name: "Start clearance analysis" }).click();
  await expect(page.getByText("Researching cases")).toBeVisible();
  await page.getByRole("button", { name: "Review available cases" }).click();
  await recordDocumentAndDisposition(page);
  await compareAndApplyRevision(page);
  await openPacketAndConfirmExport(page);
  await expect(page.getByText("Export recorded")).toBeVisible();
});
```

- [ ] **Step 2: Verify the new release flow fails before final wiring**

Run: `bun run test:e2e -- --grep "boot through confirmed packet export"`

Expected: FAIL at the first incomplete integration boundary.

- [ ] **Step 3: Wire the actual fixture-mode services and close integration gaps**

Start Next and Bun through the root Portless script, seed deterministic projects through an API test-only fixture endpoint available only when `MOCK_RESEARCH=true` and `NODE_ENV!==production`, and run the full browser against real contracts, mutations, SSE, persistence, and downloads.

- [ ] **Step 4: Complete accessibility and responsive gates**

Test boot, empty/returning library, intake, processing, review, document scope, revision, and packet at desktop, tablet, and mobile. Block serious/critical axe violations, horizontal document overflow, missing 44px touch targets, broken focus traps/return, keyboard dead ends, and motion under `prefers-reduced-motion`.

- [ ] **Step 5: Perform the ultraminimal visual pass**

Capture visual baselines for every major state. Remove nested cards, excessive pills, decorative shadows, nonsemantic color, oversized headings, editorial typography, and ornamental motion. Verify neutral shell, graphite media canvas, compact separators, technical type hierarchy, consistent 6/8/10px radii, one primary action per context, and sparse red/amber/green usage.

- [ ] **Step 6: Run the complete local and Cloudflare gates**

Run: `bun run typecheck`

Expected: exit 0.

Run: `bun run lint`

Expected: exit 0.

Run: `bun test`

Expected: all contract, domain, API, integration, edge, and component tests pass.

Run: `bun run test:e2e`

Expected: all full-flow, accessibility, responsive, keyboard, reduced-motion, and visual tests pass.

Run: `bun run build`

Expected: Next and Bun builds exit 0.

Run: `bun run cf:typegen && bun run cf:check`

Expected: OpenNext, Worker, Container, D1, R2, and binding configuration validate without deployment.

- [ ] **Step 7: Cut over and remove the retired implementation**

Only after Step 6 passes, remove Vite, React 18, the handwritten router, Python, FastAPI, generated static output, npm lockfiles, and obsolete GCS/Firestore production wiring. Preserve sample and deterministic media under `fixtures/`. Update README and `idea.md` to describe the actual Next/Bun/Cloudflare application, its safety boundary, `.lcl` development, Cloudflare configuration, and verification commands.

- [ ] **Step 8: Re-run the release gate after deletion**

Run: `bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build && bun run cf:check`

Expected: exit 0 with no references to `frontend/`, `backend/`, Vite, FastAPI, Firestore as production persistence, or GCS as the source-of-truth asset store.

- [ ] **Step 9: Commit the cutover**

```bash
git add -A
git commit -m "feat: complete ClearCut Next and Bun migration"
```
