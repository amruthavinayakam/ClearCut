import { extname } from "node:path";
import { fileURLToPath } from "node:url";

export type ScreenplayScene = {
  index: number;
  heading: string;
  page: number | null;
  text: string;
};

export type ScreenplayDocument = {
  title: string;
  pageCount: number;
  scenes: ScreenplayScene[];
  text: string;
};

export class ScreenplayParseError extends Error {
  constructor(
    public readonly code: "no_text_layer" | "unreadable_container",
    message: string,
  ) {
    super(message);
    this.name = "ScreenplayParseError";
  }
}

const HEADING = /^(?:INT\.?|EXT\.?|INT\.\/EXT\.?|EXT\.\/INT\.?|I\/E\.?)\s+/i;

function titleFrom(lines: string[], filename: string): string {
  const fountainTitle = lines.find((line) => /^title\s*:/i.test(line));
  if (fountainTitle) return fountainTitle.replace(/^title\s*:/i, "").trim();
  const first = lines.find((line) => line.trim() && !/^(credit|author|draft date)\s*:/i.test(line));
  return first?.trim() || filename.replace(/\.[^.]+$/, "");
}

function scenesFrom(lines: Array<{ text: string; page: number | null }>): ScreenplayScene[] {
  const scenes: ScreenplayScene[] = [];
  let active: ScreenplayScene | null = null;
  for (const line of lines) {
    const text = line.text.trim();
    if (HEADING.test(text)) {
      active = { index: scenes.length + 1, heading: text, page: line.page, text };
      scenes.push(active);
    } else if (active && text) {
      active.text += `\n${text}`;
    }
  }
  return scenes;
}

async function pdfLines(bytes: Uint8Array): Promise<Array<{ text: string; page: number | null }>> {
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfModuleUrl = import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs");
    const standardFontDataUrl = `${fileURLToPath(new URL("../../standard_fonts/", pdfModuleUrl))}/`;
    const document = await getDocument({ data: bytes, standardFontDataUrl }).promise;
    const lines: Array<{ text: string; page: number | null }> = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      // A pdf.js text item is a *run*, not a line: one line of a screenplay is
      // usually several runs, and the run that ends the line often carries an
      // empty string. Treating each run as its own line broke "A railroad
      // one-bedroom off Monmouth Street." into "A" and the rest, and discarding
      // empty runs threw away the only end-of-line signal there was.
      let current = "";
      let baseline: number | null = null;
      let runEnd: number | null = null;
      const flush = () => {
        if (current.trim()) lines.push({ text: current.trimEnd(), page: pageNumber });
        current = "";
        baseline = null;
        runEnd = null;
      };
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const x = item.transform[4] as number;
        const y = item.transform[5] as number;
        // A different baseline is a new line whatever the runs claim.
        if (baseline !== null && Math.abs(y - baseline) > 1) flush();
        // Runs are laid out by position, so a horizontal gap is a space that no
        // run contains. Without this the joined runs read as "Arailroad".
        if (current && runEnd !== null && x - runEnd > 1 && !/\s$/.test(current) && !/^\s/.test(item.str)) {
          current += " ";
        }
        current += item.str;
        baseline = y;
        runEnd = x + (item.width as number);
        if (item.hasEOL) flush();
      }
      flush();
    }
    if (lines.length === 0) {
      throw new ScreenplayParseError("no_text_layer", "The screenplay PDF has no usable text layer.");
    }
    return lines;
  } catch (error) {
    if (error instanceof ScreenplayParseError) throw error;
    throw new ScreenplayParseError("unreadable_container", "The screenplay container could not be read.");
  }
}

export async function parseScreenplay(bytes: Uint8Array, filename: string): Promise<ScreenplayDocument> {
  const suffix = extname(filename).toLocaleLowerCase();
  const lines = suffix === ".pdf"
    ? await pdfLines(bytes)
    : new TextDecoder("utf-8", { fatal: true }).decode(bytes).split(/\r?\n/).map((text) => ({ text, page: null }));
  const text = lines.map((line) => line.text).join("\n").trim();
  if (!text) throw new ScreenplayParseError("unreadable_container", "The screenplay is empty.");
  const scenes = scenesFrom(lines);
  return {
    title: titleFrom(lines.map((line) => line.text), filename),
    pageCount: suffix === ".pdf"
      ? Math.max(...lines.map((line) => line.page ?? 1))
      : Math.max(1, Math.ceil(text.length / 1_800)),
    scenes,
    text,
  };
}

export function chunkScenes(document: ScreenplayDocument, maxCharacters = 60_000): ScreenplayScene[][] {
  const chunks: ScreenplayScene[][] = [];
  let current: ScreenplayScene[] = [];
  let length = 0;
  for (const scene of document.scenes) {
    if (current.length && length + scene.text.length > maxCharacters) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(scene);
    length += scene.text.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
