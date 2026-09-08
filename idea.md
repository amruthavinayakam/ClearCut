# ClearCut — Clearance Radar for Film Production

## One-line pitch

Feed ClearCut a screenplay and rough cut. It finds potentially uncleared material, turns every finding into a cited rights-research case, and shows exactly what changed when the next version arrives—while leaving every legal decision to a qualified human.

## The problem

A clearance coordinator must manually inspect both the page and the picture for songs, brands, artwork, real people, locations, quotations, signage, archival material, and other protected elements. They then research ownership and contact routes, preserve evidence, chase missing documents, and repeat the work whenever the edit changes.

That process is slow because the work is fragmented across documents, spreadsheets, browser tabs, email, and successive cuts. A cut may also introduce specific elements that never appeared in the screenplay.

## The product

ClearCut merges three ideas into one continuous workflow:

1. **Clearance Radar** scans the script and picture, then places every candidate on a risk timeline with page, scene, and timecode anchors.
2. **Clearance & Rights Agent** runs Parallel research per candidate and assembles a citation-backed dossier: possible rights holders, public contact routes, evidence gaps, and the next human action.
3. **Version Ripple** compares a new script or cut with the active production record and reports which cases are unchanged, added, removed, materially changed, or made stale by the revision.

The visual payoff is an evidence graph that begins with unresolved red/amber cases and becomes complete only as sources, production documents, and attributed human decisions are attached.

## Full flow

### 1. Intake

- Create a production.
- Upload a screenplay, a rough cut, or both.
- Preflight each input independently so one bad file does not discard the other.
- Preserve immutable source versions for later comparison.

### 2. Multimodal scan

- Gemini extracts screenplay candidates with page and scene anchors.
- Gemini scans the actual video for visual and audible candidates with bounded timecodes.
- ClearCut reconciles the two sets into script-only, cut-only, both, and materially changed uses.

### 3. Parallel rights research

- Parallel Search retrieves public evidence and citations.
- Parallel Task produces a schema-validated clearance dossier for every case.
- Cases run concurrently and stream progress into the workspace.
- Missing facts remain explicit gaps; they are never converted into inferred certainty.

### 4. Human review workspace

- Searchable case rail and risk status.
- Picture player with timecoded markers.
- Evidence graph connecting detection, sources, candidate holders, contact routes, documents, and decisions.
- Source ledger with citations and retrieval provenance.
- Production-document records for licences, releases, permits, and correspondence.
- Human dispositions require actor identity and rationale; document-dependent outcomes require a linked record.

### 5. Continuous watch

- Parallel Monitor watches unresolved public facts such as ownership, representation, registries, and official licensing policies.
- A detected change reopens the case without erasing its prior human history.

### 6. Version Ripple

- Upload only the changed screenplay or cut.
- Build the next version as an immutable candidate.
- Review all five comparison outcomes before applying it.
- Carry unchanged human work forward and reopen only affected cases.

### 7. Packet export

- Rebuild the packet from the current server record.
- Keep unresolved research and document-scope gaps visible.
- Require explicit confirmation before download.
- Append one immutable export event to the audit history.

## Why it can win

- **Immediate visual clarity:** judges can understand the product from the risk timeline, evidence graph, and page-to-screen cases without a narrated demo.
- **Real economic value:** it compresses weeks of repetitive coordination into an evidence-first review workflow.
- **Verifiable agent work:** citations, source excerpts, structured outputs, and audit history are inspectable.
- **Parallel-native:** Search retrieves evidence, Task validates a dossier, and Monitor supplies the second act after the first scan.
- **More than a scanner:** Version Ripple and the production record make it a system teams return to throughout post-production.
- **Responsible framing:** ClearCut organizes research and workflow; it never claims to issue legal clearance.

## Technical shape

- Next.js 16, React 19, Tailwind CSS 4, shadcn/Base UI, and Geist Sans/Mono.
- Bun + Hono API with Zod contracts shared end to end.
- Gemini multimodal extraction and reconciliation.
- Parallel Search, Task, and Monitor.
- Typed Server-Sent Events with polling recovery.
- Cloudflare production path with OpenNext, Workers, D1, and R2.

## Demo-independent judging path

The application itself tells the story:

`boot → production library → two-source intake → live analysis stages → evidence workspace → cited rights route → human gate → Version Ripple → audited packet`

Fixture mode is deterministic for judging and visibly labels every generated value `MOCK:`. Live-provider behavior uses the same validated contracts and UI states.

## Product boundary

ClearCut is research for human legal review. It does not decide whether a use is lawful, guarantee exhaustive detection, confirm ownership, interpret contract language, or approve a production element.
