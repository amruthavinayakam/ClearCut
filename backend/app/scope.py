"""Deterministic comparison of recorded permission scope and intended use.

This module compares metadata. It deliberately does not decide whether a
document is authentic, enforceable, or legally sufficient.
"""

from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field


class IntendedUseProfile(BaseModel):
    media: list[str] = Field(default_factory=list)
    territories: list[str] = Field(default_factory=list)
    starts_on: Optional[str] = None
    ends_on: Optional[str] = None


class DocumentScope(BaseModel):
    media: list[str] = Field(default_factory=list)
    territories: list[str] = Field(default_factory=list)
    starts_on: Optional[str] = None
    ends_on: Optional[str] = None
    perpetual: bool = False
    covered_use: str = ""


class ScopeAssessment(BaseModel):
    outcome: Literal["covers", "partial", "unknown", "expired"]
    gaps: list[str] = Field(default_factory=list)


def _normalise(values: list[str]) -> dict[str, str]:
    return {value.strip().casefold(): value.strip() for value in values if value.strip()}


def _date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def assess_scope(intended: IntendedUseProfile, recorded: DocumentScope) -> ScopeAssessment:
    """Compare declared metadata without making a legal clearance decision."""
    recorded_end = _date(recorded.ends_on)
    intended_start = _date(intended.starts_on)
    if not recorded.perpetual and recorded_end and intended_start and recorded_end < intended_start:
        return ScopeAssessment(
            outcome="expired",
            gaps=["Recorded term ends before intended use begins."],
        )

    unknown: list[str] = []
    if not recorded.media:
        unknown.append("Recorded media is missing.")
    if not recorded.territories:
        unknown.append("Recorded territories are missing.")
    if not recorded.perpetual and not recorded.starts_on and not recorded.ends_on:
        unknown.append("Recorded term is missing.")
    if unknown:
        return ScopeAssessment(outcome="unknown", gaps=unknown)

    gaps: list[str] = []
    recorded_media = _normalise(recorded.media)
    recorded_territories = _normalise(recorded.territories)
    for key, label in _normalise(intended.media).items():
        if key not in recorded_media:
            gaps.append(f"{label.title()} is not listed in recorded media.")
    for key, label in _normalise(intended.territories).items():
        if key not in recorded_territories:
            gaps.append(f"{label.upper()} is not listed in recorded territories.")

    if not recorded.perpetual:
        recorded_start = _date(recorded.starts_on)
        intended_end = _date(intended.ends_on)
        if recorded_start and intended_start and recorded_start > intended_start:
            gaps.append("Recorded term starts after intended use begins.")
        if recorded_end and intended_end and recorded_end < intended_end:
            gaps.append("Recorded term ends before intended use ends.")

    return ScopeAssessment(outcome="partial" if gaps else "covers", gaps=gaps)
