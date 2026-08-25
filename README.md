# ClearCut

ClearCut is a multimodal clearance-research workspace for film and television. It scans a screenplay and rough cut, reconciles page-to-screen changes, researches candidate rights routes with citations, and keeps the evidence, production record, revision history, and human decisions in one auditable workspace.

**Research for human legal review. ClearCut does not issue legal clearance.**

Built for the Agentic Cinema hackathon and the Parallel track.

## Product flow

1. **Create a production.** Upload a screenplay, a rough cut, or both. Each file is preflighted independently, so a valid input is preserved if the other fails.
2. **Watch the agent pipeline.** Gemini extracts candidates from the page and picture, ClearCut reconciles them, and Parallel Search + Task research every case in parallel.
3. **Review the evidence.** The workspace joins a case rail, timecoded picture, risk timeline, evidence graph, citations, candidate holders, licensing routes, and open questions.
4. **Record the human outcome.** Coordinator and counsel actions require an attributable rationale. Approval-like states require a linked production document.
5. **Attach the production record.** Licences, releases, permits, and correspondence retain media, territory, term, and covered-use metadata. ClearCut compares recorded scope without interpreting legal meaning.
6. **Run Version Ripple.** Upload a changed script or cut and review `unchanged`, `added`, `removed`, `materially_changed`, and `decision_stale` outcomes before applying the candidate revision.
7. **Export the packet.** Preview the current server-built research packet, including incomplete work, and explicitly confirm the audited Markdown export.
8. **Keep watching.** Parallel Monitor can reopen a case when researched public facts change without overwriting prior human history.

The interface is ultraminimal and technical: Geist Sans/Mono, compact neutral surfaces, graphite picture areas, a single blue action colour, and sparse semantic risk accents. It includes desktop and mobile shells, loading/error/empty states, keyboard navigation, and a `Cmd/Ctrl+K` command palette.

## Agent system

```text
screenplay ──┐
             ├─ Gemini scan ─ reconcile ─ Parallel Search + Task ─ human review
rough cut ───┘                                      │
                                                   └─ Parallel Monitor → reopen on change
```

- **Gemini screenplay scan** extracts named and generic clearable candidates with page and scene anchors.
- **Gemini cut scan** returns timecoded visual/audio candidates and readable on-screen text.
- **Reconciliation** distinguishes elements found in both sources from script-only, cut-only, and materially changed uses.
- **Parallel Search** retrieves public evidence and citations.
- **Parallel Task** returns a schema-validated dossier with candidate holders, possible contact routes, evidence gaps, and next human actions.
- **Parallel Monitor** watches unresolved public facts and can reopen a linked case through an authenticated webhook.
- **ClearCut Copilot** explains the current stored record but cannot make human-owned dispositions.

The live clients are in [`packages/integrations/src`](packages/integrations/src), pipeline orchestration is in [`apps/api/src/pipeline`](apps/api/src/pipeline), and the UI flow is under [`apps/web/src`](apps/web/src).

## Safety model

Agent and system actors may research a case up to `evidence_ready`; they cannot set coordinator, counsel, permission, replacement, or false-positive outcomes. Human actions require a rationale, and document-dependent outcomes require a production record linked to the same case.

Late research cannot overwrite a human disposition. Revision application is predecessor-checked and idempotent. Packet previewing creates no audit event; a confirmed export does.

## Stack

- **Web:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/Base UI, Geist Sans and Geist Mono
- **API:** Bun, Hono, Zod, shared TypeScript contracts
- **Agents:** Gemini multimodal analysis; Parallel Search, Task, and Monitor
- **Local persistence:** in-memory project records plus opaque filesystem assets in `.clearcut/assets`
- **Cloudflare path:** OpenNext Workers for the web, an edge Worker for API routing/direct R2 uploads, D1/R2 repositories, and a Bun API runtime
- **Live progress:** typed Server-Sent Events with polling recovery

The monorepo keeps API schemas in [`packages/contracts`](packages/contracts), invariant-heavy logic in [`packages/domain`](packages/domain), provider clients in [`packages/integrations`](packages/integrations), and reusable UI primitives in [`packages/ui`](packages/ui).

## Run locally

Prerequisites: Bun 1.3+, `ffprobe`, and the existing Portless `.lcl` proxy.

```bash
bun install
cp .env.example .env
MOCK_RESEARCH=true bun run dev
```

Open:

- Web: [https://clearcut.lcl](https://clearcut.lcl)
- API health: [https://clearcut-api.lcl/api/health](https://clearcut-api.lcl/api/health)

Fixture mode is explicit and every human-facing fixture value is prefixed `MOCK:`. For live analysis, set `GOOGLE_API_KEY` and `PARALLEL_API_KEY`, then run `bun run dev` without `MOCK_RESEARCH=true`.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `GOOGLE_API_KEY` | — | Google AI Studio key for live Gemini analysis |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model used for structured multimodal output |
| `PARALLEL_API_KEY` | — | Parallel Search, Task, and Monitor key |
| `PARALLEL_PROCESSOR` | `core` | Structured Task processor |
| `PARALLEL_MONITOR_PROCESSOR` | `lite` | Monitor processor |
| `RESEARCH_CONCURRENCY` | `16` | Concurrent per-case research jobs |
| `MOCK_RESEARCH` | `false` | Use deterministic fixture integrations instead of live providers |
| `ASSET_STORAGE_DIR` | `.clearcut/assets` | Local opaque asset store |
| `FFPROBE_PATH` | `ffprobe` | Media probe binary |
| `MAX_UPLOAD_BYTES` | `209715200` | API upload ceiling |
| `PUBLIC_BASE_URL` | — | Public origin used for Parallel webhook delivery |
| `PARALLEL_WEBHOOK_SECRET` | — | Required webhook secret |
| `CLEARCUT_API_ORIGIN` | `https://clearcut-api.lcl` | Development rewrite target used by Next.js |

## Verification

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

The automated suites cover shared contracts, status ownership, recorded document scope, immutable revisions, packet idempotency, provider validation, API lifecycle and security, Cloudflare routing, and the main Next.js product surfaces. The running application is additionally browser-verified through intake, review, citations, monitored cases, packet export, Version Ripple, and mobile layout.

## Limits

- ClearCut supports clearance research; it is not legal advice and does not determine whether a use is lawful.
- Detection produces candidates, not a guarantee of exhaustive trademark, copyright, music, privacy, or publicity-rights identification.
- Candidate rights holders and contact routes come from public research and must be confirmed by a qualified human.
- Scope assessment compares recorded metadata; it does not parse legal meaning from an attached document.
- Scanned screenplay PDFs need a usable text layer or OCR before upload.
- The default local repository is intentionally non-durable; use the Cloudflare D1/R2 adapters for production persistence.

## License

MIT — see [`LICENSE`](LICENSE).
