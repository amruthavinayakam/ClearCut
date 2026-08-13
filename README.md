# ClearCut

ClearCut is a multimodal clearance-research workspace for film and television. It compares a screenplay with a cut, identifies material that may require clearance, researches candidate rights routes with citations, and gives a human coordinator one continuous place to review evidence, attach production documents, assess recorded scope, track revisions, and export a current research packet.

**Research for human legal review. ClearCut does not issue legal clearance.**

Built for the Agentic Cinema hackathon and the Parallel track.

## The full product flow

1. **Open or create a production.** The library is the durable starting point, with archive/search support and an honest first-run state.
2. **Upload the screenplay, the cut, or both.** Files are preflighted before project creation; the browser shows concrete validation and recovery states.
3. **Watch analysis settle.** Gemini scans the screenplay and video, ClearCut reconciles the page against the screen, and Parallel research runs per case. Timecoded findings remain visible while work is in progress.
4. **Review every case.** The workspace combines the case queue, picture/timeline, evidence graph, citations, candidate rights holders, gaps, assignment, and human disposition controls.
5. **Attach the real production record.** Licences, releases, permits, and correspondence are stored as files with recorded media, territory, term, and use metadata. ClearCut compares that metadata with the production's intended-use profile and calls out gaps; it does not interpret a document as a legal conclusion.
6. **Compare a new version.** A candidate revision is scanned as immutable state. Version Ripple reports `unchanged`, `added`, `removed`, `materially_changed`, and `decision_stale` outcomes. Applying a reviewed revision carries unchanged human records forward and reopens only affected cases.
7. **Preview and export.** The packet is rebuilt from the active server record, shows incomplete research and document-scope gaps, and requires confirmation before a Markdown download and export audit event are created.
8. **Continue later.** Deep-linked case selection, filters, search, queue width, open drawer, and playback position survive reload. `Cmd/Ctrl+K` opens the global command palette outside text inputs.

The interface is intentionally ultraminimal: editorial type, near-black surfaces, one warm action accent, and semantic colour reserved for evidence state. Desktop, tablet, mobile, keyboard, and reduced-motion paths are covered by browser tests.

## What the agents do

```text
screenplay ──┐
             ├─ Gemini scan ─ reconcile ─ Parallel Search + Task ─ human review
rough cut ───┘                                      │
                                                   └─ Parallel Monitor → reopen on change
```

- **Gemini screenplay scan** extracts named and generic clearable candidates with source anchors.
- **Gemini cut scan** reads the actual video, returning timecoded visual/audio candidates and readable on-screen text.
- **Reconciliation** distinguishes elements found in both inputs from script-only, cut-only, and materially changed uses.
- **Parallel Search** retrieves public evidence and citations quickly.
- **Parallel Task** produces a schema-validated dossier with candidate holders, possible licensing routes, evidence gaps, open questions, and recommended human actions.
- **Parallel Monitor** can watch unresolved public facts; an authenticated webhook reopens the linked case without overwriting its history.
- **The copilot** can explain the current stored record and invoke live research, but it cannot make a human-owned disposition.

The principal integration points are in [`parallel_client.py`](backend/app/parallel_client.py), [`pipeline.py`](backend/app/pipeline.py), the agents under [`backend/app/agents`](backend/app/agents), and the webhook in [`main.py`](backend/app/main.py).

## Safety model

The workflow enforces ownership at the model and API layers. Agent and system actors may research a case up to `evidence_ready`; they cannot set coordinator, counsel, permission, replacement, or false-positive outcomes. Coordinator and counsel actions require a rationale, and approval-like outcomes require supporting production documents where applicable.

Late research cannot overwrite a human disposition. Revision application is predecessor-checked, idempotent, and based on the stored comparison—not a browser-supplied list of changes. Packet previewing creates no audit event; a confirmed export does.

## Architecture

- **Backend:** Python, FastAPI, Pydantic, Google ADK / Gemini, Parallel APIs
- **Frontend:** React, TypeScript, Vite, local Manrope and Newsreader font packages
- **Project persistence:** in memory by default; Firestore when `USE_FIRESTORE=true`
- **Asset persistence:** filesystem under `ASSET_STORAGE_DIR` by default; Google Cloud Storage when `GCS_BUCKET` is set
- **Production serving:** one FastAPI process serves both `/api` and the built frontend in `backend/app/static`
- **Live progress:** Server-Sent Events with polling recovery

Project records store opaque asset keys rather than process-local paths. In a cloud configuration, set both Firestore and Cloud Storage so metadata, audit history, screenplays, cuts, and attached documents survive instance replacement. Parallel monitor records are currently process-local even when Firestore is enabled.

## Run locally

Prerequisites: Python 3.11+, Node 20+, a Parallel API key, and either Vertex AI Application Default Credentials or a Google AI Studio key.

```bash
cp .env.example .env
python -m venv .venv
.venv/bin/pip install -r requirements.txt
cd frontend
npm install
npm run build
cd ..
```

For Vertex AI:

```bash
gcloud auth application-default login
```

Start the built application through Portless:

```bash
PORTLESS_TLD=lcl portless clearcut --app-port 8080 .venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8080
```

Open [https://clearcut.lcl](https://clearcut.lcl).

For frontend development, keep the backend on port 8080 and run:

```bash
cd frontend
npm run dev
```

That frontend is available at [https://clearcut-frontend.lcl](https://clearcut-frontend.lcl) and proxies `/api` to the backend.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `GOOGLE_CLOUD_PROJECT` | — | Vertex AI and Google Cloud project ID |
| `GOOGLE_CLOUD_LOCATION` | `global` | Vertex AI location |
| `GOOGLE_GENAI_USE_VERTEXAI` | `TRUE` | Use Vertex AI; set `FALSE` for AI Studio |
| `GOOGLE_API_KEY` | — | AI Studio key when Vertex is disabled |
| `GEMINI_MODEL` | probe | Optional model pin |
| `PARALLEL_API_KEY` | — | Parallel Search, Task, and Monitor key |
| `PARALLEL_SEARCH_MODE` | `basic` | Search processor mode |
| `PARALLEL_PROCESSOR` | `core` | Structured Task processor |
| `PARALLEL_MONITOR_PROCESSOR` | `base` | Monitor processor |
| `RESEARCH_CONCURRENCY` | `16` | Concurrent per-case research jobs |
| `USE_FIRESTORE` | `false` | Persist project records and audit history |
| `FIRESTORE_COLLECTION` | `clearance_projects` | Firestore collection |
| `ASSET_STORAGE_DIR` | system temp | Local asset directory when GCS is unset |
| `GCS_BUCKET` | — | Store assets in GCS and give Gemini a `gs://` cut URI |
| `PUBLIC_BASE_URL` | — | Public HTTPS origin used for Monitor webhooks |
| `PARALLEL_WEBHOOK_SECRET` | — | Required `x-radar-secret` value for webhooks |
| `MAX_UPLOAD_BYTES` | `209715200` | Server upload ceiling |
| `MOCK_RESEARCH` | `false` | Explicit local fixture research mode |

`MOCK_RESEARCH=true` is a development aid; its fixture values are deliberately prefixed `MOCK:`. It is not used to turn browser-test output into a product claim.

## Verification

Install Playwright's pinned Chromium once:

```bash
cd frontend
npx playwright install chromium
```

Run the release gate:

```bash
.venv/bin/pytest backend/tests -q
.venv/bin/python -m backend.tests.test_offline
cd frontend
npm test
npm run build
npm run test:e2e
```

Then verify the running server:

```bash
curl -sk https://clearcut.lcl/api/health
```

The Playwright suite covers creation through review, document scope gaps, immutable revision application, confirmed packet export/audit, reload continuity, keyboard commands, reduced motion, serious/critical accessibility violations, focus restoration/trapping, responsive overflow, local font loading, settled motion, and visual baselines for boot, empty/returning library, intake, processing, review, partial scope, revision comparison, packet, tablet, and mobile states.

Browser E2E tests intercept only root `/api` requests with deterministic route fixtures. They use no live credentials, do not ship a mock API inside the product, and assert the same state transitions the UI consumes from FastAPI. Backend integration and invariant tests exercise the real server code.

## Limits

- ClearCut supports clearance research; it is not legal advice and does not determine whether a use is lawful.
- Detection produces candidates, not a guarantee of exhaustive trademark, copyright, music, privacy, or publicity-rights identification.
- Candidate rights holders and licensing routes come from public research and must be confirmed by a qualified human.
- Scope assessment compares recorded metadata; it does not parse legal meaning from the attached document.
- Scanned screenplay PDFs need a usable text layer or OCR before upload.
- Without Firestore and GCS, local state and assets are suitable for development, not durable deployment.

## License

MIT — see [`LICENSE`](LICENSE).
