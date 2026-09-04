"""Screenplay ingestion: PDF, Fountain, or plain text in; scenes out.

Scene segmentation matters more than it looks. Clearance findings have to cite
a scene and a page or a coordinator can't act on them, so we keep the page
number attached to every line as we parse.
"""

from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Optional

from pydantic import BaseModel


class Scene(BaseModel):
    """One slugline-delimited scene, with the page it starts on.

    Parsing artifacts rather than domain objects — a clearance item cites a
    scene and page, but scenes themselves never leave this module's outputs.
    """

    index: int
    heading: str
    page: Optional[int] = None
    text: str


class ScreenplayDoc(BaseModel):
    title: str
    source_filename: str
    page_count: int
    scenes: list[Scene]

    @property
    def word_count(self) -> int:
        return sum(len(s.text.split()) for s in self.scenes)

# Sluglines: INT., EXT., INT./EXT., I/E. Optionally numbered ("12  INT. ...").
SLUGLINE = re.compile(
    r"^\s*(?:[\d]{1,4}[A-Z]?[\.\)]?\s+)?"
    r"((?:INT|EXT|INT\.?/EXT|EXT\.?/INT|I/E)[\.\s][^\n]*)$",
    re.IGNORECASE,
)

# Fountain forces a slugline with a leading dot (".TITLE CARD").
FOUNTAIN_FORCED = re.compile(r"^\s*\.(?!\.)([^\n]+)$")

TITLE_HINTS = re.compile(r"^\s*(?:title|written by|screenplay by)\s*:?\s*(.+)$", re.IGNORECASE)


class ScreenplayParseError(ValueError):
    """Raised when a file yields no usable text."""


class NoTextLayerError(ScreenplayParseError):
    """Raised when a valid-looking document contains no extractable text."""


class UnreadableScreenplayError(ScreenplayParseError):
    """Raised when the uploaded bytes are not a readable document container."""


def _pdf_lines(data: bytes) -> list[tuple[int, str]]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        lines: list[tuple[int, str]] = []
        for page_no, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            for raw in text.splitlines():
                lines.append((page_no, raw.rstrip()))
    except Exception as exc:  # pypdf exposes several container-specific errors
        raise UnreadableScreenplayError("The PDF container could not be read.") from exc
    return lines


def _text_lines(data: bytes) -> list[tuple[int, str]]:
    text = data.decode("utf-8", errors="replace")
    if text and text.count("\ufffd") / len(text) > 0.08:
        raise UnreadableScreenplayError("The file is not readable UTF-8 text.")
    lines: list[tuple[int, str]] = []
    page = 1
    for raw in text.splitlines():
        # Respect explicit form feeds; otherwise approximate 55 lines/page,
        # which is close enough to standard screenplay format to be useful.
        if "\f" in raw:
            page += raw.count("\f")
            raw = raw.replace("\f", "")
        lines.append((page, raw.rstrip()))
        if len(lines) % 55 == 0:
            page += 1
    return lines


def _guess_title(lines: list[tuple[int, str]], fallback: str) -> str:
    for _, raw in lines[:60]:
        stripped = raw.strip()
        if not stripped:
            continue
        match = TITLE_HINTS.match(stripped)
        if match:
            candidate = match.group(1).strip().strip('"')
            if candidate:
                return candidate
        # An early all-caps line that isn't a slugline is usually the title.
        if (
            stripped.isupper()
            and 2 < len(stripped) < 60
            and not SLUGLINE.match(stripped)
            and "WRITTEN BY" not in stripped
        ):
            return stripped.title()
    return Path(fallback).stem.replace("_", " ").replace("-", " ").title()


def parse_screenplay(data: bytes, filename: str) -> ScreenplayDoc:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        lines = _pdf_lines(data)
    else:
        lines = _text_lines(data)

    if not any(raw.strip() for _, raw in lines):
        raise NoTextLayerError(
            "No text could be extracted. If this is a scanned PDF, it needs OCR first."
        )

    page_count = max((p for p, _ in lines), default=1)
    title = _guess_title(lines, filename)

    scenes: list[Scene] = []
    current_heading = "OPENING"
    current_page: int | None = lines[0][0] if lines else 1
    buffer: list[str] = []

    def flush() -> None:
        body = "\n".join(buffer).strip()
        # Drop the synthetic pre-slugline block when it's just a title page.
        if not body and not scenes:
            return
        scenes.append(
            Scene(
                index=len(scenes),
                heading=current_heading.strip(),
                page=current_page,
                text=body,
            )
        )

    for page, raw in lines:
        stripped = raw.strip()
        match = SLUGLINE.match(stripped) or FOUNTAIN_FORCED.match(stripped)
        if match and stripped:
            flush()
            current_heading = match.group(1).strip()
            current_page = page
            buffer = []
        else:
            buffer.append(raw)
    flush()

    if not scenes:
        # No sluglines at all (treatment, outline, scene fragment). Keep it as
        # one scene rather than failing — extraction still works fine.
        scenes = [
            Scene(
                index=0,
                heading="FULL DOCUMENT",
                page=1,
                text="\n".join(raw for _, raw in lines).strip(),
            )
        ]

    return ScreenplayDoc(
        title=title,
        source_filename=filename,
        page_count=page_count,
        scenes=scenes,
    )


def chunk_scenes(doc: ScreenplayDoc, max_chars: int = 60_000) -> list[list[Scene]]:
    """Group scenes into batches that comfortably fit one model call.

    Gemini's context window would swallow most features whole, but batching
    keeps each extraction call focused, which measurably improves recall of
    background elements (a logo on a coffee cup is easy to miss in 120 pages).
    """
    batches: list[list[Scene]] = []
    current: list[Scene] = []
    size = 0
    for scene in doc.scenes:
        scene_size = len(scene.text) + len(scene.heading) + 2
        if current and size + scene_size > max_chars:
            batches.append(current)
            current = []
            size = 0
        current.append(scene)
        size += scene_size
    if current:
        batches.append(current)
    return batches


def render_scenes(scenes: list[Scene]) -> str:
    parts = []
    for scene in scenes:
        page = f" [page {scene.page}]" if scene.page else ""
        parts.append(f"### SCENE {scene.index}{page}\n{scene.heading}\n\n{scene.text}")
    return "\n\n".join(parts)
