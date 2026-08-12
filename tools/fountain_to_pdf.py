"""Render a Fountain screenplay to a correctly formatted PDF.

Industry format: Courier 12pt, US Letter, 1.5" left margin, and the standard
indents for character, parenthetical, and dialogue. That matters here beyond
looking right — Clearance Radar reads the PDF text layer and attaches a page
number to every line, so a coordinator can find a cited element on the page.

    python tools/fountain_to_pdf.py [input.fountain] [output.pdf]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IN = ROOT / "backend" / "app" / "samples" / "the_long_way_down.fountain"
DEFAULT_OUT = ROOT / "backend" / "app" / "samples" / "the_long_way_down.pdf"

FONT = "Courier"
FONT_BOLD = "Courier-Bold"
SIZE = 12
LINE = 14.4  # 12pt Courier at single spacing

PAGE_W, PAGE_H = LETTER
LEFT = 1.5 * 72
RIGHT = PAGE_W - 1.0 * 72
TOP = PAGE_H - 1.0 * 72
BOTTOM = 1.0 * 72

# Standard indents, measured from the left page edge.
INDENT_CHARACTER = 3.7 * 72
INDENT_PAREN = 3.1 * 72
INDENT_DIALOGUE = 2.5 * 72
WIDTH_DIALOGUE = 3.5 * 72
WIDTH_ACTION = RIGHT - LEFT

SLUGLINE = re.compile(r"^\s*(INT|EXT|INT\.?/EXT|EXT\.?/INT|I/E)[\.\s]", re.IGNORECASE)
TRANSITION = re.compile(r"^\s*(FADE (IN|OUT|TO)|CUT TO|DISSOLVE TO|SMASH CUT)[\.:]?\s*$", re.IGNORECASE)
CHARACTER = re.compile(r"^[A-Z][A-Z0-9 .'\-]*(\s*\(.*\))?\s*$")
PARENTHETICAL = re.compile(r"^\s*\(.*\)\s*$")
TITLE_KEY = re.compile(r"^(Title|Credit|Author|Draft date|Source|Contact):\s*(.*)$", re.IGNORECASE)


def wrap(text: str, width_pt: float) -> list[str]:
    char_w = pdfmetrics.stringWidth("M", FONT, SIZE)
    max_chars = max(10, int(width_pt / char_w))
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        if len(current) + 1 + len(word) <= max_chars:
            current += " " + word
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


class Writer:
    def __init__(self, target: Path) -> None:
        self.canvas = canvas.Canvas(str(target), pagesize=LETTER)
        self.y = TOP
        self.page = 1
        self.canvas.setFont(FONT, SIZE)

    def _new_page(self) -> None:
        # Page numbers sit top-right, as in a production draft.
        self.canvas.setFont(FONT, SIZE)
        self.canvas.drawRightString(RIGHT, PAGE_H - 0.6 * 72, f"{self.page}.")
        self.canvas.showPage()
        self.page += 1
        self.y = TOP
        self.canvas.setFont(FONT, SIZE)

    def space(self, lines: float = 1) -> None:
        self.y -= LINE * lines
        if self.y < BOTTOM:
            self._new_page()

    def write(self, text: str, x: float, width: float, bold: bool = False) -> None:
        for line in wrap(text, width):
            if self.y < BOTTOM:
                self._new_page()
            self.canvas.setFont(FONT_BOLD if bold else FONT, SIZE)
            self.canvas.drawString(x, self.y, line)
            self.y -= LINE

    def title_page(self, meta: dict[str, str]) -> None:
        title = meta.get("title", "UNTITLED").upper()
        self.canvas.setFont(FONT_BOLD, SIZE)
        self.canvas.drawCentredString(PAGE_W / 2, PAGE_H * 0.62, title)
        self.canvas.setFont(FONT, SIZE)
        if meta.get("credit"):
            self.canvas.drawCentredString(PAGE_W / 2, PAGE_H * 0.62 - LINE * 3, meta["credit"])
        if meta.get("author"):
            self.canvas.drawCentredString(PAGE_W / 2, PAGE_H * 0.62 - LINE * 5, meta["author"])
        if meta.get("draft date"):
            self.canvas.drawString(LEFT, BOTTOM + LINE * 2, meta["draft date"])
        self.canvas.showPage()
        self.y = TOP
        self.canvas.setFont(FONT, SIZE)

    def save(self) -> None:
        self.canvas.drawRightString(RIGHT, PAGE_H - 0.6 * 72, f"{self.page}.")
        self.canvas.save()


def render(source: Path, target: Path) -> int:
    raw = source.read_text(encoding="utf-8").splitlines()

    meta: dict[str, str] = {}
    body_start = 0
    for index, line in enumerate(raw):
        match = TITLE_KEY.match(line)
        if match:
            meta[match.group(1).lower()] = match.group(2).strip()
            body_start = index + 1
        elif line.strip() == "" and meta:
            body_start = index + 1
            break
        elif not meta:
            break

    writer = Writer(target)
    if meta:
        writer.title_page(meta)

    # The Fountain source is hard-wrapped for readability. Re-wrapping each of
    # those lines independently would print the source's line breaks into the
    # PDF, so consecutive body lines are joined back into paragraphs first.
    # Structural elements stay on their own line.
    def is_structural(text: str) -> bool:
        return bool(
            SLUGLINE.match(text)
            or TRANSITION.match(text)
            or PARENTHETICAL.match(text)
            or (CHARACTER.match(text) and len(text) < 40)
        )

    body: list[str] = []
    buffer: list[str] = []
    for line in raw[body_start:]:
        stripped = line.strip()
        if not stripped or is_structural(stripped):
            if buffer:
                body.append(" ".join(buffer))
                buffer = []
            body.append(stripped)
        else:
            buffer.append(stripped)
    if buffer:
        body.append(" ".join(buffer))

    previous_blank = True
    in_dialogue = False

    for line in body:
        stripped = line.strip()

        if not stripped:
            if not previous_blank:
                writer.space(0.5)
            previous_blank = True
            in_dialogue = False
            continue

        if SLUGLINE.match(stripped):
            if not previous_blank:
                writer.space(0.5)
            writer.write(stripped.upper(), LEFT, WIDTH_ACTION, bold=True)
            writer.space(0.5)
            in_dialogue = False

        elif TRANSITION.match(stripped):
            writer.space(0.5)
            writer.canvas.setFont(FONT, SIZE)
            if writer.y < BOTTOM:
                writer._new_page()
            writer.canvas.drawRightString(RIGHT, writer.y, stripped.upper())
            writer.y -= LINE
            in_dialogue = False

        elif PARENTHETICAL.match(stripped) and in_dialogue:
            writer.write(stripped, INDENT_PAREN, WIDTH_DIALOGUE)

        elif CHARACTER.match(stripped) and previous_blank and len(stripped) < 40:
            writer.write(stripped.upper(), INDENT_CHARACTER, WIDTH_ACTION)
            in_dialogue = True

        elif in_dialogue:
            writer.write(stripped, INDENT_DIALOGUE, WIDTH_DIALOGUE)

        else:
            writer.write(stripped, LEFT, WIDTH_ACTION)
            in_dialogue = False

        previous_blank = False

    writer.save()
    return writer.page


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IN
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    pages = render(source, target)
    print(f"Wrote {target} — {pages} page(s), {target.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
