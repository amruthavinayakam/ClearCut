"""Parallel integration — Search, Task, and Monitor.

Three distinct jobs, deliberately kept separate because they answer different
questions:

* **Search** (`search_evidence`) — live retrieval. Fast enough to run inside a
  coordinator's click and show the returned URLs in the UI. This is the layer
  that proves the evidence is current rather than remembered.
* **Task** (`build_dossier`) — structured research. Converts retrieval into a
  stable, schema-validated dossier with per-field citations.
* **Monitor** (`create_item_monitor`) — standing watch. Public changes after
  the fact, delivered by webhook.

Nothing here decides clearance status. Everything returns *evidence*.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from parallel import AsyncParallel

from .config import get_settings
from .models import (
    CandidateRightsHolder,
    ClearanceItem,
    EvidenceSource,
    LicensingRoute,
    MonitorRecord,
)

logger = logging.getLogger(__name__)

_client: Optional[AsyncParallel] = None


def get_client() -> AsyncParallel:
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.parallel_api_key:
            raise RuntimeError(
                "PARALLEL_API_KEY is not set. Set it in .env, or set MOCK_RESEARCH=true "
                "to run the pipeline against fixtures."
            )
        _client = AsyncParallel(api_key=settings.parallel_api_key)
    return _client


def _as_dict(obj: Any) -> dict[str, Any]:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    return {}


# ==========================================================================
# 1. Parallel Search — live retrieval
# ==========================================================================


def build_search_queries(item: ClearanceItem, production_title: str) -> tuple[list[str], str]:
    """Queries and objective for one clearance item.

    Deliberately narrow. We send the *element*, never the screenplay — the
    script stays in the production's own cloud project.
    """
    name = item.name
    by_category = {
        "music": [
            f"{name} song publisher sync licensing rights holder",
            f"{name} master recording owner label licensing contact",
        ],
        "artwork": [
            f"{name} artwork copyright rights holder licensing",
            f"{name} artist estate reproduction permission contact",
        ],
        "brand": [
            f"{name} trademark owner brand licensing film usage policy",
            f"{name} permissions contact for film and television use",
        ],
        "real_person": [
            f"{name} estate name and likeness licensing representative",
            f"{name} right of publicity rights holder contact",
        ],
        "location": [
            f"{name} filming permit location agreement contact",
            f"{name} property owner film permission",
        ],
        "quotation": [
            f"{name} copyright permissions publisher contact",
        ],
        "archival": [
            f"{name} archive footage licensing rates contact",
        ],
    }
    queries = by_category.get(
        item.category,
        [
            f"{name} rights holder licensing contact",
            f"{name} permission to use in film production",
        ],
    )

    objective = (
        f"Identify who currently controls the rights to '{name}' ({item.category}) and "
        f"the official route a film production would use to request permission. "
        f"Prioritise official licensing pages, rights-society registries, and primary "
        f"sources over commentary. The production is '{production_title}'. "
        f"If ownership cannot be established from a source, that is a finding — do not infer it."
    )
    return queries, objective


async def search_evidence(
    item: ClearanceItem, production_title: str, session_id: Optional[str] = None
) -> list[EvidenceSource]:
    """Run a live Parallel Search for one item and return cited sources."""
    settings = get_settings()

    if settings.mock_research:
        from .mock_data import mock_search_sources

        await asyncio.sleep(0.3)
        return mock_search_sources(item)

    client = get_client()
    queries, objective = build_search_queries(item, production_title)

    try:
        result = await client.search(
            search_queries=queries,
            objective=objective,
            mode=settings.parallel_search_mode,  # type: ignore[arg-type]
            max_chars_total=settings.parallel_search_max_chars,
            session_id=session_id,
        )
    except Exception as exc:  # noqa: BLE001 - a failed search must not kill the item
        logger.exception("Parallel Search failed for %s", item.name)
        raise ParallelSearchError(f"{type(exc).__name__}: {exc}") from exc

    sources: list[EvidenceSource] = []
    for row in getattr(result, "results", None) or []:
        data = _as_dict(row)
        url = data.get("url")
        if not url:
            continue
        excerpts = [e for e in (data.get("excerpts") or []) if e]
        sources.append(
            EvidenceSource(
                url=url,
                title=data.get("title"),
                excerpt=excerpts[0][:1200] if excerpts else "",
                publish_date=data.get("publish_date"),
                via="parallel_search",
            )
        )
    return sources


class ParallelSearchError(RuntimeError):
    """A live Search call failed."""


# ==========================================================================
# 2. Parallel Task — structured dossier
# ==========================================================================

_DOSSIER_PROPERTIES: dict[str, Any] = {
    "candidate_rights_holders": {
        "type": "array",
        "description": "Every entity that may control a right in this element. For "
        "music this must separate the composition (publisher) from the master "
        "recording (label) — they are different owners and a production that clears "
        "one cannot use the track. Return an empty array if none can be established.",
        "items": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Legal name only, under 100 characters."},
                "role": {
                    "type": "string",
                    "description": "publisher | label | estate | brand owner | archive | "
                    "registrant | agency | administrator | unknown",
                },
                "rights_implicated": {
                    "type": "array",
                    "description": "Short labels, e.g. 'synchronization', 'master use'.",
                    "items": {"type": "string"},
                },
                "share": {"type": "string", "description": "Percentage if known, else 'Unknown'."},
                "confidence": {"type": "string", "description": "low | medium | high"},
                "basis": {
                    "type": "string",
                    "description": "One line on why this candidate, naming the source type.",
                },
            },
            "required": ["name", "role", "rights_implicated", "share", "confidence", "basis"],
            "additionalProperties": False,
        },
    },
    "licensing_routes": {
        "type": "array",
        "description": "Official routes for requesting permission. Only routes you can "
        "cite — never invent an email address or portal.",
        "items": {
            "type": "object",
            "properties": {
                "organization": {"type": "string"},
                "route": {
                    "type": "string",
                    "description": "What a coordinator actually does, in one sentence.",
                },
                "contact": {"type": "string", "description": "Public email or department, or 'Not published'."},
                "url": {"type": "string", "description": "Official URL, or empty string."},
            },
            "required": ["organization", "route", "contact", "url"],
            "additionalProperties": False,
        },
    },
    "research_summary": {
        "type": "string",
        "description": "Three or four sentences a coordinator can act on. State what is "
        "established and what is not. No legal conclusions.",
    },
    "evidence_gaps": {
        "type": "array",
        "description": "Specific facts that could NOT be established from public sources. "
        "This field is as important as the findings — an empty array claims completeness.",
        "items": {"type": "string"},
    },
    "unresolved_questions": {
        "type": "array",
        "description": "Questions a human must answer or ask the rights holder.",
        "items": {"type": "string"},
    },
    "recommended_actions": {
        "type": "array",
        "description": "Concrete next steps in priority order, each naming who to contact "
        "or what document to obtain. Never 'consult a lawyer' alone.",
        "items": {"type": "string"},
    },
    "public_domain_status": {
        "type": "string",
        "description": "US public-domain status with reasoning and dates, or 'Unknown'. "
        "Note that a public-domain work can still have a copyrighted recording or "
        "photograph of it.",
    },
    "known_disputes": {
        "type": "string",
        "description": "Litigation, ownership disputes, reversion notices, or a documented "
        "history of refusing permission. 'None found' if clean.",
    },
    "overall_confidence": {
        "type": "string",
        "description": "low | medium | high — confidence that the named rights holders are "
        "actually correct and current.",
    },
}


def build_dossier_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": dict(_DOSSIER_PROPERTIES),
        "required": list(_DOSSIER_PROPERTIES.keys()),
        "additionalProperties": False,
    }


def build_dossier_input(
    item: ClearanceItem, production_title: str, search_sources: list[EvidenceSource]
) -> str:
    where: list[str] = []
    for ref in item.script_references[:4]:
        where.append(
            f"  - SCRIPT scene {ref.scene_index} ({ref.scene_heading}, p.{ref.page or '?'}): "
            f"{ref.usage_note}\n    \"{ref.excerpt.strip()[:300]}\""
        )
    for det in item.cut_detections[:4]:
        where.append(
            f"  - CUT {det.timecode.label()} ({det.modality}): {det.observation[:300]}"
        )

    prior = ""
    if search_sources:
        lines = "\n".join(
            f"  - {s.title or s.url} ({s.url})" for s in search_sources[:10]
        )
        prior = f"\n\nSOURCES ALREADY RETRIEVED (verify and go beyond these):\n{lines}"

    unscripted = (
        "\n\nNOTE: This element does NOT appear in the screenplay — it entered through "
        "the filmed material. No prior clearance research exists for it."
        if item.provenance == "cut_only"
        else ""
    )

    return f"""Rights clearance research for the production "{production_title}".

ELEMENT: {item.name}
CATEGORY: {item.category}
DESCRIPTION: {item.description}
APPEARS IN: {item.provenance.replace('_', ' ')}

WHERE IT APPEARS:
{chr(10).join(where) or "  (no placement detail captured)"}{unscripted}{prior}

Establish who currently controls the rights and the official route a production
would use to request permission. Prioritise primary sources: rights-society
registries, official licensing pages, trade press reporting ownership changes,
and court records.

Two rules that matter more than completeness:
1. Where a fact cannot be verified from a source, put it in `evidence_gaps` and
   say "Unknown". A wrong rights holder sends a coordinator down a dead end for
   weeks, which is worse than an admitted gap.
2. Do not state or imply a legal conclusion about whether use is permitted. You
   are assembling evidence for a human to judge."""


async def build_dossier(
    item: ClearanceItem, production_title: str, search_sources: Optional[list[EvidenceSource]] = None
) -> dict[str, Any]:
    """Run a structured Parallel Task and return the parsed dossier."""
    settings = get_settings()

    if settings.mock_research:
        from .mock_data import mock_dossier

        await asyncio.sleep(0.4)
        return mock_dossier(item)

    client = get_client()
    try:
        run = await client.task_run.create(
            input=build_dossier_input(item, production_title, search_sources or []),
            processor=settings.parallel_processor,
            task_spec={"output_schema": {"type": "json", "json_schema": build_dossier_schema()}},
            metadata={
                "item_id": item.id,
                "category": item.category,
                "project": "clearance-radar",
            },
        )
        result = await client.task_run.result(run.run_id, api_timeout=settings.parallel_timeout_s)
    except Exception as exc:  # noqa: BLE001 - one failed item must not kill the project
        logger.exception("Parallel Task failed for %s", item.name)
        return {"__error__": f"{type(exc).__name__}: {exc}"}

    output = result.output
    content = getattr(output, "content", None)
    if isinstance(content, str):
        content = {"research_summary": content}
    content = _as_dict(content)
    content["__run_id__"] = run.run_id
    content["__basis__"] = _parse_basis(getattr(output, "basis", None))
    return content


def _parse_basis(raw_basis: Any) -> list[dict[str, Any]]:
    parsed: list[dict[str, Any]] = []
    for entry in raw_basis or []:
        data = _as_dict(entry)
        citations = []
        for cite in data.get("citations") or []:
            cdata = _as_dict(cite)
            if cdata.get("url"):
                citations.append(
                    {
                        "url": cdata["url"],
                        "title": cdata.get("title"),
                        "excerpts": [e for e in (cdata.get("excerpts") or []) if e],
                    }
                )
        parsed.append(
            {
                "field": data.get("field", ""),
                "reasoning": data.get("reasoning") or "",
                "confidence": data.get("confidence"),
                "citations": citations,
            }
        )
    return parsed


def apply_dossier(item: ClearanceItem, dossier: dict[str, Any]) -> None:
    """Fold a Task result into the item. Never touches workflow_status."""
    if "__error__" in dossier:
        item.research_error = dossier["__error__"]
        return

    item.task_run_id = dossier.get("__run_id__")
    item.research_summary = str(dossier.get("research_summary", ""))
    item.evidence_gaps = [str(x) for x in (dossier.get("evidence_gaps") or [])]
    item.unresolved_questions = [str(x) for x in (dossier.get("unresolved_questions") or [])]
    item.recommended_actions = [str(x) for x in (dossier.get("recommended_actions") or [])]

    holders: list[CandidateRightsHolder] = []
    for row in dossier.get("candidate_rights_holders") or []:
        data = _as_dict(row)
        confidence = str(data.get("confidence", "low")).lower()
        holders.append(
            CandidateRightsHolder(
                name=str(data.get("name", "")),
                role=str(data.get("role", "")),
                rights_implicated=[str(r) for r in (data.get("rights_implicated") or [])],
                share=str(data.get("share", "")),
                confidence=confidence if confidence in {"low", "medium", "high"} else "low",
                basis=str(data.get("basis", "")),
            )
        )
    item.candidate_rights_holders = holders

    routes: list[LicensingRoute] = []
    for row in dossier.get("licensing_routes") or []:
        data = _as_dict(row)
        routes.append(
            LicensingRoute(
                organization=str(data.get("organization", "")),
                route=str(data.get("route", "")),
                contact=str(data.get("contact", "")),
                url=str(data.get("url", "")),
            )
        )
    item.licensing_routes = routes

    # Fold Task citations in alongside whatever Search already found.
    known = {s.url for s in item.sources}
    for basis in dossier.get("__basis__") or []:
        for citation in basis.get("citations") or []:
            if citation["url"] in known:
                continue
            known.add(citation["url"])
            item.sources.append(
                EvidenceSource(
                    url=citation["url"],
                    title=citation.get("title"),
                    excerpt=(citation.get("excerpts") or [""])[0][:1200],
                    via="parallel_task",
                    field=basis.get("field"),
                )
            )

    disputes = str(dossier.get("known_disputes", "")).strip()
    pd_status = str(dossier.get("public_domain_status", "")).strip()
    extra = []
    if pd_status:
        extra.append(f"Public domain: {pd_status}")
    if disputes and disputes.lower() not in {"none found", "none"}:
        extra.append(f"Known disputes: {disputes}")
    if extra:
        item.research_summary = (item.research_summary + "\n\n" + "\n".join(extra)).strip()


# ==========================================================================
# 3. Parallel Monitor — standing watch
# ==========================================================================


def build_monitor_query(item: ClearanceItem, production_title: str) -> str:
    angle = {
        "music": "publishing catalogue sales, master ownership transfers, copyright "
        "termination or reversion notices, or sync licensing litigation",
        "real_person": "estate litigation, changes in estate representation, right of "
        "publicity disputes, or objections to dramatised portrayals",
        "brand": "trademark filings and status changes, brand ownership changes, or the "
        "company objecting to depictions in film or television",
        "artwork": "copyright disputes, changes of licensing agent or estate, or "
        "public-domain status changes",
    }.get(
        item.category,
        "ownership changes, licensing policy changes, or litigation affecting who "
        "controls the rights",
    )
    return (
        f"Public developments concerning {item.name} relating to {angle}. "
        f"Only surface changes that would alter how a film production requests "
        f"permission to use {item.name}."
    )


async def create_item_monitor(
    item: ClearanceItem,
    production_title: str,
    project_id: str,
    frequency: str = "1d",
) -> MonitorRecord:
    settings = get_settings()
    query = build_monitor_query(item, production_title)

    if settings.mock_research:
        from .mock_data import mock_monitor_record

        return mock_monitor_record(item, project_id, query, frequency)

    client = get_client()
    webhook = None
    if settings.public_base_url:
        webhook = {
            "url": f"{settings.public_base_url.rstrip('/')}/api/webhooks/parallel",
            "event_types": ["monitor.event.detected"],
        }

    monitor = await client.monitor.create(
        type="event_stream",
        frequency=frequency,
        processor=settings.parallel_monitor_processor,
        # Backfill matters: a coordinator opening a watch needs to know what
        # already happened, not only what happens next.
        settings={"query": query, "include_backfill": True},
        metadata={
            "project_id": project_id,
            "item_id": item.id,
            "external_id": f"radar-{item.id}",
        },
        webhook=webhook,
    )

    return MonitorRecord(
        monitor_id=monitor.monitor_id,
        project_id=project_id,
        item_id=item.id,
        item_name=item.name,
        query=query,
        frequency=frequency,
        status=getattr(monitor, "status", "active") or "active",
    )


async def fetch_monitor_events(monitor_id: str, limit: int = 20) -> list[dict[str, Any]]:
    settings = get_settings()
    if settings.mock_research:
        from .mock_data import mock_monitor_events

        return mock_monitor_events(monitor_id)

    client = get_client()
    page = await client.monitor.events(monitor_id, limit=limit)
    events: list[dict[str, Any]] = []
    for event in getattr(page, "events", []) or []:
        data = _as_dict(event)
        output = _as_dict(data.get("output"))
        events.append(
            {
                "event_id": data.get("event_id"),
                "event_date": data.get("event_date"),
                "content": output.get("content"),
                "basis": _parse_basis(output.get("basis")),
            }
        )
    return events


async def cancel_monitor(monitor_id: str) -> None:
    if get_settings().mock_research:
        return
    await get_client().monitor.cancel(monitor_id)
