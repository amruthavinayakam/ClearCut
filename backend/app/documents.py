"""Helpers and input models for production documents."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from .models import ClearanceItem, ProductionDocument
from .scope import DocumentScope, IntendedUseProfile, ScopeAssessment, assess_scope


def comma_list(value: str) -> list[str]:
    return list(dict.fromkeys(part.strip() for part in value.split(",") if part.strip()))


def find_document(item: ClearanceItem, document_id: str) -> Optional[ProductionDocument]:
    return next((document for document in item.documents if document.id == document_id), None)


def document_scope(document: ProductionDocument) -> DocumentScope:
    return DocumentScope(
        media=document.media,
        territories=document.territories,
        starts_on=document.starts_on,
        ends_on=document.ends_on,
        perpetual=document.perpetual,
        covered_use=document.covered_use,
    )


def scope_for(document: ProductionDocument, intended: IntendedUseProfile) -> ScopeAssessment:
    return assess_scope(intended, document_scope(document))


class DocumentMetadataPatch(BaseModel):
    kind: Optional[str] = None
    title: Optional[str] = Field(default=None, max_length=180)
    notes: Optional[str] = Field(default=None, max_length=4000)
    media: Optional[list[str]] = None
    territories: Optional[list[str]] = None
    starts_on: Optional[str] = None
    ends_on: Optional[str] = None
    perpetual: Optional[bool] = None
    covered_use: Optional[str] = Field(default=None, max_length=1000)
