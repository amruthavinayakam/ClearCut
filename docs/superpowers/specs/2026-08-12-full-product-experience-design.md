# ClearCut Full Product Experience Design

**Status:** Proposed for implementation

**Date:** 2026-08-12

**Branch baseline:** `aritro` at `8d3e9de`

**Product:** Clearance Radar / ClearCut

## 1. Purpose

ClearCut will become a complete, product-first clearance research workspace. The entire application is the judged artifact: application boot, project library, intake, analysis, review, evidence, document handling, revisions, export, recovery, accessibility, and return visits must all feel deliberate and finished.

This design retains the existing working pipeline and partner integrations. It does not improve live external-data behavior in this cycle. The work focuses on local application behavior, information architecture, revision-aware data, deterministic document-scope comparison, UI quality, motion, resilience, and verification.

The defining experience is an ultraminimal **Film Lab** interface that produces three functional visual moments from real application state:

1. Scan Reveal
2. Evidence Graph
3. Version Ripple

These are not demos, tours, replays, or judge-only modes. They are how users understand detections, evidence relationships, and revision changes while doing normal work.

## 2. Product principles

### 2.1 Product before presentation

- No demo mode, fake progress, hardcoded outcomes, scripted playback, or promotional interstitials.
- The seeded project is a secondary example action and follows the same product paths as user uploads.
- The interface never blocks work to play an animation.
- All displayed metrics are derived from stored project state.
- System and vendor details are available in activity and settings, not persistent marketing badges.

### 2.2 Research, not legal clearance

- The product calls detections “clearance questions,” “signals,” or “items,” never legal violations.
- Public ownership information remains candidate evidence.
- Detection confidence, research confidence, document scope, and human disposition remain separate concepts.
- No absent search result, missing holder, or high model confidence can produce a resolved state.
- Human-owned decisions retain a rationale and audit event.

### 2.3 Ultraminimalism

- One primary task dominates every screen.
- Persistent chrome is limited to product identity, current context, and one utility menu.
- Containers exist only when they clarify hierarchy; the interface avoids a wall of cards.
- Color is sparse and semantic. Large colored surfaces, glass effects, decorative gradients, and neon are excluded.
- Motion occurs when state changes, then stops.
- Secondary detail is progressively disclosed in drawers, inspectors, and ledgers.

### 2.4 Professional continuity

- A returning user can resume the previous project, case, filter, and playback position.
- Completed work survives revisions; only affected items reopen.
- Partial analysis results remain available when a later stage fails.
- Empty, loading, processing, ready, partial, failed, archived, and not-found states are explicit.

## 3. Scope

### 3.1 In scope

- Complete application boot and configuration state
- Project library and empty state
- Guided new-project intake
- Upload validation and preflight
- Analysis workspace using real pipeline stages and partial results
- Scan Reveal generated from reconciled project data
- Adaptive desktop review workspace
- Accessible Evidence Graph and source ledger
- Human review actions and confirmations
- Production document upload and metadata
- Deterministic intended-use versus document-scope comparison
- New script/cut revisions inside an existing project
- Revision comparison and Version Ripple
- Packet preview and confirmed Markdown export
- Activity, audit, and project settings surfaces
- Deep links and return-state continuity
- Desktop, tablet, and essential mobile review layouts
- Keyboard operation and reduced-motion behavior
- Frontend unit/integration tests, backend API/domain tests, and end-to-end browser tests

### 3.2 Out of scope for this cycle

- Changes to Parallel Search, Task, or Monitor request quality
- New live research providers
- Authentication, organizations, billing, invitations, or multi-tenant permissions
- Automatic legal opinions
- Automated correspondence sending
- Contract negotiation or payment
- PDF packet generation
- Mobile-first revision comparison
- Feature-length video optimization
- Replacement of the existing Vite, React, FastAPI, Gemini, or ADK stack

Existing live integrations remain functional and visible through normal states, but they do not drive the implementation sequence or acceptance criteria for this cycle.

## 4. Information architecture

The frontend moves from a single conditional component to route-based product views:

| Route | Purpose |
| --- | --- |
| `/` | Project library or first-run state |
| `/projects/new` | New-project intake |
| `/projects/:projectId` | Analysis or review workspace based on project state |
| `/projects/:projectId/revisions/new` | Revision intake and preflight |
| `/projects/:projectId/revisions/:revisionId` | Revision comparison and ripple explanation |
| `/projects/:projectId/packet` | Packet preview and export confirmation |

The selected clearance item is represented in the workspace query string as `?item=<item-id>`. This enables deep linking without creating a separate page per item.

Application-wide overlays:

- Command palette
- Activity drawer
- Project settings sheet
- Confirm-action sheet
- Source ledger drawer

Overlays preserve the underlying route and return focus to their trigger when closed.

## 5. Full user flow

### 5.1 Application boot

The initial frame is a warm-black canvas with a small ClearCut wordmark. The application requests configuration and the project index immediately.

- If both requests resolve in under 350 ms, the shell crossfades directly into the destination.
- If work exceeds 350 ms, a structural skeleton appears without a fake progress indicator.
- The boot mark never delays navigation.
- A configuration failure shows the failing capability, its effect, and a retry action.
- If project listing fails but creation is available, the user can still start a new project.

### 5.2 Project library

First-time state:

- Product statement: “Find what entered between the page and the screen.”
- Primary action: **New clearance scan**
- Secondary action: **Open example project** when seeded assets are available
- A short research-only notice

Returning state:

- A compact list ordered by most recently updated
- Project title, current script/cut labels, updated time, unresolved count, and one state label
- State labels: Processing, Needs review, Ready for counsel, Documented, Reopened, Failed
- Search by production title
- Keyboard selection and Enter to open
- New project remains the only filled primary action

The home screen contains no vendor chips, feature grid, architecture explanation, dashboard charts, or promotional hero animation.

### 5.3 New-project intake

Intake is a single calm workspace with three sequential sections rather than a multi-page wizard:

1. Production title
2. Screenplay
3. Rough cut

Each file row shows filename, type, size, and validation status. For video it also shows detected duration. For screenplay it shows whether a readable text layer is present after server preflight.

Rules:

- Either screenplay or cut is allowed; both are recommended.
- Screenplay formats match server support.
- Video must be a supported video MIME type and remain below the configured upload limit.
- Client validation is advisory; server validation is authoritative.
- Files can be replaced or removed before submission.
- Drag-and-drop and file-picker flows are equivalent.
- The submit label describes the action: **Start clearance analysis**.
- Submission shows upload progress only when measurable.

The final preflight sentence states which assets will be analyzed and what will be missing if only one asset is supplied.

### 5.4 Analysis workspace

Analysis uses the uploaded cut as soon as it can be served. With no cut, the screenplay title/page context becomes the visual anchor.

The interface shows:

- Current stage in plain language
- Completed stages as a thin textual sequence
- The video or script anchor
- Timeline signals as detections become available
- A collapsed activity control with event count
- A cancel-navigation warning only while an upload itself is in progress

Pipeline stages are the server’s actual states: reading script, scanning script, scanning cut, reconciling, researching, ready, or failed. The UI does not invent percentages for model or research work.

Partial-result behavior:

- Completed detections stay visible if reconciliation or research fails.
- A failed item shows its own retry state without hiding successful items.
- A lost event stream falls back to periodic project refresh and announces the connection change non-disruptively.
- Users may enter review while remaining research items continue.

### 5.5 Scan Reveal

When a newly completed revision first reaches a reviewable state, its detected items resolve onto the timeline in chronological order. This is an orientation transition, not a presentation users must watch.

- Each marker enters once from its actual timecode.
- Markers stagger by no more than 55 ms.
- The summary derives from current data, for example: “5 clearance questions. 3 entered through production.”
- Clicking anywhere in the workspace immediately ends staging and enables direct interaction.
- Returning to an already-seen revision opens directly in settled review mode.
- Reduced-motion users see the settled state immediately.
- There is no replay button.

Seen state is stored per project revision in local UI preferences. It has no effect on project evidence or workflow status.

### 5.6 Adaptive review workspace

Desktop layout has three functional regions:

1. **Case rail** — compact, filterable list of clearance items
2. **Picture workspace** — video, playhead, and heatmap
3. **Evidence inspector** — selected item relationship and available human action

Behavior:

- The selected item is the only strongly emphasized case.
- Selecting a case seeks to its first timecode when one exists.
- Selecting a timeline signal selects its case.
- Script-only cases remain reviewable and show their page/scene anchor.
- The evidence inspector is sticky within viewport limits and independently scrollable only when necessary.
- Queue filters are All, Unscripted, Unresolved, Incomplete, Verified, Documented, and Reopened.
- Sort defaults to production urgency: reopened, unscripted, materially changed, unresolved, then remaining items.
- Search covers item name, category, scene heading, and rights-holder candidate.

Project-level actions—add revision, preview packet, settings, and activity—live in a compact context menu. Copilot becomes a collapsible utility drawer rather than a permanent panel.

### 5.7 Evidence Graph

The graph is an accessible DOM relationship view, not an infinite canvas. It reads in this order:

1. Source frame or script reference
2. Script-to-cut relationship
3. Clearance element identity
4. Candidate rights holders
5. Licensing routes
6. Public sources
7. Production documents
8. Evidence gaps
9. Recommended human action

Interaction:

- The first three nodes are always present.
- Research, source, and document branches appear only when data exists.
- Selecting a node expands its supporting detail below the graph.
- Selecting Sources opens the source ledger with URL, excerpt, retrieval date, provider, and supported field.
- Selecting a production document opens recorded scope and the deterministic scope assessment.
- Graph edges express relationship only; they do not imply model reasoning or hidden chain-of-thought.
- The graph has a linear screen-reader representation using the same DOM content.

Motion:

- Nodes enter in relationship order with 45–55 ms overlap.
- Only opacity and transform animate.
- An already-open graph updates with a restrained crossfade when selection changes.
- No node pulses continuously.

### 5.8 Human review and decisions

The primary action is chosen from the item’s current state. Secondary actions appear in an overflow menu.

Supported actions:

- Verify candidate match
- Dismiss as false positive
- Mark waiting on rights holder
- Request replacement
- Record documented permission
- Approve replacement
- Record counsel sign-off
- Attach production document
- Assign owner label
- Draft permission request
- Start or inspect a monitor using the existing integration

Consequential state changes open a compact confirmation sheet containing:

- Item and target state
- Actor role
- Required rationale
- Related document selection when recording documented permission
- Confirmation action with exact language

The visible “Test: let the AI approve it” control is removed. The invariant remains in automated tests and server enforcement.

### 5.9 Production documents and scope

Users can attach a release, licence, permit, correspondence, or other record from the evidence inspector.

Stored metadata:

- Original filename and MIME type
- Document kind and title
- Notes
- Recorded media
- Recorded territories
- Start and end dates, or perpetual term
- Covered element/use description
- Attached by and attached time

Project settings store the intended distribution profile:

- Intended media, including theatrical, broadcast, streaming, social, festival, and internal
- Intended territories
- Intended start/end dates when known

A deterministic comparator returns one of:

- `covers` — every recorded intended dimension is represented
- `partial` — at least one intended dimension is missing
- `unknown` — document metadata is insufficient to compare
- `expired` — recorded end date precedes intended use

The comparator reports specific gaps such as “Streaming is not listed in recorded media.” It does not determine legal sufficiency. A document attachment never automatically turns an item green. A human must explicitly record documented permission.

The first implementation stores uploaded files through a storage abstraction with a local filesystem implementation. The interface must not assume local storage so a cloud implementation can replace it later.

### 5.10 Revision intake

**Add revision** creates a new revision inside the current project. Users can supply a revised screenplay, cut, or both.

Preflight shows:

- Current version labels
- Proposed next labels
- Which asset remains unchanged
- Expected comparison scope

Submitting a revision never replaces the current review state immediately. The new revision processes independently until its comparison result is ready. Failed revision processing leaves the previous revision active and intact.

### 5.11 Revision model and comparison

Each completed project revision stores:

- Revision identifier and sequence
- Script and cut version references
- Created time and actor label
- Processing state
- Snapshot of clearance items at completion
- Comparison summary against its predecessor

Comparison outcomes:

- `unchanged`
- `added`
- `removed`
- `materially_changed`
- `decision_stale`

Rules:

- Unchanged items retain their stable item identity, evidence, documents, assignment, and human disposition.
- Added items enter as detected/researching according to pipeline state.
- Removed items leave the active queue but remain visible in revision history.
- Materially changed items retain history and documents but transition to `reopened_by_revision`.
- A previously documented or approved item becomes `decision_stale` when its recorded use no longer matches the new observation.
- Every reopen records previous status, new revision, change explanation, and source anchor.
- A failed comparison must not reopen any item.

Stable identity is based on explicit revision matching, not only normalized display names. The comparison layer may use category/name/timecode heuristics as fallback, but every result is stored and inspectable.

### 5.12 Version Ripple

The revision route overlays previous and current signal timelines.

- Unchanged signals remain fixed and low contrast.
- Added signals enter from their new timecodes.
- Removed signals contract and remain as labeled history.
- Materially changed and stale decisions move once from old to new anchors with an oxblood-to-amber state change.
- The affected case rail contains only changed cases by default.
- Selecting a ripple opens a plain-language explanation, before/after evidence, and the exact prior decision affected.
- **Apply revision** makes the new revision active after comparison has succeeded.

The ripple is derived entirely from stored comparison outcomes. It cannot be triggered with hardcoded sample timing.

### 5.13 Packet preview and export

Packet export becomes a route with an application preview before download.

The preview includes:

- Production and active revision
- Intended-use profile
- Status summary derived from items
- Script-to-cut reconciliation summary
- Open and reopened items first
- Timecodes and script references
- Candidate holders and routes
- Evidence gaps and sources
- Production document metadata and scope gaps
- Human decisions and audit history
- Research-only disclaimer

Export requirements:

- Markdown remains the generated format in this cycle.
- Export is enabled for partial projects but visibly labels incomplete research.
- A final confirmation records `packet_exported` with actor label and revision identifier.
- The packet is always generated from current server state, never a stale client snapshot.

### 5.14 Return visits and continuity

- Direct project links restore the project without requiring a prior home visit.
- Selected item is restored from the URL.
- Filter, queue width, evidence drawer state, and video position are stored locally per project.
- A missing project returns a deliberate not-found state with a route back to Projects.
- If a remembered item no longer belongs to the active revision, the workspace selects the first reopened or unresolved item and explains the change non-modally.

## 6. Visual system: ultraminimal Film Lab

### 6.1 Palette

| Token | Purpose |
| --- | --- |
| `canvas` `#0B090A` | Application background |
| `surface` `#110E10` | Raised working surface |
| `surface-strong` `#171214` | Selected/active region |
| `bone` `#F1E8DA` | Primary text |
| `muted` `#968C84` | Secondary text |
| `line` `rgba(241,232,218,.12)` | Structural divider |
| `amber` `#D99A52` | Active evidence and focus signal |
| `oxblood` `#7C273B` | Reopened or materially changed state |
| `risk` `#CC4D5C` | Unresolved state |
| `verified` `#6686A0` | Coordinator verified |
| `documented` `#66876F` | Human-documented disposition |
| `dismissed` `#706A67` | False positive/history |

Semantic colors appear as text, dots, thin rules, and timecode markers—not large filled cards. Every color state also has a text label and shape/icon difference.

### 6.2 Typography

- UI and body: a bundled variable geometric sans with open counters
- Signal headlines: a bundled restrained editorial serif used only for major findings and empty states
- Timecodes, identifiers, and metadata: system monospace
- Body text maintains at least 1.45 line height
- Uppercase labels are limited to short metadata labels
- No generic dashboard numerals or oversized metric tiles

Font assets must be bundled with the application rather than fetched at runtime.

### 6.3 Shape and depth

- Four- to eight-pixel radii
- One-pixel structural borders
- No heavy shadows
- No glassmorphism
- No decorative gradients
- Localized low-opacity amber or oxblood bloom is allowed only during a state transition and disappears when settled
- Video and frame imagery provide most visual depth

### 6.4 Iconography

- Use a small consistent set of filled or bold technical icons
- Do not introduce a broad generic icon library into every label
- Important actions retain text labels
- Status is never communicated by icon alone

## 7. Motion system

Motion communicates causality and hierarchy.

| Interaction | Duration | Behavior |
| --- | ---: | --- |
| Button/row response | 80–120 ms | Small scale or opacity response |
| Drawer/sheet | 180–240 ms | Origin-aware transform and fade |
| Item selection | 160–220 ms | Inspector crossfade and marker emphasis |
| Scan signals | 200–260 ms each | Staggered from real timecodes |
| Evidence nodes | 180–240 ms each | Ordered overlap, total under 500 ms |
| Version ripple | 360–520 ms | One causal transition, then static |

Constraints:

- Animate only transform and opacity.
- Avoid linear easing.
- Never animate scrolling containers continuously.
- No ambient looping motion.
- No autoplay sound.
- `prefers-reduced-motion` removes staging and presents stable final states.
- Motion must not change reading order or delay controls.

## 8. Responsive design

### Desktop: 1200 px and above

- Full three-region review workspace
- Persistent compact case rail
- Side-by-side revision comparison
- Evidence graph and detail in the inspector

### Tablet: 768–1199 px

- Picture workspace remains primary
- Case rail collapses into a left sheet
- Evidence inspector becomes a right sheet or lower pane
- Revision timelines stack but remain comparable

### Mobile: below 768 px

- Supports project library, intake, processing status, video playback, case list, evidence reading, and simple human actions
- Uses a single-column flow with bottom sheets
- Revision comparison is read-only and summarized; applying a revision asks the user to continue on a larger screen
- Document metadata can be inspected, but complex scope editing is desktop/tablet-first

No essential status or evidence is hidden solely because of viewport size.

## 9. Accessibility and input

- Every function is keyboard operable.
- Focus is visible with an amber outer ring that meets contrast requirements.
- Sheets and dialogs trap focus and restore it on close.
- Timeline markers are buttons with item name, state, and timecode labels.
- Evidence Graph has a logical linear reading order.
- Status uses label and icon/shape in addition to color.
- Live processing updates use polite announcements; errors use assertive announcements.
- Video controls remain native unless a replacement meets equivalent accessibility.
- Target sizes are at least 40 by 40 CSS pixels for primary touch actions.
- Command palette opens with `Meta/Ctrl+K`.
- `Escape` closes the topmost overlay.
- Arrow keys move through cases when focus is within the case rail.
- Keyboard shortcuts never fire while typing in an input or editor.

## 10. Frontend architecture

The frontend remains React + TypeScript + Vite. It adopts route-based views and feature-focused modules.

Proposed boundaries:

```text
frontend/src/
  app/
    AppShell.tsx
    router.tsx
    bootstrap.ts
  features/projects/
    ProjectLibrary.tsx
    NewProject.tsx
    project-preferences.ts
  features/analysis/
    AnalysisWorkspace.tsx
    ScanReveal.tsx
    activity-model.ts
  features/review/
    ReviewWorkspace.tsx
    CaseRail.tsx
    PictureWorkspace.tsx
    EvidenceGraph.tsx
    EvidenceInspector.tsx
    SourceLedger.tsx
  features/documents/
    DocumentSheet.tsx
    ScopeAssessment.tsx
  features/revisions/
    NewRevision.tsx
    RevisionCompare.tsx
    VersionRipple.tsx
  features/export/
    PacketPreview.tsx
  components/
    Dialog.tsx
    Drawer.tsx
    CommandPalette.tsx
    StatusMark.tsx
  api/
    client.ts
    project-stream.ts
  styles/
    tokens.css
    base.css
    motion.css
```

Large existing components are split only where this design changes them. Components consume typed project data and dispatch API actions; they do not duplicate workflow rules from the server.

Dependency posture:

- Add a router for real product routes.
- Add one motion library only if shared-layout choreography cannot be expressed clearly with CSS transitions.
- Prefer native dialog/details/video primitives behind tested wrappers.
- Avoid a general component suite, canvas graph library, or global state framework.

## 11. Backend and domain architecture

The backend remains FastAPI + Pydantic. New domain work is isolated from provider clients.

Proposed modules:

```text
backend/app/
  assets.py             # local/GCS blob storage for scripts, cuts, and documents
  documents.py          # document metadata operations
  scope.py              # deterministic intended-use comparison
  revisions.py          # revision lifecycle and snapshot comparison
  export.py             # extended current-state packet generation
```

API additions:

```text
GET    /api/projects/{project_id}/revisions
POST   /api/projects/{project_id}/revisions
GET    /api/projects/{project_id}/revisions/{revision_id}
POST   /api/projects/{project_id}/revisions/{revision_id}/apply
POST   /api/projects/{project_id}/items/{item_id}/documents
GET    /api/projects/{project_id}/items/{item_id}/documents/{document_id}
PATCH  /api/projects/{project_id}/items/{item_id}/documents/{document_id}
DELETE /api/projects/{project_id}/items/{item_id}/documents/{document_id}
PATCH  /api/projects/{project_id}/use-profile
POST   /api/projects/{project_id}/packet-exports
```

Status request schemas use the `WorkflowStatus` and `Actor` types directly, not plain strings. Undefined workflow states are rejected before mutation.

Provider boundaries remain unchanged. Revision processing may invoke the existing scan/research pipeline, but snapshot comparison, document scope, audit, export, and UI acceptance tests do not require live provider credentials.

## 12. Persistence and concurrency

- Project revisions and document metadata persist with projects.
- The project index queries persistent storage when Firestore is enabled; it is not limited to objects already loaded by the current process.
- Monitor persistence remains outside this cycle unless needed to prevent regression.
- Screenplays, cuts, and production documents use one blob-storage interface with local-filesystem and Google Cloud Storage implementations. Cloud deployments use GCS when configured; local development remains self-contained.
- Uploaded files are addressed by opaque storage keys, never raw user filenames.
- Script and cut versions retain their storage key and MIME type so playback, revision comparison, and document review survive process restarts.
- Document downloads validate that the document belongs to the requested project/item.
- Applying a revision is idempotent.
- A revision carries an expected predecessor identifier; applying against a different active revision returns a conflict instead of overwriting newer work.
- Audit events use unique identifiers and record revision context.
- Long-running processing never overwrites a later human decision.

## 13. Error and recovery design

| Failure | Required behavior |
| --- | --- |
| Boot/config request | Show affected capability, retry, and any still-available action |
| Invalid screenplay/video | Keep valid fields, identify the specific invalid file |
| Upload interruption | Preserve intake values and permit retry |
| Script scan failure | Retain cut results and mark script relationship unavailable |
| Cut scan failure | Retain script candidates and mark timecoded view unavailable |
| Research item failure | Keep the item unresolved with item-level retry affordance |
| Event stream loss | Switch to polling and display a quiet connectivity notice |
| Revision failure | Keep prior revision active and intact |
| Comparison conflict | Refresh active revision and ask user to compare again |
| Document upload failure | Preserve entered metadata and allow file retry |
| Export failure | Keep preview visible and permit regeneration |
| Unauthorized transition | Preserve state and display server rationale |

Raw exception class names and stack details are not shown to users. They remain in server logs and the technical activity view when safe.

## 14. Testing and verification

### 14.1 Backend domain tests

- Valid and invalid workflow transitions
- Undefined status rejection
- Document metadata validation
- Scope outcomes for covers, partial, unknown, and expired
- Revision comparison for unchanged, added, removed, materially changed, and stale decisions
- Unchanged human disposition preservation
- Changed-item reopening with version-linked audit event
- Failed comparison produces no mutations
- Applying the same revision twice is idempotent
- Packet output matches the active revision and current scope assessments

### 14.2 API integration tests

- Create and list projects
- Upload preflight failures
- Create revision and retrieve comparison
- Apply revision conflict behavior
- Upload/update/delete/download a document with ownership checks
- Update intended-use profile
- Record status with typed schema validation
- Confirm packet export and audit record

### 14.3 Frontend tests

- Boot fast path, skeleton path, degraded path, and retry
- First-run and returning project library
- Intake keyboard/drop/replace/remove flows
- Partial analysis states
- Scan Reveal occurs only once per revision
- Case/timeline selection synchronization
- Evidence Graph disclosure and linear accessibility
- Status confirmations and rejected transition errors
- Document scope gap rendering
- Revision Ripple outcome rendering
- Deep-link restoration and missing-item fallback
- Reduced-motion stable states

### 14.4 End-to-end journeys

Browser tests use deterministic local fixtures and no live external credentials:

1. First visit → create project → analysis states → review
2. Open seeded project → inspect unscripted item → verify match
3. Attach a licence without streaming → see explicit partial scope → keep item amber
4. Add revised cut → compare → apply → only changed item reopens
5. Preview packet → confirm export → audit event appears
6. Reload deep link → selected case and playback context restore
7. Navigate the primary workflow with keyboard only
8. Run the same paths with reduced motion

### 14.5 Visual and quality gates

- Production TypeScript build passes
- Backend tests pass without credentials
- Frontend unit/integration tests pass
- End-to-end browser suite passes at desktop and tablet widths
- Mobile smoke flow passes for library, review, and evidence
- Accessibility scan has no serious or critical violations on core routes
- Screenshot baselines cover boot, library, intake, processing, review, evidence, document scope, revision comparison, and packet preview
- No runtime network request is made for font assets

## 15. Implementation slices and dependency order

The design should be implemented as eight coherent slices:

1. **Foundation:** routes, application shell, tokens, primitives, bootstrap states, test harness
2. **Projects and intake:** project library, empty state, intake, validation, upload flow
3. **Analysis:** progress model, partial states, activity drawer, organic Scan Reveal
4. **Review:** adaptive workspace, case rail, picture/heatmap, Evidence Graph, source ledger
5. **Human work:** confirmations, typed status API, documents, intended-use profile, scope comparison
6. **Revisions:** snapshots, comparison, revision intake, Version Ripple, apply workflow
7. **Packet and continuity:** preview, confirmed export, audit, deep links, local preferences
8. **Hardening:** error recovery, responsive passes, accessibility, performance, visual regression

Each slice must leave the application buildable and independently testable. Revisions depend on the review and human-work models. Packet work depends on document scope and active revision state. Hardening begins within every slice and concludes with a dedicated cross-flow pass.

## 16. Acceptance criteria

The cycle is complete when:

- A first-time user can understand the product and start a scan without explanation.
- A returning user can locate and resume a project from the library.
- Intake handles valid, invalid, missing, replaced, and interrupted files deliberately.
- Processing exposes actual stages and preserves partial results.
- The Scan Reveal is generated from current project data and never blocks work.
- The review workspace remains legible with at least 50 clearance items.
- The Evidence Graph exposes every available relationship without becoming a card wall.
- Human actions require rationale where consequential and remain server-enforced.
- A production document can be uploaded, inspected, updated, and compared against intended use.
- A document missing streaming scope produces an explicit partial assessment and no automatic green state.
- Recording `documented_permission` requires selecting at least one attached document; counsel sign-off remains a separate disposition.
- Uploaded scripts, cuts, and documents remain available after an application-process restart when cloud persistence is enabled.
- A revised script or cut can be added to an existing project.
- Revision comparison preserves unchanged work and reopens only affected items.
- Version Ripple accurately depicts stored comparison outcomes.
- Packet preview and export use current active-revision state and create an audit event.
- Direct links, reloads, keyboard navigation, reduced motion, tablet layout, and essential mobile review work.
- All automated and visual quality gates in Section 14 pass without live external credentials.

## 17. Explicit non-goals and rejected directions

- Do not migrate to Next.js, Tailwind, React Flow, or a generic component system.
- Do not build the experience around chat.
- Do not keep every panel permanently visible.
- Do not create a promotional landing page inside the app.
- Do not add cinematic animation to mundane actions.
- Do not force every project to reach all-green status before export.
- Do not treat a seeded outcome as a product metric.
- Do not surface the safety-invariant test as a primary user control.
- Do not let client-declared actor strings become proof of real-world identity; authentication remains a future product boundary, and current copy must describe roles rather than authenticated users.
