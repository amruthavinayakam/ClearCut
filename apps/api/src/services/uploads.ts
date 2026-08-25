import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import { PreflightResultSchema, type PreflightResult } from "@clearcut/contracts";

import type { ApiConfig } from "../config";
import { probeVideo } from "../media/probe";
import { parseScreenplay, ScreenplayParseError } from "../media/screenplay";

const SCRIPT_SUFFIXES = new Set([".pdf", ".txt", ".fountain", ".fdx", ".md"]);
const VIDEO_SUFFIXES = new Set([".mp4", ".mov", ".m4v", ".webm"]);

function result(input: PreflightResult): PreflightResult {
  return PreflightResultSchema.parse(input);
}

export async function preflightFile(file: File, config: ApiConfig): Promise<PreflightResult> {
  const suffix = extname(file.name).toLocaleLowerCase();
  const kind = SCRIPT_SUFFIXES.has(suffix) ? "screenplay" : VIDEO_SUFFIXES.has(suffix) ? "cut" : "unknown";
  const base = {
    kind,
    filename: file.name || "upload",
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
  } as const;
  if (file.size > config.maxUploadBytes) {
    return result({
      ...base,
      accepted: false,
      details: {},
      errors: [{ code: "too_large", message: `File exceeds the ${Math.floor(config.maxUploadBytes / 1_048_576)} MB limit.` }],
    });
  }
  if (kind === "unknown") {
    return result({
      ...base,
      accepted: false,
      details: {},
      errors: [{ code: "unsupported_type", message: "Use a supported screenplay document or video container." }],
    });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === "screenplay") {
    if (bytes.every((value) => String.fromCharCode(value).trim() === "")) {
      return result({
        ...base,
        accepted: false,
        details: {},
        errors: [{ code: "no_text_layer", message: "The screenplay has no usable text." }],
      });
    }
    try {
      const document = await parseScreenplay(bytes, file.name);
      return result({
        ...base,
        accepted: true,
        details: {
          title: document.title,
          page_count: document.pageCount,
          scene_count: document.scenes.length,
          readable_text: true,
        },
        errors: [],
      });
    } catch (error) {
      const code = error instanceof ScreenplayParseError ? error.code : "unreadable_container";
      return result({
        ...base,
        accepted: false,
        details: {},
        errors: [{ code, message: error instanceof Error ? error.message : "The screenplay could not be read." }],
      });
    }
  }

  const directory = await mkdtemp(join(tmpdir(), "clearcut-preflight-"));
  const path = join(directory, `asset${suffix}`);
  try {
    await Bun.write(path, bytes);
    const video = await probeVideo(path, config.ffprobePath);
    return result({
      ...base,
      accepted: true,
      details: { duration_s: video.durationSeconds },
      errors: [],
    });
  } catch (error) {
    return result({
      ...base,
      accepted: false,
      details: {},
      errors: [{ code: "unreadable_container", message: error instanceof Error ? error.message : "The video could not be read." }],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
