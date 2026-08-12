"""Fixtures for MOCK_RESEARCH mode.

Lets anyone clone the repo and watch the pipeline run without a Parallel key.
Every value is prefixed `MOCK:` on purpose — this data is shaped like real
clearance research but is entirely invented, and a fixture must never be
mistaken for a sourced finding.
"""

from __future__ import annotations

from typing import Any

from .models import ClearanceItem, EvidenceSource, MonitorRecord

_FIXTURES: dict[str, dict[str, Any]] = {
    "music": {
        "holders": [
            ("MOCK: Example Music Publishing", "publisher", ["synchronization"], "50%"),
            ("MOCK: Example Records Group", "label", ["master use"], "100%"),
        ],
        "routes": [("MOCK: Example Music Publishing", "Submit a sync request via the licensing portal.", "MOCK: sync@example.test")],
        "summary": "MOCK: composition and master are controlled separately; clearing only one leaves the production unable to use the cue.",
    },
    "artwork": {
        "holders": [("MOCK: Example Artists Rights Society", "agency", ["reproduction"], "100%")],
        "routes": [("MOCK: Example Artists Rights Society", "File a reproduction licence request.", "MOCK: licensing@example.test")],
        "summary": "MOCK: filming an artwork on set is a reproduction, even in the background.",
    },
    "brand": {
        "holders": [("MOCK: Example Brands Inc.", "brand owner", ["trademark use"], "100%")],
        "routes": [("MOCK: Example Brands Inc.", "Request a clearance letter from brand legal.", "MOCK: clearance@example.test")],
        "summary": "MOCK: neutral background use is often nominative fair use; a negative depiction usually triggers refusal.",
    },
    "signage": {
        "holders": [("MOCK: Example Property Holdings", "brand owner", ["trademark use"], "100%")],
        "routes": [("MOCK: Example Property Holdings", "Obtain a location agreement covering signage.", "MOCK: locations@example.test")],
        "summary": "MOCK: signage in shot may need both a location agreement and trademark clearance.",
    },
}

_DEFAULT: dict[str, Any] = {
    "holders": [("MOCK: Unidentified rights holder", "unknown", ["use licence"], "Unknown")],
    "routes": [("MOCK: Unknown", "No public licensing route identified.", "MOCK: unknown")],
    "summary": "MOCK: ownership could not be established from fixtures.",
}


def mock_search_sources(item: ClearanceItem) -> list[EvidenceSource]:
    return [
        EvidenceSource(
            url=f"https://example.test/mock-search/{item.id}",
            title="MOCK SEARCH RESULT — not a real citation",
            excerpt=f"MOCK excerpt about {item.name}. Live Parallel Search is disabled.",
            via="parallel_search",
        )
    ]


def mock_dossier(item: ClearanceItem) -> dict[str, Any]:
    fixture = _FIXTURES.get(item.category, _DEFAULT)
    return {
        "candidate_rights_holders": [
            {
                "name": name,
                "role": role,
                "rights_implicated": rights,
                "share": share,
                "confidence": "low",
                "basis": "MOCK MODE — fixture data, no research was performed.",
            }
            for name, role, rights, share in fixture["holders"]
        ],
        "licensing_routes": [
            {"organization": org, "route": route, "contact": contact, "url": ""}
            for org, route, contact in fixture["routes"]
        ],
        "research_summary": fixture["summary"],
        "evidence_gaps": ["MOCK: everything — no live research was performed."],
        "unresolved_questions": ["MOCK: confirm ownership against a real source."],
        "recommended_actions": ["MOCK: set PARALLEL_API_KEY and rerun with MOCK_RESEARCH=false."],
        "public_domain_status": "MOCK: unknown",
        "known_disputes": "MOCK: none found",
        "overall_confidence": "low",
        "__run_id__": f"mock-{item.id}",
        "__basis__": [
            {
                "field": "candidate_rights_holders",
                "reasoning": "MOCK MODE",
                "confidence": "low",
                "citations": [
                    {
                        "url": f"https://example.test/mock-task/{item.id}",
                        "title": "MOCK SOURCE — not a real citation",
                        "excerpts": [f"MOCK excerpt regarding {item.name}."],
                    }
                ],
            }
        ],
    }


def mock_monitor_record(
    item: ClearanceItem, project_id: str, query: str, frequency: str
) -> MonitorRecord:
    return MonitorRecord(
        monitor_id=f"mock-monitor-{item.id}",
        project_id=project_id,
        item_id=item.id,
        item_name=item.name,
        query=query,
        frequency=frequency,
    )


def mock_monitor_events(monitor_id: str) -> list[dict[str, Any]]:
    return [
        {
            "event_id": f"{monitor_id}-evt-1",
            "event_date": "2026-08-01",
            "content": "MOCK EVENT — no live monitoring is running. With a real "
            "PARALLEL_API_KEY this is where ownership changes, licensing-contact "
            "changes, and litigation would appear as they happen.",
            "basis": [],
        }
    ]
