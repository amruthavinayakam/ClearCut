# ClearCut Full Product Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete product-first ClearCut application, from boot and project intake through analysis, review, document scope, revisions, Version Ripple, and packet export.

**Architecture:** Keep FastAPI/Pydantic and React/Vite, but split the single-screen frontend into route-based feature modules. Add provider-independent domain services for assets, document scope, and revision comparison; preserve the existing Gemini/Parallel pipeline behind those boundaries. Build Scan Reveal, Evidence Graph, and Version Ripple from stored application state, with deterministic tests that require no live credentials.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, pytest, React 18, TypeScript 5, Vite 5, Vitest, Testing Library, Playwright, CSS custom properties and Web Animations/CSS transitions.

## Global Constraints

- The entire application is the judged artifact; do not add demo-only routes, controls, fake progress, hardcoded outcomes, scripted playback, or reveal replays.
- Keep existing Gemini, Google ADK, and Parallel Search/Task/Monitor behavior intact; live-data quality changes are out of scope.
- Keep Vite, React, FastAPI, and the current API prefix. Do not migrate to Next.js, Tailwind, React Flow, a component suite, or a global state framework.
- Use the ultraminimal Film Lab tokens from the approved specification: warm black, bone text, sparse oxblood/amber semantic accents, thin rules, no glassmorphism, no decorative gradients, and no heavy shadows.
- Motion must arise from state, animate only transform and opacity, stop when settled, never block controls, and have a complete `prefers-reduced-motion` equivalent.
- Do not fetch fonts at runtime. Bundle the selected sans and editorial-serif files through npm packages or checked-in WOFF2 assets.
- All state-changing backend requests use typed Pydantic enums and produce audit events. Undefined workflow states must return 422 without mutation.
- No document attachment or automated result may set a human-owned approval state. `documented_permission` requires an explicit human transition referencing an attached document.
- All deterministic tests and end-to-end fixtures run with `MOCK_RESEARCH=true` and without Google or Parallel credentials.
- Development remains available through the existing `https://clearcut.lcl` Portless route.

---

## File Structure

Create feature-focused frontend modules and small provider-independent backend services. Existing `frontend/src/App.tsx`, `Workspace.tsx`, `ItemDetail.tsx`, and `styles.css` are migration sources; delete them only after their behavior has moved and tests pass.

```text
backend/app/
  assets.py
  documents.py
  scope.py
  revisions.py
frontend/src/
  app/{AppShell,router,bootstrap}.tsx
  api/{client,project-stream}.ts
  components/{Dialog,Drawer,StatusMark,CommandPalette}.tsx
  features/projects/{ProjectLibrary,NewProject,project-preferences}.tsx
  features/analysis/{AnalysisWorkspace,ScanReveal,useProjectFeed}.tsx
  features/review/{ReviewWorkspace,CaseRail,PictureWorkspace,EvidenceGraph,EvidenceInspector,SourceLedger}.tsx
  features/documents/{DocumentSheet,ScopeAssessment}.tsx
  features/revisions/{NewRevision,RevisionCompare,VersionRipple}.tsx
  features/export/PacketPreview.tsx
  styles/{tokens,base,motion}.css
  test/setup.ts
frontend/tests/e2e/
```

---

### Task 1: Establish Typed Verification Baselines

**Files:**
- Create: `requirements-dev.txt`
- Create: `backend/tests/test_api.py`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/test/setup.test.ts`
- Modify: `backend/app/main.py:341-386`
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.json`

**Interfaces:**
- Produces: `StatusChange(status: WorkflowStatus, actor: Actor, actor_name: str, rationale: str)`.
- Produces: frontend scripts `test`, `test:watch`, and `test:e2e`.
- Produces: `frontend/src/app/router.ts` tests that later route work must satisfy.

- [ ] **Step 1: Add backend failing tests for typed transition requests**

```python
def test_unknown_status_is_rejected_without_mutation(client, project_with_item):
    project_id, item_id = project_with_item
    response = client.post(
        f"/api/projects/{project_id}/items/{item_id}/status",
        json={"status": "invented_state", "actor": "coordinator", "rationale": "invalid"},
    )
    assert response.status_code == 422
    assert client.get(f"/api/projects/{project_id}").json()["items"][0]["workflow_status"] == "detected"
```

- [ ] **Step 2: Install test dependencies and verify the backend test fails**

Run: `.venv/bin/pip install -r requirements-dev.txt && .venv/bin/pytest backend/tests/test_api.py -q`

Expected: the unknown status request reaches `ClearanceItem.transition()` or fails with 500 instead of returning schema-level 422.

- [ ] **Step 3: Type the request schema with domain literals**

```python
class StatusChange(BaseModel):
    status: WorkflowStatus
    actor: Actor = "coordinator"
    actor_name: str = ""
    rationale: str = Field(min_length=1, max_length=1000)
```

- [ ] **Step 4: Add frontend test tooling**

Run: `npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test @axe-core/playwright`

Configure Vite with `environment: "jsdom"`, `setupFiles: ["./src/test/setup.ts"]`, and scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 5: Run all existing and new verification gates**

Run: `.venv/bin/pytest backend/tests/test_api.py -q`

Expected: PASS.

Run: `.venv/bin/python -m backend.tests.test_offline`

Expected: all 55 existing checks pass.

Run: `npm test`

Expected: the setup smoke test passes.

Run: `npm run build`

Expected: TypeScript production build passes.

- [ ] **Step 6: Commit**

```bash
git add requirements-dev.txt backend/tests backend/app/main.py frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig.json frontend/src/test
git commit -m "test: establish typed product verification"
```

---

### Task 2: Persist Uploaded Assets Behind One Storage Interface

**Files:**
- Create: `backend/app/assets.py`
- Create: `backend/tests/test_assets.py`
- Modify: `backend/app/models.py:404-421`
- Modify: `backend/app/main.py:46-55,123-181,246-294`
- Modify: `backend/app/pipeline.py:51-130`
- Modify: `backend/app/config.py`

**Interfaces:**
- Produces: `StoredAsset(key, original_name, mime_type, size_bytes)`.
- Produces: `AssetStore.put_bytes(data, original_name, mime_type) -> StoredAsset`.
- Produces: `AssetStore.read_bytes(key) -> bytes`, `local_path(key) -> AsyncContextManager[Path]`, and `delete(key) -> None`.
- Produces: `get_asset_store() -> AssetStore`, choosing filesystem locally and GCS when `GCS_BUCKET` is set.
- Updates: `ScriptVersion.storage_key`, `ScriptVersion.mime_type`, `CutVersion.storage_key`, and `CutVersion.mime_type`.

- [ ] **Step 1: Write failing storage round-trip and traversal tests**

```python
async def test_filesystem_store_uses_opaque_key(tmp_path):
    store = FilesystemAssetStore(tmp_path)
    asset = await store.put_bytes(b"cut", "../../rough cut.mp4", "video/mp4")
    assert "rough cut.mp4" not in asset.key
    assert await store.read_bytes(asset.key) == b"cut"
    assert not (tmp_path.parent / "rough cut.mp4").exists()
```

- [ ] **Step 2: Run the test and confirm the module is missing**

Run: `.venv/bin/pytest backend/tests/test_assets.py -q`

Expected: FAIL importing `backend.app.assets`.

- [ ] **Step 3: Implement filesystem and GCS stores**

Use UUID storage keys, keep original filenames only as metadata, and execute synchronous GCS client operations through `asyncio.to_thread`. `local_path()` returns the local path directly for filesystem storage and a temporary materialized copy for GCS, deleting only the temporary copy on exit.

- [ ] **Step 4: Store assets before launching the pipeline**

Replace `_CUT_PATHS` and filename-derived temp paths. `_launch()` receives `StoredAsset` objects; `run_pipeline()` materializes the cut through the store only for scanning. `/cut` reads the active `CutVersion.storage_key` and retains byte-range behavior.

- [ ] **Step 5: Verify restart-safe metadata and cut streaming**

Add API tests that clear the process-local cut cache (which should no longer exist), fetch the project again, and receive `206` for a range request.

Run: `.venv/bin/pytest backend/tests/test_assets.py backend/tests/test_api.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/assets.py backend/app/models.py backend/app/config.py backend/app/main.py backend/app/pipeline.py backend/tests/test_assets.py backend/tests/test_api.py
git commit -m "feat: persist production assets"
```

---

### Task 3: Build Application Boot, the Router, and the Project Library

**Files:**
- Create: `frontend/src/app/router.ts`
- Create: `frontend/src/app/router.test.ts`
- Create: `frontend/src/app/AppShell.tsx`
- Create: `frontend/src/app/bootstrap.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/features/projects/ProjectLibrary.tsx`
- Create: `frontend/src/components/StatusMark.tsx`
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/base.css`
- Create: `frontend/src/styles/motion.css`
- Create: `frontend/src/features/projects/ProjectLibrary.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `backend/app/store.py:76-80`
- Modify: `backend/app/main.py:68-80,205-219`
- Modify: `backend/app/models.py:435-498`

**Interfaces:**
- Produces: `Route = {name:"projects"}|{name:"new-project"}|{name:"project",projectId:string}|{name:"new-revision",projectId:string}|{name:"revision",projectId:string,revisionId:string}|{name:"packet",projectId:string}`.
- Produces: `useRoute()` and `navigate(path: string)` using History API and `popstate`.
- Produces: `ProjectListItem` with title, version labels, updated time, counts, and derived state label.
- Produces: `bootstrap()` resolving config and projects independently.
- Produces: archive/restore API and `Project.archived_at`, with archived projects excluded by default and available through an explicit library filter.

- [ ] **Step 1: Write router and library failing tests**

```ts
expect(parseRoute("/projects/proj_1/revisions/rev_2")).toEqual({
  name: "revision", projectId: "proj_1", revisionId: "rev_2"
});
```

```tsx
render(<ProjectLibrary projects={[]} sampleAvailable />);
expect(screen.getByRole("heading", {name: /find what entered/i})).toBeVisible();
expect(screen.getByRole("link", {name: /new clearance scan/i})).toHaveAttribute("href", "/projects/new");
```

- [ ] **Step 2: Run tests and confirm route/library modules are missing**

Run: `npm test -- router.test.ts ProjectLibrary.test.tsx`

Expected: FAIL importing the new modules.

- [ ] **Step 3: Implement routes and boot degradation**

Fast boot renders no skeleton before 350 ms. A delayed boot renders structural rows. Config and project-index errors carry separate retry functions so one failure does not disable the other capability.

- [ ] **Step 4: Implement persistent project listing**

When Firestore is active, `store.list_projects(limit)` queries the collection ordered by `updated_at`; it must not only return the in-process cache. Keep the in-memory path for local work.

Add `PATCH /api/projects/{project_id}` accepting `{archived: true|false}`. Archive and restore record audit events; they never delete project evidence or assets.

- [ ] **Step 5: Implement Film Lab foundations**

Use the exact token values from the specification. Bundle the chosen sans and serif with npm font packages, import them in `main.tsx`, and verify the browser makes no Google Fonts request. Keep semantic color to marks, rules, and timeline signals.

- [ ] **Step 6: Verify library states and routes**

Run: `npm test && npm run build`

Expected: PASS.

Run: `.venv/bin/pytest backend/tests/test_api.py -q`

Expected: project list tests pass for memory; Firestore behavior is unit-tested with a fake client.

- [ ] **Step 7: Commit**

```bash
git add frontend/src frontend/package.json frontend/package-lock.json backend/app/store.py backend/app/main.py backend/tests
git commit -m "feat: add project-first application shell"
```

---

### Task 4: Build Intake, Validation, and Upload Preflight

**Files:**
- Create: `frontend/src/features/projects/NewProject.tsx`
- Create: `frontend/src/features/projects/FileField.tsx`
- Create: `frontend/src/features/projects/NewProject.test.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `backend/app/main.py:98-181`
- Modify: `backend/app/screenplay.py`
- Modify: `backend/tests/test_api.py`

**Interfaces:**
- Produces: `PreflightResult(kind, filename, mime_type, size_bytes, accepted, details, errors)`.
- Produces: `POST /api/uploads/preflight` for one screenplay or cut.
- Consumes: `api.createProject(script, cut, title, onUploadProgress)` using `XMLHttpRequest` for measurable upload progress and routes to `/projects/:id` on success.

- [ ] **Step 1: Write failing preflight API tests**

```python
def test_screenplay_preflight_reports_readable_text(client, sample_fountain):
    response = client.post("/api/uploads/preflight", files={"file": ("film.fountain", sample_fountain, "text/plain")})
    assert response.status_code == 200
    assert response.json()["details"]["scene_count"] >= 1
```

- [ ] **Step 2: Write failing keyboard/drop/replace UI tests**

Test equivalent file-picker and drop flows, file removal, retaining the valid file when the other fails, and disabled submission with no assets.

- [ ] **Step 3: Implement authoritative server preflight**

Use the same parsing and upload-limit rules as project creation. Return explicit `unsupported_type`, `too_large`, `no_text_layer`, or `unreadable_container` error codes.

- [ ] **Step 4: Implement the single-page intake flow**

Render title, screenplay, and cut in one ordered column. Show filename, size, MIME, screenplay pages/scenes, and video duration. The final sentence states exactly which assets will be analyzed.

- [ ] **Step 5: Verify successful and degraded intake**

Run: `.venv/bin/pytest backend/tests/test_api.py -q`

Run: `npm test -- NewProject.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/app/screenplay.py backend/tests frontend/src/features/projects frontend/src/api/client.ts
git commit -m "feat: add deliberate project intake"
```

---

### Task 5: Build Resilient Analysis and Organic Scan Reveal

**Files:**
- Create: `frontend/src/api/project-stream.ts`
- Create: `frontend/src/features/analysis/useProjectFeed.ts`
- Create: `frontend/src/features/analysis/AnalysisWorkspace.tsx`
- Create: `frontend/src/features/analysis/ScanReveal.tsx`
- Create: `frontend/src/features/analysis/AnalysisWorkspace.test.tsx`
- Create: `frontend/src/features/projects/project-preferences.ts`
- Modify: `backend/app/models.py`
- Modify: `backend/app/pipeline.py`
- Modify: `backend/app/main.py:297-333`
- Modify: `frontend/src/app/AppShell.tsx`

**Interfaces:**
- Produces: persisted `Project.activity_events: list[ActivityEvent]` capped at 500 entries.
- Produces: `useProjectFeed(projectId)` returning `{project, frames, connection, retry}` with SSE-to-poll fallback.
- Produces: `hasSeenReveal(projectId, revisionKey)` and `markRevealSeen(...)`.
- Produces: `POST /api/projects/{project_id}/items/{item_id}/research` using the existing `research_item()` path and refusing duplicate in-flight retries.

- [ ] **Step 1: Write failing activity and fallback tests**

Backend test: persisted project activity survives a fresh `GET /api/projects/:id`.

Frontend test: an EventSource error changes connection to `polling`, refreshes the project, and preserves visible detections.

- [ ] **Step 2: Implement persisted activity events**

`_emit()` writes a structured event to the project before publishing SSE. Keep safe user-facing messages separate from raw exception logs.

- [ ] **Step 3: Implement analysis workspace states**

Render the current actual stage, completed stage sequence, media anchor, partial timeline signals, item-level failures, activity count, and connectivity notice. Never calculate a synthetic completion percentage.

- [ ] **Step 4: Implement Scan Reveal from current items**

Sort current cut detections by timecode. Each signal enters once with at most 55 ms stagger; clicking or keyboard interaction settles immediately. A per-revision local preference prevents replay on return. Reduced motion renders the final state synchronously.

- [ ] **Step 5: Verify partial, failed, first-visit, return, and reduced-motion states**

Run: `.venv/bin/pytest backend/tests -q`

Run: `npm test -- AnalysisWorkspace.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/pipeline.py backend/app/main.py backend/tests frontend/src/api frontend/src/features/analysis frontend/src/features/projects/project-preferences.ts frontend/src/app/AppShell.tsx
git commit -m "feat: make analysis resilient and state-driven"
```

---

### Task 6: Build the Adaptive Review Workspace and Evidence Graph

**Files:**
- Create: `frontend/src/features/review/ReviewWorkspace.tsx`
- Create: `frontend/src/features/review/CaseRail.tsx`
- Create: `frontend/src/features/review/PictureWorkspace.tsx`
- Create: `frontend/src/features/review/EvidenceGraph.tsx`
- Create: `frontend/src/features/review/EvidenceInspector.tsx`
- Create: `frontend/src/features/review/SourceLedger.tsx`
- Create: `frontend/src/components/Drawer.tsx`
- Create: `frontend/src/features/review/EvidenceGraph.test.tsx`
- Modify: `frontend/src/app/AppShell.tsx`
- Modify: `frontend/src/styles/base.css`
- Migrate behavior from: `frontend/src/components/Workspace.tsx`, `Heatmap.tsx`, `ItemDetail.tsx`

**Interfaces:**
- Produces: `CaseQuery = {filter, search, sort}` and `rankCases(items)`.
- Produces: `EvidenceNode = {id, kind, label, summary, available, detail}`.
- Produces: URL-selected item via `?item=<id>`.
- Produces: source-ledger drawer with focus restoration.

- [ ] **Step 1: Write failing graph and selection tests**

```tsx
render(<EvidenceGraph item={unscriptedArtwork} />);
expect(screen.getByRole("button", {name:/frame 00:12/i})).toBeVisible();
expect(screen.getByText(/none — unscripted/i)).toBeVisible();
expect(screen.queryByText(/production documents/i)).not.toBeInTheDocument();
```

Test case selection updating the URL and seeking the player, and timeline selection updating the case rail.

- [ ] **Step 2: Implement the three-region desktop workspace**

Keep one selected item prominent. Confirm 50 generated cases remain scrollable and filterable without rendering every source excerpt in the rail.

- [ ] **Step 3: Implement the accessible DOM Evidence Graph**

Always render source anchor, reconciliation relationship, and element identity. Conditionally render holder, route, source, document, gap, and action branches. Use ordered DOM content and CSS connector rules; do not use canvas.

- [ ] **Step 4: Implement state-driven graph motion**

Enter nodes in relationship order, total staging below 500 ms, then remain static. Selection changes crossfade the inspector. Reduced motion skips staging.

- [ ] **Step 5: Move activity and Copilot out of the permanent grid**

Activity and Copilot open in utility drawers. Remove vendor chips and the visible AI-approval test from the primary interface.

- [ ] **Step 6: Verify**

Run: `npm test -- EvidenceGraph.test.tsx && npm run build`

Expected: PASS and no React key/ARIA warnings.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app frontend/src/components frontend/src/features/review frontend/src/styles
git commit -m "feat: create the adaptive clearance workspace"
```

---

### Task 7: Build Human Confirmations, Documents, and Scope Assessment

**Files:**
- Create: `backend/app/documents.py`
- Create: `backend/app/scope.py`
- Create: `backend/tests/test_scope.py`
- Create: `backend/tests/test_documents_api.py`
- Create: `frontend/src/components/Dialog.tsx`
- Create: `frontend/src/features/documents/DocumentSheet.tsx`
- Create: `frontend/src/features/documents/ScopeAssessment.tsx`
- Create: `frontend/src/features/documents/UseProfileSheet.tsx`
- Create: `frontend/src/features/documents/DocumentSheet.test.tsx`
- Modify: `backend/app/models.py`
- Modify: `backend/app/main.py:336-438`
- Modify: `frontend/src/features/review/EvidenceInspector.tsx`
- Modify: `frontend/src/api/client.ts`

**Interfaces:**
- Produces: `IntendedUseProfile(media, territories, starts_on, ends_on)`.
- Produces: `DocumentScope(media, territories, starts_on, ends_on, perpetual, covered_use)`.
- Produces: `ScopeAssessment(outcome: covers|partial|unknown|expired, gaps: list[str])`.
- Produces: multipart document create, document download, metadata patch, and delete APIs.
- Produces: status confirmation payload with rationale and optional `document_ids`.
- Produces: `PATCH /api/projects/{project_id}/items/{item_id}/coordination` accepting a bounded `assigned_to` label and recording an audit event.
- Produces: intended-use settings UI backed by `PATCH /api/projects/{project_id}/use-profile`.

- [ ] **Step 1: Write failing deterministic scope tests**

```python
def test_streaming_gap_is_partial():
    intended = IntendedUseProfile(media=["theatrical", "streaming"], territories=["US"])
    scope = DocumentScope(media=["theatrical"], territories=["US"], perpetual=True)
    result = assess_scope(intended, scope)
    assert result.outcome == "partial"
    assert result.gaps == ["Streaming is not listed in recorded media."]
```

- [ ] **Step 2: Write failing document ownership and human-transition tests**

Test upload/download, rejecting a document ID from another item, deleting metadata and blob, and rejecting `documented_permission` without a selected attached document.

- [ ] **Step 3: Implement domain types and scope comparator**

Comparison is set/date based, deterministic, and side-effect free. It reports recorded metadata mismatch only and never legal sufficiency.

- [ ] **Step 4: Implement document APIs through the asset store**

Use opaque blob keys. Preserve metadata if an upload retry fails. Validate project/item/document ownership on every operation.

- [ ] **Step 5: Implement confirmation and document sheets**

Consequential actions require rationale. Documented permission requires selecting an attached document. Focus is trapped, Escape closes, and focus returns to the trigger.

Implement intended-media, territory, and date editing in `UseProfileSheet`. Recompute displayed scope assessments immediately from the returned server project. Assignment is a small labeled field in the same human-work surface, not a new permanent panel.

- [ ] **Step 6: Verify**

Run: `.venv/bin/pytest backend/tests/test_scope.py backend/tests/test_documents_api.py backend/tests/test_api.py -q`

Run: `npm test -- DocumentSheet.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/documents.py backend/app/scope.py backend/app/models.py backend/app/main.py backend/tests frontend/src/components/Dialog.tsx frontend/src/features/documents frontend/src/features/review/EvidenceInspector.tsx frontend/src/api/client.ts
git commit -m "feat: add document-aware human review"
```

---

### Task 8: Build Revision Snapshots and Safe Comparison APIs

**Files:**
- Create: `backend/app/revisions.py`
- Create: `backend/tests/test_revisions.py`
- Create: `backend/tests/test_revisions_api.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/pipeline.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/store.py`

**Interfaces:**
- Produces: `ProjectRevision(id, sequence, script, cut, state, items, changes, predecessor_id)`.
- Produces: `RevisionChange(kind: unchanged|added|removed|materially_changed|decision_stale, stable_item_id, before_item_id, after_item_id, explanation)`.
- Produces: `compare_revisions(previous, candidate_items) -> list[RevisionChange]`.
- Produces: revision list/create/get/apply APIs.

- [ ] **Step 1: Write failing comparison tests for all five outcomes**

Use explicit fixtures for an unchanged brand, added poster, removed sign, renamed/specific artwork, and previously documented music whose new time/use makes its decision stale.

- [ ] **Step 2: Write failing mutation-safety tests**

```python
def test_failed_comparison_does_not_mutate_active_project(project):
    before = project.model_dump(mode="json")
    with pytest.raises(RevisionComparisonError):
        build_candidate_revision(project, invalid_candidates)
    assert project.model_dump(mode="json") == before
```

Test idempotent apply and 409 on an unexpected predecessor.

- [ ] **Step 3: Implement stable identities and revision snapshots**

Initial project completion creates revision sequence 1. Candidate revisions process without replacing `project.items`. Explicit matches win; fallback matching uses normalized category/name plus source proximity and records the basis.

- [ ] **Step 4: Implement comparison rules and audit events**

Unchanged items retain evidence/documents/status. Added items start from candidate state. Removed items remain only in history. Materially changed and stale decisions reopen only during apply and record previous status, revision, explanation, and source anchor.

- [ ] **Step 5: Implement revision APIs and conflict handling**

`POST /revisions` accepts revised script/cut. `POST /apply` checks predecessor and comparison success, is idempotent, then promotes the snapshot.

- [ ] **Step 6: Verify**

Run: `.venv/bin/pytest backend/tests/test_revisions.py backend/tests/test_revisions_api.py -q`

Run: `.venv/bin/python -m backend.tests.test_offline`

Expected: PASS with existing safety invariants unchanged.

- [ ] **Step 7: Commit**

```bash
git add backend/app/revisions.py backend/app/models.py backend/app/pipeline.py backend/app/main.py backend/app/store.py backend/tests
git commit -m "feat: add revision-safe clearance state"
```

---

### Task 9: Build Revision Intake and Version Ripple

**Files:**
- Create: `frontend/src/features/revisions/NewRevision.tsx`
- Create: `frontend/src/features/revisions/RevisionCompare.tsx`
- Create: `frontend/src/features/revisions/VersionRipple.tsx`
- Create: `frontend/src/features/revisions/VersionRipple.test.tsx`
- Modify: `frontend/src/app/AppShell.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/types.ts`

**Interfaces:**
- Consumes: revision APIs and `RevisionChange` from Task 8.
- Produces: revision preflight and candidate-processing views.
- Produces: old/new timeline overlay and changed-case explanation.

- [ ] **Step 1: Write failing outcome-rendering tests**

Test unchanged signals remaining low contrast, added signals labeled new, removed signals retained as history, and changed/stale signals exposing before/after detail and prior disposition.

- [ ] **Step 2: Implement revision intake**

Show current/proposed version labels, unchanged asset, expected comparison scope, and failure behavior that leaves the active revision untouched.

- [ ] **Step 3: Implement Version Ripple from stored changes**

Map old/new timecodes to two aligned tracks. Animate added, removed, and changed signals once using transform/opacity. Do not invent timing. Reduced motion renders both tracks and change labels immediately.

- [ ] **Step 4: Implement apply confirmation and conflict refresh**

The confirmation names the predecessor and number of cases that reopen. On 409, refresh project/revisions and require a new comparison.

- [ ] **Step 5: Verify**

Run: `npm test -- VersionRipple.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/revisions frontend/src/app/AppShell.tsx frontend/src/api/client.ts frontend/src/types.ts
git commit -m "feat: visualize and apply production revisions"
```

---

### Task 10: Build Packet Preview, Confirmed Export, and Continuity

**Files:**
- Create: `frontend/src/features/export/PacketPreview.tsx`
- Create: `frontend/src/features/export/PacketPreview.test.tsx`
- Create: `frontend/src/components/CommandPalette.tsx`
- Modify: `backend/app/export.py`
- Modify: `backend/app/main.py:229-243`
- Modify: `backend/app/models.py:477-498`
- Modify: `backend/tests/test_offline.py`
- Modify: `backend/tests/test_api.py`
- Modify: `frontend/src/features/projects/project-preferences.ts`
- Modify: `frontend/src/app/AppShell.tsx`

**Interfaces:**
- Produces: `POST /api/projects/{id}/packet-exports` returning current Markdown and recording `packet_exported`.
- Produces: packet preview route with incomplete-state labeling.
- Produces: per-project preferences for item, filter, queue width, drawer state, and video position.

- [ ] **Step 1: Write failing current-revision export tests**

Test active revision label, scope gaps, reopened-first ordering, current documents, incomplete-research notice, and the export audit event.

Add a summary test proving `ai_issued_approvals` is counted from audit events rather than returned as a constant.

- [ ] **Step 2: Implement server-generated preview/export**

Generate from current server state on every request. GET preview does not audit; confirmed POST export does. Keep Markdown download in this cycle.

Replace the hardcoded AI-approval summary with an audit-derived count of agent/system events whose target status is human-owned. Under the invariant this remains zero, but it is now a measured value.

- [ ] **Step 3: Implement packet preview and confirmation**

Render semantic document structure, not raw Markdown source. Allow export with incomplete data but label it at the top and in the file.

- [ ] **Step 4: Implement route and workspace continuity**

Restore selected item from URL. Restore remaining preferences locally. If the item is absent in the active revision, select the first reopened/unresolved item and announce the fallback without a modal.

- [ ] **Step 5: Add the command palette**

Support Projects, New scan, Add revision, Preview packet, Activity, next/previous case, and focus search. `Meta/Ctrl+K` opens; shortcuts do not run in text inputs.

- [ ] **Step 6: Verify**

Run: `.venv/bin/pytest backend/tests -q`

Run: `npm test -- PacketPreview.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/export.py backend/app/main.py backend/tests frontend/src/features/export frontend/src/features/projects/project-preferences.ts frontend/src/components/CommandPalette.tsx frontend/src/app/AppShell.tsx
git commit -m "feat: complete packet export and continuity"
```

---

### Task 11: Harden Responsive, Accessible, and End-to-End Product Quality

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/tests/e2e/full-flow.spec.ts`
- Create: `frontend/tests/e2e/accessibility.spec.ts`
- Create: `frontend/tests/e2e/visual.spec.ts`
- Create: `frontend/tests/e2e/fixtures.ts`
- Modify: `frontend/src/styles/base.css`
- Modify: `frontend/src/styles/motion.css`
- Modify: all feature components only where a failing quality test identifies a defect
- Modify: `README.md`

**Interfaces:**
- Produces: deterministic browser fixture API with no live credentials.
- Produces: desktop, tablet, and mobile smoke coverage.
- Produces: screenshot baselines for all core routes/states.

- [ ] **Step 1: Write the complete failing E2E journeys**

Cover:

1. First visit → project creation → analysis → review
2. Seeded project → unscripted item → verify match
3. Attach licence without streaming → partial scope → remains amber
4. Add revision → compare → apply → only changed item reopens
5. Preview/export packet → audit event
6. Reload deep link → item/playback restoration
7. Keyboard-only primary workflow
8. Reduced-motion stable states

- [ ] **Step 2: Add serious/critical accessibility assertions**

Use `@axe-core/playwright` on library, intake, analysis, review, document sheet, revision comparison, and packet preview. Also assert focus restoration, visible focus, dialog labeling, timeline button names, and status text independent of color.

- [ ] **Step 3: Implement responsive layouts**

Desktop: three regions. Tablet: picture primary with rail/inspector sheets. Mobile: single-column library/intake/review/evidence and read-only revision summary. Do not hide essential evidence or status.

- [ ] **Step 4: Add visual baselines**

Capture boot skeleton, empty/returning library, intake, processing, review, evidence graph, partial document scope, revision comparison, and packet preview at 1440×1000 and 1024×900. Capture mobile library/review at 390×844.

- [ ] **Step 5: Verify performance and motion constraints**

Assert no runtime font requests, no continuous animations after settle, no layout-property animations in `motion.css`, and no horizontal page overflow at target widths.

- [ ] **Step 6: Run the full release gate**

Run: `.venv/bin/pytest backend/tests -q`

Expected: PASS.

Run: `.venv/bin/python -m backend.tests.test_offline`

Expected: all offline checks pass.

Run: `npm test && npm run build && npm run test:e2e`

Expected: PASS with no serious/critical accessibility violations.

Run: `curl -sk https://clearcut.lcl/api/health`

Expected: `{"status":"ok"}`.

- [ ] **Step 7: Update README with the real full-product flow and verification commands**

Remove stale single-screen screenshots/copy, document local and cloud asset persistence, list test commands, and describe external research fixtures honestly.

- [ ] **Step 8: Commit**

```bash
git add frontend/playwright.config.ts frontend/tests frontend/src README.md
git commit -m "test: harden the complete ClearCut experience"
```

---

## Final Verification

- [ ] `git diff --check` returns no output.
- [ ] `git status --short` contains no generated assets, secrets, test videos, or unrelated files.
- [ ] All commands in Task 11 Step 6 pass from a clean checkout with documented setup.
- [ ] Inspect the complete application manually at `https://clearcut.lcl`, including boot, home, intake, analysis, review, documents, revision comparison, packet preview, tablet, mobile, keyboard, and reduced motion.
- [ ] Confirm Search/Task/Monitor code paths still import and existing offline integration-construction tests remain green.
- [ ] Confirm every displayed summary number derives from project state; specifically remove the hardcoded `ai_issued_approvals: 0` summary value and calculate it from audit events.
- [ ] Confirm the visible AI-approval test button no longer exists while backend tests still prove agent refusal.
