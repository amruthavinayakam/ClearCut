"""Cut scan — Gemini multimodal analysis of the rough cut.

This is the half of the product that catches what the screenplay never knew
about. Props, set decoration, wardrobe, signage, and source music enter on the
day and land in the edit without ever passing a clearance desk.

Gemini reads the video directly and returns timecoded candidates. We call
google-genai here rather than routing through an ADK text agent because the
input is a video part; this function is then exposed to the ADK coordinator as
the `scan_cut_candidates` tool.

It is a *candidate detector*, not a trademark registry or an audio
fingerprinter. Ambiguous material stays ambiguous and says so.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from ..config import get_settings
from ..gemini import resolve_model
from ..models import Category, Confidence, CutDetection, Timecode

logger = logging.getLogger(__name__)


class RawCutDetection(BaseModel):
    name: str = Field(
        description="Short canonical name for the thing, e.g. 'Northstar Cola'. "
        "If it carries readable text or a title, use that exactly."
    )
    category: Category
    start_seconds: float = Field(description="When it first becomes visible or audible.")
    end_seconds: float = Field(description="When it leaves frame or stops.")
    representative_seconds: float = Field(
        description="The single clearest moment to grab a thumbnail from."
    )
    modality: str = Field(description="visual, audio, or both")
    observation: str = Field(
        description="What is literally on screen or on the track. Describe only what "
        "you can actually see or hear — no inference about ownership."
    )
    confidence: str = Field(description="low, medium, or high")
    readable_text: str = Field(
        default="", description="Any text legible on the element, verbatim. Empty if none."
    )
    why_clearable: str = Field(
        description="One line on why this may need permission."
    )


class CutScanResult(BaseModel):
    detections: list[RawCutDetection] = Field(default_factory=list)
    overall_notes: str = Field(
        default="", description="Anything ambiguous a human should look at."
    )


INSTRUCTION = """You are a clearance analyst reviewing a rough cut for a film
production. Your job is to flag every element that a third party might control,
so a human coordinator can research it.

Watch and listen to the entire clip. Flag:

- **artwork** — posters, paintings, photographs, murals, album covers, prints
  hung or placed in shot. Anything with a title or artist credit is high value.
- **brand / product** — packaging, labels, logos on props, wardrobe, vehicles,
  devices, food and drink containers
- **signage** — shop signs, neon, billboards, street furniture with a business name
- **music** — anything audible: score, source music, a cue under dialogue, humming
- **real_person** — an identifiable real human, in shot or on a screen within the shot
- **archival** — footage or images that appear to be pre-existing material
- **location** — a recognisable real building or landmark
- **quotation** — readable text from a book, article, or document held in shot

Rules:

1. **Report only what you can perceive.** Describe what is visible or audible.
   Never speculate about who owns it — that is researched later by a different
   system with citations.
2. **Read the text.** If an element carries legible words — a brand name, a
   painting title, an artist credit, a sign — transcribe it exactly into
   `readable_text`. That string is what makes research possible.
3. **Timecodes must be tight and in seconds** from the start of the clip. If
   something is on screen from 8 to 17.5 seconds, say 8.0 and 17.5. Pick
   `representative_seconds` where the element is clearest and largest.
4. **Music gets one detection spanning its whole run**, not one per shot.
5. **Set confidence honestly.** `high` only when the element is unmistakable and
   its text is fully legible. If you cannot read a label, say `low` and describe
   what you can see — an unreadable label is still a clearance question.
6. **Do not flag generic objects.** A plain chair, an unbranded mug, or an
   abstract shape with no title is not a clearable element. A poster with a
   title and an artist credit is.
7. Do not invent elements. If the clip is mostly a title card, say so.

Return JSON matching the schema."""


def _client() -> genai.Client:
    settings = get_settings()
    if settings.use_vertex:
        return genai.Client(
            vertexai=True,
            project=settings.google_cloud_project or None,
            location=settings.google_cloud_location,
        )
    return genai.Client(api_key=settings.google_api_key or None)


def _video_part(video_path: Path, gcs_uri: Optional[str]) -> types.Part:
    """Prefer a GCS URI; fall back to inline bytes for local runs.

    Inline is capped by the request size limit, so anything beyond a short
    rough cut really wants a bucket.
    """
    if gcs_uri:
        return types.Part.from_uri(file_uri=gcs_uri, mime_type="video/mp4")

    data = video_path.read_bytes()
    if len(data) > 18 * 1024 * 1024:
        raise ValueError(
            f"{video_path.name} is {len(data) / 1_000_000:.1f} MB. Inline upload is "
            "limited to about 18 MB — set GCS_BUCKET so the cut can be read from "
            "Cloud Storage instead."
        )
    return types.Part.from_bytes(data=data, mime_type="video/mp4")


def _coerce_confidence(value: str) -> Confidence:
    normalized = (value or "").strip().lower()
    return normalized if normalized in {"low", "medium", "high"} else "medium"  # type: ignore[return-value]


def _coerce_modality(value: str) -> str:
    normalized = (value or "").strip().lower()
    return normalized if normalized in {"visual", "audio", "both"} else "visual"


async def scan_cut(
    video_path: Path,
    production_title: str,
    duration_s: float,
    gcs_uri: Optional[str] = None,
    script_context: str = "",
) -> tuple[list[tuple[str, Category, CutDetection, str]], str]:
    """Analyse the cut and return (name, category, detection, readable_text) rows."""
    client = _client()
    model = resolve_model()

    context = ""
    if script_context:
        context = (
            "\n\nFOR CONTEXT, the screenplay for this production mentions the following. "
            "Use it only to help you name what you see — do NOT assume an element is "
            "present just because the script mentions it, and do NOT skip an element "
            "because the script omits it. Unscripted elements are the most important "
            f"thing you can find.\n{script_context}"
        )

    prompt = (
        f'ROUGH CUT for the production "{production_title}".\n'
        f"Duration: {duration_s:.1f} seconds.\n"
        f"Report timecodes in seconds between 0 and {duration_s:.1f}.{context}"
    )

    response = await client.aio.models.generate_content(
        model=model,
        contents=types.Content(
            role="user",
            parts=[_video_part(video_path, gcs_uri), types.Part(text=prompt)],
        ),
        config=types.GenerateContentConfig(
            system_instruction=INSTRUCTION,
            response_mime_type="application/json",
            response_schema=CutScanResult,
            temperature=0.2,
        ),
    )

    parsed = _parse(response)
    rows: list[tuple[str, Category, CutDetection, str]] = []
    for raw in parsed.detections:
        if not raw.name.strip():
            continue
        start = max(0.0, min(raw.start_seconds, duration_s))
        end = max(start, min(raw.end_seconds, duration_s))
        representative = raw.representative_seconds
        if not (start <= representative <= end):
            representative = start + (end - start) / 2

        rows.append(
            (
                raw.name.strip(),
                raw.category,
                CutDetection(
                    timecode=Timecode(start=start, end=end),
                    representative_time=representative,
                    modality=_coerce_modality(raw.modality),  # type: ignore[arg-type]
                    observation=raw.observation,
                    confidence=_coerce_confidence(raw.confidence),
                ),
                raw.readable_text.strip(),
            )
        )

    return rows, parsed.overall_notes


def _parse(response: Any) -> CutScanResult:
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, CutScanResult):
        return parsed

    text = getattr(response, "text", None) or ""
    if not text.strip():
        raise ValueError("Gemini returned no content for the cut scan.")
    try:
        return CutScanResult.model_validate(json.loads(text))
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Could not parse cut scan response: {text[:400]}") from exc
