import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

import { DomainError } from "@clearcut/domain";

import { AssetStoreError } from "../repositories/asset-store";
import { RepositoryError } from "../repositories/project-repository";
import type { ClearCutEnv } from "../context";

export class ApiProblem extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiProblem";
  }
}

export function errorResponse(error: unknown, context: Context<ClearCutEnv>) {
  const requestId = context.get("requestId") || `req_${crypto.randomUUID()}`;
  if (error instanceof ApiProblem) {
    return context.json({
      code: error.code,
      message: error.message,
      request_id: requestId,
      ...(error.fieldErrors ? { field_errors: error.fieldErrors } : {}),
    }, error.status);
  }
  if (error instanceof RepositoryError) {
    const status = error.code === "project_not_found" ? 404 : 500;
    return context.json({ code: error.code, message: error.message, request_id: requestId }, status);
  }
  if (error instanceof AssetStoreError) {
    const status = error.code === "asset_not_found" ? 404 : error.code === "invalid_asset_range" ? 416 : 400;
    return context.json({ code: error.code, message: error.message, request_id: requestId }, status);
  }
  if (error instanceof DomainError) {
    const status: ContentfulStatusCode = error.code === "human_owned_status"
      ? 403
      : error.code === "revision_conflict"
        ? 409
        : 422;
    return context.json({ code: error.code, message: error.message, request_id: requestId }, status);
  }
  if (error instanceof ZodError) {
    const fieldErrors = error.flatten().fieldErrors as Record<string, string[]>;
    return context.json({
      code: "validation_error",
      message: "The request did not match the expected shape.",
      request_id: requestId,
      field_errors: fieldErrors,
    }, 422);
  }
  console.error(JSON.stringify({ level: "error", request_id: requestId, message: "Unhandled API error" }));
  return context.json({
    code: "internal_error",
    message: "The request could not be completed.",
    request_id: requestId,
  }, 500);
}
