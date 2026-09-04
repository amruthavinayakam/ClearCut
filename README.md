# ◎ Clearance Radar

**Every frame. Every right. Every change.**

A screenplay gets cleared before the shoot. Then the rough cut arrives carrying
a poster nobody planned for, a package design the prop department bought that
morning, and a music cue that was never in the script. Delivery is Friday.

Clearance Radar compares the page against the screen, pins every unresolved
element to its exact frame, researches who controls it with citations, and
keeps watching for public changes. **Humans make every legal decision** — the
agent cannot mark anything cleared, and that is enforced in the type system, the
API, and the tests.

Built for the **Agentic Cinema** hackathon — **Parallel track**.

---

## What it does

```
screenplay.pdf ──┐
                 ├──► Gemini reads both ──► reconcile ──► research ──► human sign-off ──► monitor
rough-cut.mp4 ───┘
```

| Stage | What happens |
|---|---|
| **Script scan** | Gemini (ADK agent, structured output) extracts clearance candidates with scene, page, and verbatim excerpt. Generic mentions — "a photograph on the wall" — are flagged too, because production *will* hang a real one. |
| **Cut scan** | Gemini reads the video directly and returns **timecoded** candidates, transcribing on-screen text so the element can actually be researched. |
| **Reconcile** | Every item is classified `in_both`, `script_only`, `cut_only`, or `materially_changed`. |
| **Research** | **Parallel Search** runs first for live cited retrieval, then **Parallel Task** builds a schema-validated dossier. |
| **Review** | The agent stops at `evidence_ready`. A coordinator verifies; counsel signs off. |
| **Monitor** | **Parallel Monitor** watches unresolved items and reopens them by webhook when the public picture changes. |

### The two relationships that matter

**`cut_only`** — it appeared on the day and nobody planned for it, so nothing has
been researched. This is where productions get hurt.

**`materially_changed`** — the script said *"a photograph of a harbour at night"*
and the cut shows *"HARBOR LIGHTS, 1961 · est. of M. Vance"*. The generic
reference needed no clearance. The specific work does. Nobody was warned.

On the seeded demo, the reconciler produces exactly that finding, unprompted:

> *"The script's generic 'photograph of a harbour at night' was realized as the
> specific artwork 'HARBOR LIGHTS, 1961' by M. Vance."*

---

## The safety property

**The agent cannot approve anything.** Not "is instructed not to" — cannot.

```python
HUMAN_OWNED_STATUSES = frozenset({
    "coordinator_verified", "counsel_approved",
    "documented_permission", "approved_replacement", "false_positive",
})
```

`ClearanceItem.transition()` raises `ApprovalDenied` if the actor does not own
the target status, and the agent calls it through the same path as everyone
else — there is no privileged route. The API returns **403**. The UI has a
button, *"Test: let the AI approve it"*, that fires `actor=agent` at a
human-owned status so you can watch the server refuse it live.

The test suite asserts it as a property, not an example:

```
PASS  no agent-reachable status is green
PASS  agent refused 'counsel_approved'
PASS  coordinator refused counsel_approved
PASS  counsel may approve
```

Unknown ownership can never come back green either. If research cannot
establish a rights holder, the item goes to `unresolved` — you cannot licence
what you cannot find.

---

## Where the platforms are actually used

Imported and called in code, not merely named:

| | Where | What |
|---|---|---|
| **Parallel Search** | [`parallel_client.py`](backend/app/parallel_client.py) `search_evidence` | Live retrieval per item; results stream into the UI as they arrive |
| **Parallel Search** | [`agents/copilot.py`](backend/app/agents/copilot.py) `parallel_live_search` | ADK `FunctionTool` — the copilot researches instead of guessing |
| **Parallel Task** | [`parallel_client.py`](backend/app/parallel_client.py) `build_dossier` | Strict JSON schema, per-field `basis` citations |
| **Parallel Monitor** | [`parallel_client.py`](backend/app/parallel_client.py) `create_item_monitor` | Event stream with backfill, so a new watch is not empty |
| **Parallel webhook** | [`main.py`](backend/app/main.py) `/api/webhooks/parallel` | `monitor.event.detected` reopens the linked item |
| **Gemini multimodal** | [`agents/cut_scan.py`](backend/app/agents/cut_scan.py) | Video in, timecoded detections out |
| **Gemini + ADK** | [`script_scan`](backend/app/agents/script_scan.py), [`reconcile`](backend/app/agents/reconcile.py), [`drafting`](backend/app/agents/drafting.py), [`copilot`](backend/app/agents/copilot.py) | Four `LlmAgent`s, three with Pydantic `output_schema` |
| **Cloud Run** | [`Dockerfile`](Dockerfile), [`deploy.ps1`](deploy.ps1) | One container serves API + UI |
| **Secret Manager** | [`deploy.ps1`](deploy.ps1) | The Parallel key is never a console env var |
| **Cloud Storage** | [`cut_scan.py`](backend/app/agents/cut_scan.py) | `GCS_BUCKET` set → Gemini reads the cut by URI instead of inline |
| **Firestore** *(optional)* | [`store.py`](backend/app/store.py) | Projects and audit trail survive an instance restart |

---

## Measured results on the seeded demo

The demo assets are generated by [`tools/generate_demo_assets.py`](tools/generate_demo_assets.py)
with five deliberately planted elements, so recall is checkable rather than
claimed.

| | |
|---|---|
| Planted elements detected in the cut | **5 / 5** |
| False positives | **0** |
| Timecode accuracy | within **0.5 s** of ground truth |
| Unscripted elements caught | **3 / 3** |
| `materially_changed` correctly identified | **1 / 1** |
| Sources cited across the project | **147** |
| AI-issued approvals | **0** |

The cut scanner transcribed on-screen text exactly — `MIDNIGHT ORCHARD / R.
OKONKWO • 1974` — which is what makes the element researchable at all.

It also correctly refuses to invent owners. `MIDNIGHT ORCHARD` is a fictional
artwork, and research returned **zero** candidate holders and an honest list of
gaps, including *"whether the physical framed print was rented, purchased,
borrowed, or supplied by a prop house, and whether the production received any
rights paperwork with it."*

---

## Demo assets are original by construction

A project about clearance must not ship uncleared third-party material. The
screenplay, the rough cut, the brands (`NORTHSTAR COLA`), the artworks
(`MIDNIGHT ORCHARD`, `HARBOR LIGHTS, 1961`), the signage (`THE VELVET ROOM`),
and the instrumental music cue are all invented for this repo and rendered from
code with Pillow, NumPy, and a bundled ffmpeg.

```bash
python tools/generate_demo_assets.py
```

---

## Running it

### Prerequisites

- Python 3.11+ and Node 20+
- A Google Cloud project with billing enabled
- A [Parallel](https://platform.parallel.ai) API key

### Setup

```bash
cp .env.example .env
```

Fill in `GOOGLE_CLOUD_PROJECT` and `PARALLEL_API_KEY`, and set `MOCK_RESEARCH=false`.

```bash
gcloud auth application-default login
```

```bash
gcloud services enable aiplatform.googleapis.com --project YOUR_PROJECT_ID
```

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
.venv/bin/python -m uvicorn backend.app.main:app --port 8080
```

The API now runs standalone; the UI is a separate Next.js app in
[`apps/web`](apps/web) (deployed to Cloudflare Workers in production). To run
it locally against the API above:

```bash
bun install
CLEARCUT_API_ORIGIN=http://localhost:8080 bun --filter @clearcut/web dev
```

Open the URL `next dev` prints and click **Run real sample**.

On Windows use `.venv\Scripts\python.exe`. If `gcloud` complains about Python
2.7, set `CLOUDSDK_PYTHON` to a Python 3 executable.

### Without credentials

`MOCK_RESEARCH=true` serves Parallel from fixtures — the pipeline runs, no key,
no bill. Every fixture value is prefixed `MOCK:` so it can never be mistaken for
a sourced finding, and the UI shows a `mock research` badge. Google Cloud
credentials are still required, because the scans are real Gemini calls.

### Tests

```bash
python -m backend.tests.test_offline
```

55 checks, no credentials needed. Covers the approval invariant, status/colour
mapping, screenplay parsing, reconciliation bookkeeping, packet export, and the
progress bus.

---

## Deploying

```bash
./deploy.ps1 -ProjectId YOUR_PROJECT_ID -ParallelApiKey pk_xxx
```

Enables the APIs, stores the Parallel key in Secret Manager, creates a
least-privilege service account, deploys, then re-deploys with `PUBLIC_BASE_URL`
set so Monitor webhooks can reach the service.

---

## How long a run takes

A `core` Task run is ~3–4 minutes of real web research. Items fan out
`RESEARCH_CONCURRENCY` at a time:

```
ceil(items / RESEARCH_CONCURRENCY) × ~4 min  +  ~2 min for the scans
```

The seeded demo (11 items, concurrency 16) lands in about six minutes. Parallel
Search results appear within seconds, so the UI is populated long before the
dossiers land. Drop `PARALLEL_PROCESSOR` to `base` to trade depth for speed.

---

## Configuration

| Variable | Default | |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | — | GCP project id |
| `GOOGLE_CLOUD_LOCATION` | `global` | Vertex AI location |
| `GOOGLE_GENAI_USE_VERTEXAI` | `TRUE` | `FALSE` to use an AI Studio key |
| `GEMINI_MODEL` | *(probe)* | Pin a model, skipping the startup probe |
| `GCS_BUCKET` | — | Set to read cuts from Cloud Storage instead of inline |
| `PARALLEL_API_KEY` | — | Parallel key |
| `PARALLEL_SEARCH_MODE` | `basic` | `turbo`, `basic`, or `advanced` |
| `PARALLEL_PROCESSOR` | `core` | `lite`/`base`/`core`/`pro`/`ultra` |
| `RESEARCH_CONCURRENCY` | `16` | In-flight research runs |
| `MOCK_RESEARCH` | `false` | Serve fixtures instead of calling Parallel |
| `USE_FIRESTORE` | `false` | Persist projects and audit trail |
| `PUBLIC_BASE_URL` | — | Public origin; required for Monitor webhooks |
| `PARALLEL_WEBHOOK_SECRET` | — | Require `x-radar-secret` on webhooks |

---

## Limits, honestly

- **This is research support, not legal advice, and nothing it produces is a
  legal clearance.** It exists to make a clearance professional dramatically
  faster. Counsel owns every legal conclusion.
- **The cut scanner is a candidate detector**, not a trademark registry or an
  audio fingerprinter. It reports what it can see and hear, flags low
  confidence, and leaves ambiguity ambiguous.
- **Rights holders are candidates** derived from public sources, with citations
  and retrieval dates. Confirm before reliance.
- **Scanned PDFs need OCR first.** Clearance Radar reads the text layer and says
  so rather than silently returning nothing.
- **In-memory by default.** Set `USE_FIRESTORE=true` for anything you care about
  keeping.

## License

MIT — see [LICENSE](LICENSE).
