# ClearCut Next.js + Bun Technical Redesign

**Status:** Approved architecture; awaiting written-spec review

**Date:** 2026-08-24

**Branch:** `aritro`

**Decision:** Next.js on Cloudflare Workers with a separate Bun API in a Cloudflare Container

## 1. Purpose

ClearCut will migrate from its current React/Vite frontend and Python/FastAPI backend to a TypeScript monorepo with:

- a latest-stable Next.js App Router frontend;
- a dedicated Bun API for long-running analysis, uploads, SSE, Gemini, Parallel, webhooks, revisions, documents, and exports;
- a Cloudflare-first production topology using OpenNext on Workers, a narrow edge gateway, a Bun API Container, R2, and D1;
- shared Zod contracts between the frontend and backend;
- shadcn/ui with Tailwind CSS v4;
- Geist Sans and Geist Mono;
- an ultraminimal, technical interface derived from Cursor, ElevenLabs, and Runway product patterns.

This is a parity-first architecture migration and product redesign. It must preserve ClearCut's complete existing workflow and safety invariants. It is not a marketing-site redesign, a demo-only shell, or a set of disconnected showcase screens.

## 2. Current product contract

The current application already supports this continuous workflow:

1. Boot the application and recover independently from configuration or project-index failures.
2. Open, search, archive, restore, or create a production.
3. Preflight and upload a screenplay, rough cut, or both.
4. Scan the screenplay and cut with Gemini.
5. Reconcile script-only, cut-only, shared, and materially changed elements.
6. Research each candidate through Parallel Search and Parallel Task.
7. Stream analysis progress through SSE with polling recovery.
8. Review cases against the picture and timeline.
9. Inspect sources, evidence, candidate rights holders, contact routes, and gaps.
10. Attach production documents and record their use scope.
11. Assign coordinators and record human-owned dispositions with rationales.
12. Start, inspect, and apply immutable revisions through Version Ripple.
13. Carry unchanged human records forward and reopen affected cases only.
14. Start Parallel Monitor watches and process authenticated webhook changes.
15. Preview and explicitly confirm a current clearance packet export.
16. Resume deep links, selected cases, filters, panel state, and playback position.
17. Use a global command palette and contextual copilot.

All of these behaviors remain in scope. A visually polished application that omits any of them is not complete.

## 3. Goals

### Product goals

- Make the rough cut and clearance state the visual center of the application.
- Make the agent pipeline legible without turning the product into a chat transcript.
- Make every case's risk, evidence, ownership, scope, and next human action understandable at a glance.
- Preserve the boundary between agent research and human legal review.
- Make the complete product feel coherent from boot through packet export.
- Keep desktop dense and efficient while preserving full tablet and mobile paths.

### Engineering goals

- Replace Vite and the handwritten router with Next.js App Router.
- Replace Python/FastAPI/Pydantic with Bun/Hono/Zod.
- Share one canonical contract package across server and client.
- Keep long-running and streaming work outside the Next.js rendering process.
- Preserve same-origin browser requests at `/api/*`.
- Deploy the product on Cloudflare without replacing the required Bun backend runtime with the Workers runtime.
- Keep large media bytes out of both the Next.js Worker and Bun Container through direct R2 uploads.
- Preserve local fixture-driven development without presenting fixture research as live evidence.
- Keep modules small enough to test and change independently.
- Retire the old frontend and Python backend only after behavioral parity is verified.

## 4. Non-goals

- No authentication, billing, teams, or multi-tenant workspace system in this migration.
- No existing-user data migration. Local development remains in-memory/filesystem by default; D1 and R2 are production adapters, not a live-data product initiative.
- No legal conclusion engine. ClearCut remains research for qualified human review.
- No landing page, editorial storytelling, hackathon video workflow, or presentation-only route.
- No broad visual theming system beyond the product's light technical shell and dark media canvas.
- No Cloudflare Queues, Workflows, or autoscaled Container pool in the first parity release.
- No multi-region active-active job execution. The first release uses one named Bun Container so its in-process job and SSE registries remain coherent.
- No new clearance categories unless required to represent an existing model field.
- No speculative AI features beyond the existing Gemini, Parallel, monitoring, and copilot responsibilities.

## 5. Architecture

### 5.1 Repository layout

The repository becomes a Bun workspace:

```text
ClearCut/
├── apps/
│   ├── web/                 # Next.js App Router + OpenNext Worker
│   ├── edge/                # Cloudflare API gateway + Container binding
│   └── api/                 # Bun + Hono HTTP/SSE Container service
├── packages/
│   ├── contracts/           # Zod request/response/event schemas
│   ├── domain/              # State machine, invariants, reconciliation, revisions
│   ├── integrations/        # Gemini, Parallel, D1, R2, provider staging adapters
│   └── ui/                  # ClearCut-owned shadcn components and tokens
├── fixtures/                # Clearly labeled deterministic research fixtures
├── docs/
├── package.json             # Bun workspace scripts
├── bun.lock
└── turbo.json               # Only if workspace task orchestration proves useful
```

`turbo.json` is optional. Bun workspaces are sufficient unless build/test orchestration measurably benefits from Turborepo. The migration must not add a tool solely because the repository is a monorepo.

### 5.2 Runtime split

`apps/web` owns:

- App Router layouts, pages, loading states, error boundaries, and metadata;
- server-rendered shells and initial read models where they improve perceived speed;
- client islands for media playback, filters, drawers, live progress, commands, and mutations;
- shadcn/ui source components, Tailwind composition, accessibility, and responsive behavior;
- browser continuity state that is explicitly local to the user interface.

In production, `apps/web` is built by `@opennextjs/cloudflare` and runs as a Cloudflare Worker with static assets. It must not contain the analysis API or own the Bun Container lifecycle.

`apps/edge` owns:

- the production `/api/*` Worker route;
- the named Cloudflare Container binding and Container lifecycle;
- streaming requests and responses between the browser and Bun without buffering SSE or asset bodies;
- the narrow D1/R2 binding bridge used by the Bun Container;
- R2 URL signing, multipart mechanics, and object-metadata verification primitives;
- Cloudflare request IDs, observability fields, and infrastructure-level errors.

The edge layer contains no clearance domain rules, Gemini prompts, Parallel orchestration, legal workflow state transitions, or UI behavior.

`apps/api` owns:

- all `/api` routes;
- upload preflight, upload-session authorization, and finalization;
- project, case, document, revision, monitor, packet, and copilot commands;
- Gemini screenplay and multimodal cut scanning;
- Parallel Search, Task, and Monitor calls;
- SSE progress and polling snapshots;
- persistence, asset, and provider-media-staging abstractions;
- safety invariants and audit history;
- authenticated Parallel Monitor webhooks.

Next.js must not proxy long-running work through Route Handlers. Locally, its `next.config.ts` rewrite forwards `/api/:path*` to the Bun service. In production, Cloudflare routes `/api/*` directly to `apps/edge`, so API traffic never enters the Next.js Worker.

### 5.3 Local and production origins

- User-facing local URL: `https://clearcut.lcl`
- Bun API route: registered through Portless as `https://clearcut-api.lcl`
- Browser requests: always target `/api/*` on `clearcut.lcl`
- Next.js rewrite target: `CLEARCUT_API_ORIGIN`, locally `https://clearcut-api.lcl`

The root development script must start both services through Portless and must never emit a `.localhost` product URL.

Production uses one public hostname with two Cloudflare Worker routes:

- `clearcut.example/api/*` → `apps/edge` → one named Bun API Container;
- `clearcut.example/*` → the OpenNext Worker in `apps/web`.

The more-specific `/api/*` route takes precedence. This keeps the browser same-origin while preventing Next.js from becoming an API proxy. Preview deployments use equivalent Worker hostnames and bindings without changing the browser contract.

### 5.4 Dependency baseline

- Bun is the package manager, script runner, backend runtime, and backend test runner.
- Next.js uses the latest stable release available when the migration is scaffolded. The approved baseline is Next.js 16.2 or newer within the 16.x stable line; canary releases are excluded.
- `@opennextjs/cloudflare` builds the Next.js application for Workers; Cloudflare preview is required because `next dev` does not reproduce the Workers runtime.
- Wrangler v4 configures the web Worker, edge Worker, Container, D1 database, and R2 bucket. Bindings receive generated TypeScript types.
- Worker compatibility dates are pinned to the scaffold date or newer—initially `2026-08-24`—and `nodejs_compat` is enabled where OpenNext requires it.
- The API Container image targets Linux `amd64` and starts the Hono server with Bun; the Container boundary is what preserves a real Bun runtime in production.
- React 19 is used through the Next.js-supported version.
- Tailwind CSS v4 is used with CSS-first configuration.
- shadcn/ui is initialized non-interactively at its latest stable CLI version.
- shadcn Base UI primitives are used for new components unless a required component lacks parity; exceptions must be recorded in `components.json` and tests.
- Geist Sans and Geist Mono are loaded locally through the supported Geist package or Next.js font integration; no network font request is allowed.
- Hono provides typed Bun routing, middleware, streaming, and error boundaries.
- Zod defines all external and shared contracts.
- SDKs are used only where they run correctly under Bun. Integrations may use standards-based `fetch` when that is more reliable.

## 6. Domain and contract boundaries

### 6.1 Shared contracts

`packages/contracts` is the only source for HTTP and SSE shapes. It exports:

- `ProjectSchema`, `ProjectSummarySchema`, and `ProjectListSchema`;
- `ClearanceItemSchema`, `EvidenceSchema`, `SourceSchema`, and `RightsRouteSchema`;
- `DocumentRecordSchema` and `ScopeAssessmentSchema`;
- `UseProfileSchema`;
- `RevisionSchema`, `RevisionComparisonSchema`, and `RevisionApplyResultSchema`;
- `MonitorRecordSchema` and `MonitorEventSchema`;
- `PacketPreviewSchema` and `PacketExportSchema`;
- mutation input schemas for dispositions, assignments, documents, use profile, revisions, research, monitors, and chat;
- a discriminated `ProjectStreamEventSchema` for snapshots, progress, item changes, completion, heartbeat, and recoverable errors;
- `ApiErrorSchema` with a stable machine code, human message, optional field errors, and retry metadata.

The web application infers TypeScript types directly from these schemas. It must not maintain a parallel handwritten `types.ts` model.

### 6.2 Domain package

`packages/domain` contains pure, dependency-free modules for:

- actor permissions and disposition ownership;
- valid case-status transitions;
- source/cut reconciliation;
- risk and readiness summaries;
- document-scope comparison;
- revision diff classification;
- immutable revision application and predecessor checks;
- packet readiness and audit-trigger rules.

HTTP handlers, Gemini output adapters, Parallel output adapters, and storage adapters call these functions. They do not reimplement the rules.

### 6.3 Safety invariants

The Bun implementation must preserve these invariants:

- Agent and system actors may advance research only as far as `evidence_ready`.
- Coordinator, counsel, permission, replacement, and false-positive outcomes remain human-owned.
- Coordinator and counsel decisions require a rationale.
- Approval-like outcomes require qualifying production documents where the existing rule requires them.
- Late research never overwrites a human disposition.
- A revision is immutable after creation.
- Revision application is predecessor-checked and idempotent.
- The server applies the stored revision comparison, never a browser-supplied change set.
- Previewing a packet creates no export audit event.
- Confirming an export creates exactly one export event for the request.
- Webhook authentication uses constant-time secret comparison and acknowledges retried valid events idempotently.

## 7. Backend services

### 7.1 HTTP modules

The current large FastAPI file is split by resource:

```text
apps/api/src/
├── server.ts
├── app.ts
├── config.ts
├── middleware/
│   ├── errors.ts
│   ├── request-id.ts
│   ├── upload-limit.ts
│   └── webhook-auth.ts
├── routes/
│   ├── system.ts
│   ├── projects.ts
│   ├── items.ts
│   ├── documents.ts
│   ├── revisions.ts
│   ├── monitors.ts
│   ├── packets.ts
│   ├── stream.ts
│   └── chat.ts
├── pipeline/
│   ├── orchestrator.ts
│   ├── screenplay-stage.ts
│   ├── cut-stage.ts
│   ├── reconcile-stage.ts
│   └── research-stage.ts
├── services/
│   ├── projects.ts
│   ├── assets.ts
│   ├── documents.ts
│   ├── revisions.ts
│   ├── monitors.ts
│   ├── packets.ts
│   └── events.ts
└── repositories/
    ├── project-repository.ts
    ├── memory-project-repository.ts
    ├── d1-project-repository.ts
    ├── asset-store.ts
    ├── filesystem-asset-store.ts
    └── r2-asset-store.ts
```

Each route module validates input and delegates. Domain rules live outside routes, and external API calls live outside domain code.

The Cloudflare boundary is independently small:

```text
apps/edge/src/
├── worker.ts               # /api forwarding and response streaming
├── container.ts            # Named Container class and lifecycle
├── bindings.ts             # D1/R2 internal bridge
├── uploads.ts              # Short-lived R2 upload sessions
└── errors.ts               # Infrastructure-level failures only
```

`apps/edge` imports contracts for transport validation but never imports the domain package. `apps/api` accesses D1 and R2 through repository interfaces; in Cloudflare it reaches a reserved internal binding origin handled by the Container outbound Worker, while local adapters use memory and the filesystem. The internal binding origin is not publicly routable.

### 7.2 Pipeline execution

Project creation stores the initial record before starting analysis. The orchestrator then runs:

1. screenplay extraction and scan when a screenplay exists;
2. cut metadata extraction and Gemini multimodal scan when a cut exists;
3. deterministic reconciliation;
4. bounded-concurrency per-case Parallel Search;
5. schema-validated Parallel Task dossiers;
6. final readiness aggregation.

Independent screenplay and cut scans may run concurrently. Per-case research uses a configurable concurrency limit and preserves the existing Search-before-Task order for each item.

For the first parity release, the orchestration process runs inside the dedicated Bun API service with an explicit in-process job registry. Cloudflare routes every API request to one named Container instance, avoiding split job registries and SSE ownership. Project state is persisted to D1 after every meaningful stage. The Container sleep window must exceed the maximum configured analysis duration, and an active SSE connection keeps the instance serving while a visible analysis is running. A Container restart may still interrupt an active job, but completed persisted state remains valid and the UI exposes recovery. A durable external queue is deferred.

### 7.3 Gemini integration

The Gemini adapter exposes narrow methods:

- `scanScreenplay(input): Promise<ScreenplayFinding[]>`
- `scanCut(input): Promise<CutFinding[]>`
- `answerCopilot(input): Promise<CopilotResponse>`

It performs model probing when no supported model is pinned, validates structured output through Zod, retains source anchors and timecodes, and reports malformed model output as a recoverable pipeline error. It must not fabricate successful findings when credentials are missing.

R2 remains the product asset source of truth. A `GeminiMediaStager` abstraction prepares temporary provider-compatible input only when required:

- Gemini AI Studio mode uploads the R2 object through the Gemini Files API;
- Vertex mode may copy the R2 object to a temporary GCS object when a `gs://` reference is required;
- provider staging records are short-lived, deletable, and never stored as the canonical project asset.

This adapter boundary keeps GCS optional and provider-specific rather than making it ClearCut's production asset store.

### 7.4 Parallel integration

The Parallel adapter exposes:

- `searchClearanceItem(input): Promise<SearchEvidence[]>`
- `buildDossier(input): Promise<RightsDossier>`
- `createMonitor(input): Promise<MonitorRecord>`
- `readMonitorEvents(input): Promise<MonitorEvent[]>`

Every evidence object retains its citation URL and retrieval metadata. Fixture mode prefixes synthetic values with `MOCK:` and is surfaced visibly by `/api/config` and the application shell.

### 7.5 Event streaming

`GET /api/projects/:projectId/stream` returns `text/event-stream` with:

- an immediate full snapshot;
- monotonic event IDs;
- typed progress and project-update events;
- periodic heartbeat events;
- `Last-Event-ID` recovery where the in-memory event buffer permits it;
- an explicit recoverable-error event before closing when appropriate.

The client reconnects with bounded exponential backoff and polls `GET /api/projects/:projectId` when SSE remains unavailable. The interface shows whether it is live, reconnecting, or using polling; it never silently freezes.

The edge Worker forwards the SSE response body as a stream and does not parse, aggregate, cache, or reconstruct events. `Cache-Control: no-store`, heartbeat timing, `Last-Event-ID`, and request-abort signals must survive the gateway boundary.

### 7.6 Uploads and assets

- Preflight validates supported media type, size, required input combination, and screenplay text-layer expectations.
- Local upload handlers stream to an explicit configured filesystem directory instead of buffering an entire rough cut in memory.
- In Cloudflare, the API authorizes a short-lived R2 upload session after preflight, then asks the internal edge binding for scoped upload URLs; the browser uploads directly to R2 so media bytes do not transit the Next.js Worker, edge Worker, or Bun Container.
- Large rough cuts use presigned multipart upload parts. Small screenplays and documents may use a single presigned `PUT`.
- R2 CORS permits only the product origins, required upload methods and headers, and no wildcard production origin.
- Finalization verifies the object key, expected size, media metadata, and upload ownership before a project or document can reference it.
- Project records store opaque asset keys, content metadata, and integrity fields—not public bucket URLs or provider-staging URLs.
- Cut playback supports byte ranges and the existing browser media controls.
- Documents use the same asset abstraction and preserve recorded metadata separately from file content.

### 7.7 Cloudflare persistence and deployment

- D1 stores durable project metadata, cases, evidence, audit entries, revision records, monitor records, upload sessions, and job-stage snapshots through the repository contract.
- R2 stores screenplay, rough-cut, revision, document, and export objects through the asset-store contract.
- Local development defaults to the memory repository and filesystem asset store; it does not require a Cloudflare account or remote state.
- The Container receives no public D1 or R2 credentials. Its outbound Worker handles narrowly scoped internal D1/R2 requests with native bindings.
- R2 S3 upload credentials, Gemini credentials, Parallel credentials, and webhook secrets are Wrangler secrets and are never exposed through Next.js public environment variables.
- `wrangler.jsonc` contains non-secret bindings and checked-in migrations/configuration; generated binding types are committed only when the repository convention requires them.
- Workers Observability is enabled for both web and edge deployments. Logs use request, project, job, and stage IDs but never screenplay text, private evidence payloads, signed URLs, credentials, or legal-document contents.
- The first release deploys one named Container. Adding a pool, queue, or workflow requires a later durability design and is not an implicit scaling toggle.

## 8. Frontend application structure

### 8.1 Route map

```text
apps/web/src/app/
├── layout.tsx
├── loading.tsx
├── global-error.tsx
├── not-found.tsx
├── (product)/
│   ├── layout.tsx
│   ├── page.tsx                              # Production library
│   ├── projects/
│   │   ├── new/page.tsx                     # Intake
│   │   └── [projectId]/
│   │       ├── page.tsx                     # Analysis or review by phase
│   │       ├── loading.tsx
│   │       ├── error.tsx
│   │       ├── packet/page.tsx
│   │       └── revisions/
│   │           ├── new/page.tsx
│   │           └── [revisionId]/page.tsx
│   └── _components/
└── proxy.ts                                  # Same-origin API rewrite only if needed
```

Project phase selects analysis or review within the stable project URL. A refresh must not move the user to a different conceptual route.

### 8.2 Rendering model

- Root layout, product shell, library frame, packet frame, metadata, and error boundaries are Server Components.
- Interactive project lists, upload controls, media playback, timeline, filters, resize controls, evidence graph, document forms, disposition forms, command palette, copilot, and SSE feed are Client Components.
- Server Components pass only validated JSON-serializable values into client islands.
- Reads that must always reflect mutable clearance state use `cache: "no-store"` or explicit revalidation rules.
- Mutations call the Bun API through a typed client and update local state only after schema validation.
- Optimistic UI is limited to reversible presentation state, not legal dispositions, revision application, document deletion, monitor creation, or packet export.

### 8.3 State ownership

- The Bun API project record is authoritative for clearance state.
- The URL owns project, revision, packet, selected-case, and shareable filter identity.
- Local storage owns queue width, inspector state, playback position, and purely presentational preferences.
- In-memory React state owns transient forms and menus.
- The SSE feed updates a normalized project cache; it does not bypass schema validation.

## 9. Visual system

### 9.1 Reference synthesis

ClearCut adopts patterns rather than reproducing brands:

- **Cursor:** restrained three-pane workspaces, compact activity, command-first navigation, quiet selected states, and structured technical output.
- **ElevenLabs:** a stable narrow sidebar, flat content hierarchy, thin separators, compact controls, sparse primary actions, and generous functional whitespace.
- **Runway:** a dominant media canvas, narrow tool rail, contextual inspector, processing state inside the output surface, and media-specific actions adjacent to the media.

### 9.2 Product character

The interface is ultraminimal, technical, calm, and precise. It must not feel editorial, cinematic-marketing, legal-document themed, or like a generic AI dashboard.

Required traits:

- dense enough for production work without becoming visually noisy;
- primarily neutral surfaces;
- hierarchy through layout, type weight, spacing, and separators;
- one obvious primary action per context;
- information-rich areas use rows, tables, rails, and inspectors instead of card grids;
- media and evidence receive the strongest contrast;
- motion explains state changes rather than decorating the shell.

Forbidden traits:

- serif fonts;
- oversized display headlines;
- warm paper backgrounds;
- gradients, glassmorphism, grain, and ambient decoration;
- nested cards;
- pill badges for every metadata value;
- excessive shadows;
- multicolor AI branding;
- chat bubbles as the primary representation of pipeline work.

### 9.3 Tokens

The default interface is light with a dark media surface.

```text
Background:       neutral near-white
Sidebar:          slightly darker neutral
Primary text:     near-black
Secondary text:   neutral gray
Borders:          low-contrast neutral, 1px
Media canvas:     graphite / near-black
Primary action:   cool technical blue
Risk critical:    restrained red
Risk warning:     restrained amber
Resolved:         restrained green
Radius:           6px controls, 8px containers, 10px overlays maximum
Shadow:           overlays only; none on ordinary content surfaces
```

Exact colors are encoded as OKLCH variables in the shadcn theme. Foundational components use semantic tokens rather than arbitrary Tailwind palette classes.

### 9.4 Typography

- Geist Sans is the only proportional interface family.
- Geist Mono is used for case IDs, timecodes, timestamps, percentages, counts, file metadata, revision hashes, pipeline stages, commands, and technical output.
- Body copy is generally 13–14px on desktop and 14–15px on touch devices.
- Page titles are generally 20–24px, semibold, with compact line height.
- Labels use sentence case. All-caps eyebrow labels are removed.
- Tabular figures are enabled for changing metrics.
- Legal-safety copy remains plain and direct.

### 9.5 Components

ClearCut owns the copied shadcn source. Primary primitives include:

- Button, Input, Textarea, Label, Select, Checkbox, and Form;
- Command and Dialog for the global command palette;
- Sheet for mobile inspectors and secondary workflows;
- Tabs for evidence sections and packet views;
- Table for production, source, revision, and document records;
- Dropdown Menu and Context Menu for row actions;
- Tooltip for icon-only tools;
- Scroll Area for rails and inspectors;
- Separator and Resizable for desktop panes;
- Skeleton for structural loading states;
- Alert Dialog for destructive actions;
- Sonner for terse, non-blocking confirmations.

Components are composed to match ClearCut's density and tokens. Default shadcn demo styling is not the product design.

## 10. Complete interface flow

### 10.1 Boot

The boot screen shows a compact ClearCut mark centered on a neutral surface. If startup exceeds 350ms, a three-line Geist Mono initialization sequence appears:

```text
CONFIG      READY
PROJECTS    LOADING
WORKSPACE   PENDING
```

Rows update in place. Errors become actionable rows with retry controls. No cinematic wordmark animation or generic spinner is used.

### 10.2 Production library

The persistent sidebar contains ClearCut, Productions, Archived, New scan, and the command shortcut. The main surface contains:

- a compact page header with the production count and one `New scan` action;
- search and status filters in a single toolbar;
- a flat production table on desktop;
- compact production rows on mobile;
- phase, unresolved count, critical count, last activity, and input coverage;
- contextual archive/restore actions;
- an honest empty state built from the same table frame.

Project art, marketing cards, and greeting copy are excluded.

### 10.3 Intake

Intake uses a focused two-column desktop layout:

- main column: screenplay and rough-cut file rows with drag/drop, progress, validation, replacement, and removal;
- inspector: production name, intended-use summary, supported formats, privacy note, and scan action.

The mobile layout becomes a single linear form. The primary action remains disabled until the selected combination passes server preflight. Errors stay beside the responsible file.

### 10.4 Analysis

Analysis uses a Cursor-like execution workspace:

- left rail: ordered pipeline stages and discovered-case count;
- center: structured activity log with compact stage groups and newly discovered candidates;
- right inspector: input coverage, elapsed time, active operation, research mode, and recovery state.

Pipeline output is rendered as status rows, citations, findings, and progress—not chat bubbles. New discoveries enter with a brief opacity/position transition. Completed stages collapse without removing their summary.

When timecoded findings are available, the center can switch to the media canvas before all research finishes. A `Review available cases` action appears as soon as at least one usable case exists; it does not require the entire pipeline to finish.

### 10.5 Review workspace

Desktop review uses three primary regions:

```text
case rail | media + timeline | evidence inspector
```

- The case rail is compact, searchable, filterable, and resizable.
- The media canvas is graphite and preserves the rough cut's aspect ratio.
- Timeline markers encode candidate position and state without filling the entire track with color.
- The inspector changes context with the selected case.
- The top bar contains project identity, phase, revision access, packet readiness, and the single most important current action.

The selected case survives reload and deep linking. Keyboard navigation moves between cases without stealing focus from forms or playback.

### 10.6 Evidence inspector

The inspector contains stable tabs:

- Overview
- Sources
- Rights route
- Documents
- Activity

Overview begins with risk, current status, source/cut reconciliation, the exact detected use, and the next human action. Sources are a flat citation ledger. Rights route contains candidate holders, contact routes, evidence gaps, and open questions. Documents contains scope state and attachments. Activity contains the immutable audit trail.

Human disposition controls remain visually distinct from agent research. The interface names the actor and rationale requirement before submission.

### 10.7 Documents and scope

Document management opens in a desktop side sheet and a full-height mobile sheet. It supports upload, recorded document type, media, territory, term, use, notes, replacement, metadata editing, and deletion confirmation.

Scope assessment displays recorded matches and gaps as a concise comparison table. It never claims to interpret legal language or prove permission.

### 10.8 Revisions and Version Ripple

Revision intake reuses the technical upload pattern. Comparison shows:

- a summary strip of unchanged, added, removed, materially changed, and stale-decision counts;
- a flat diff table tied to the project timeline;
- a contextual inspector explaining why a case changed and what will carry forward;
- a predecessor warning when the active project changed after comparison;
- one explicit `Apply reviewed revision` action.

Application success returns to the stable project URL with reopened cases visibly marked.

### 10.9 Packet

Packet preview uses a wide document column and a fixed readiness inspector. The document is technical and typographically quiet, not styled like an editorial report.

The readiness inspector lists incomplete research, unresolved cases, document-scope gaps, revision state, and export consequences. Preview creates no audit event. `Confirm and export Markdown` is explicit and never triggered by opening the page.

### 10.10 Copilot and commands

`Cmd/Ctrl+K` opens the global command palette for navigation and deterministic product commands. It does not place a chat prompt at the center of every screen.

Copilot opens as a contextual sheet. It can summarize the stored record and invoke live research through approved tools. It cannot alter a human disposition. Tool calls and citations are rendered as compact structured blocks.

### 10.11 Responsive behavior

- Desktop at 1280px and wider uses the full three-region review workspace.
- Tablet collapses the evidence inspector into a sheet while retaining the case rail and media.
- Mobile uses a media-first stack with a bottom case drawer and full-height evidence sheets.
- Tables become rows with retained label/value semantics; columns are not silently discarded.
- All touch targets are at least 44px even when visual controls appear compact.
- Panel widths, selected tabs, focus return, and scroll containment are verified at each breakpoint.

## 11. Motion and feedback

- Boot status rows update in place.
- Route changes use Next.js loading skeletons shaped like the destination.
- Selected rows use background and indicator changes without layout movement.
- Sheets and menus use short opacity/transform transitions.
- Timeline seeking and pane resizing remain immediate.
- SSE progress updates animate only the changed value or newly inserted row.
- Processing on the media canvas uses a restrained progress overlay with stage and percentage.
- Success messages are terse and have no exclamation marks.
- `prefers-reduced-motion` removes nonessential transforms and animated progress interpolation.

## 12. Error handling

### 12.1 API errors

Every non-stream error follows `ApiErrorSchema`. The error middleware attaches a request ID, hides secrets and stack traces in production, and distinguishes:

- validation errors;
- missing resources;
- illegal state transitions;
- upload and asset errors;
- credential/configuration errors;
- Gemini errors;
- Parallel errors;
- persistence errors;
- internal errors.

### 12.2 UI recovery

- Root boot resources retry independently.
- Route-level failures use `error.tsx` and preserve a path back to Productions.
- File errors stay attached to the file row and preserve other valid inputs.
- SSE failure changes connection status and activates polling.
- Mutation failures retain form input and restore focus to the relevant error summary.
- Destructive failures keep the confirmation context open.
- Partial research is displayed as partial research, never as an empty successful result.
- Missing live credentials expose fixture availability without silently switching modes.

## 13. Accessibility

- All product flows are operable by keyboard.
- Focus is trapped and restored for dialogs and sheets.
- The case rail, tabs, tables, timeline, media controls, and command palette use correct semantics.
- Status does not rely on color alone.
- Risk and evidence colors meet contrast requirements in both neutral and graphite surfaces.
- Live progress uses restrained `aria-live` announcements that do not repeat every token-level update.
- A skip link targets the main workspace.
- Reduced motion and responsive zoom are supported.
- Serious and critical automated accessibility violations block release.

## 14. Testing strategy

### 14.1 Domain tests

Run with `bun test`. Every safety invariant receives focused tests, including actor ownership, required rationales, late research, document requirements, revision predecessor checks, idempotency, carry-forward behavior, and packet audit semantics.

### 14.2 API tests

Hono requests are tested without binding a public port. Tests cover:

- every route's validation and response schema;
- upload limits and streaming behavior;
- byte-range cut responses;
- SSE event order, heartbeat, reconnect metadata, and fallback snapshots;
- webhook authentication and retry idempotency;
- Gemini/Parallel adapter failures and partial results;
- memory/filesystem adapters;
- D1/R2 adapter contract tests without making remote Cloudflare state a local prerequisite;
- edge routing, Container binding, internal binding-origin rejection, SSE pass-through, and request-abort propagation;
- R2 upload-session expiry, object-key scoping, multipart completion, metadata verification, and finalization idempotency;
- Gemini Files API and optional Vertex GCS staging cleanup through mocked provider boundaries.

### 14.3 Frontend tests

Component and integration tests cover:

- boot resource independence;
- library filtering and archive/restore;
- intake validation and upload recovery;
- analysis SSE and polling states;
- case selection, filters, timeline, and media coordination;
- document scope and human dispositions;
- revision comparison and application;
- packet confirmation semantics;
- command palette, copilot, focus, reduced motion, and responsive behavior.

### 14.4 End-to-end tests

Playwright starts the actual Next and Bun services in explicit fixture mode. Browser request interception is not the primary fake backend. Tests exercise the real shared contracts and server transitions.

A separate Cloudflare integration lane builds the OpenNext Worker, starts the edge Worker and local Container through Wrangler where Container tooling is available, and verifies same-origin `/api/health`, SSE headers, D1/R2 bindings, and direct-upload authorization. The ordinary local product loop remains Portless-based and does not depend on Wrangler.

The release flow covers:

1. first boot and returning library;
2. project creation with screenplay and cut;
3. visible processing through ready cases;
4. media review and evidence navigation;
5. document upload and scope gap;
6. human disposition;
7. revision creation, comparison, and application;
8. packet preview and confirmed export;
9. reload continuity and deep links;
10. desktop, tablet, mobile, keyboard, reduced motion, accessibility, and visual baselines.

## 15. Migration strategy

Migration is vertical and parity-gated:

1. Establish Bun workspace, shared contracts, and CI scripts without deleting the old app.
2. Port pure domain models and invariants with tests.
3. Port memory/filesystem repositories and API system/project routes.
4. Add D1/R2 repository adapters, migrations, and the provider-specific Gemini media-staging boundary.
5. Add the minimal edge Worker, named Container class, internal binding bridge, R2 upload sessions, and local Cloudflare contract tests.
6. Port Gemini, Parallel, pipeline, SSE, webhook, and packet services into the Bun API.
7. Scaffold the Next shell, OpenNext adapter, tokens, fonts, shadcn primitives, and product routes.
8. Rebuild library, intake, analysis, review, documents, revisions, packet, commands, and copilot as complete vertical slices.
9. Run old and new contract/fixture outputs against parity assertions where shapes overlap.
10. Pass both the Portless end-to-end lane and Cloudflare preview/integration lane.
11. Move the Portless `clearcut.lcl` route to the new Next service only after the end-to-end release flow passes.
12. Remove Vite, React 18-specific wiring, custom router, custom modal primitives, Python runtime, FastAPI, and generated static output.
13. Rewrite README, environment examples, Docker/Cloudflare deployment configuration, D1 migrations, R2 CORS setup, and verification commands for the new stack.

The migration must not maintain two production implementations after parity. Compatibility code is temporary and deleted in the same migration.

## 16. Verification commands

The final root scripts must provide:

```bash
bun install
bun run dev
bun run typecheck
bun run lint
bun test
bun run test:e2e
bun run build
bun run cf:typegen
bun run cf:check
```

`bun run dev` must start both Portless-backed services. `bun run build` must build the Next application and validate the Bun API entrypoint. `bun run cf:typegen` regenerates Worker binding types. `bun run cf:check` builds the OpenNext Worker, validates both Wrangler configurations and bindings, checks D1 migrations and R2 CORS configuration, and performs a non-deploying Cloudflare bundle validation. An opt-in `bun run cf:preview` starts the Workers/Container preview and an explicit `bun run cf:deploy` performs the authenticated deployment; neither is hidden inside local development.

The final local smoke check verifies both the user-facing application and `/api/health` through `https://clearcut.lcl`. The Cloudflare smoke check verifies the preview hostname, same-origin `/api/health`, one SSE connection, and a disposable R2 upload/finalize/read cycle.

## 17. Acceptance criteria

The migration is complete only when:

- the repository installs and runs through Bun;
- the frontend is the latest stable Next.js App Router line approved above;
- the UI uses shadcn/ui, Tailwind CSS v4, Geist Sans, and Geist Mono;
- no editorial font, warm paper theme, gradient, glass, or decorative card system remains;
- the Next.js application builds with OpenNext and runs as a Cloudflare Worker;
- the Bun API owns long-running work and runs with the Bun runtime inside a named Cloudflare Container;
- the edge Worker owns `/api/*`, Container routing, and native Cloudflare bindings without absorbing domain logic;
- all browser API traffic remains same-origin under `/api`;
- production API traffic does not pass through a Next.js Route Handler;
- D1 is the durable production project repository and R2 is the durable production asset store;
- rough-cut bytes upload directly to R2 using short-lived, scoped sessions and never cross the Next.js Worker or Bun Container;
- provider media staging is temporary and never replaces the R2 source of truth;
- all current product flows in section 2 are usable in the new application;
- all safety invariants in section 6.3 pass automated tests;
- SSE reconnect and polling recovery are visibly functional;
- desktop, tablet, mobile, keyboard, and reduced-motion paths pass;
- the complete Playwright release flow passes against the real fixture-mode Bun API;
- no browser console error appears in the full flow;
- `bun run typecheck`, `bun run lint`, `bun test`, `bun run test:e2e`, `bun run build`, `bun run cf:typegen`, and `bun run cf:check` pass;
- README and `idea.md` describe the application that actually runs;
- the Vite frontend and Python backend are removed after parity, not left as the default implementation.

## 18. Approved decision record

Three architectures were considered:

- a single Next.js application running on Bun;
- a Next.js frontend with a separate Bun API;
- a Next.js frontend, Bun API, and durable external job service.

The approved choice is the second option. The Cloudflare deployment refines it rather than changing it: OpenNext runs the web application in a Worker, a more-specific `/api/*` Worker route owns a thin gateway, and that gateway forwards to one named Container running the Bun API. R2 direct uploads isolate both runtimes from large media bodies; D1 and R2 provide production persistence; shared Zod contracts and one same-origin browser surface keep the system coherent. A Queue, Workflow, or Container pool remains a later durability decision.

## 19. Platform references

The Cloudflare-specific decisions are based on the official platform documentation:

- [Next.js on Cloudflare Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare Containers: get started](https://developers.cloudflare.com/containers/get-started/)
- [Container class and lifecycle](https://developers.cloudflare.com/containers/container-class/)
- [Container scaling and routing](https://developers.cloudflare.com/containers/platform-details/scaling-and-routing/)
- [Container access to Worker bindings](https://developers.cloudflare.com/containers/platform-details/workers-connections/)
- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2 upload options](https://developers.cloudflare.com/r2/objects/upload-objects/)
