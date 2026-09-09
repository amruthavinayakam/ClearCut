import { z } from "zod";

import { HeatColorSchema, ProjectPhaseSchema, ProjectSchema, WorkflowStatusSchema } from "./project";

/**
 * The stream carries the record's own vocabulary, so it is typed as such.
 *
 * These fields were plain strings, which meant a consumer folding an event back
 * into a project had to widen or cast the result. The producer already only
 * ever publishes a phase, a workflow status and a heat colour.
 */

const SnapshotEventSchema = z.object({
  type: z.literal("snapshot"),
  project: ProjectSchema,
}).strict();

const ProgressEventSchema = z.object({
  type: z.literal("progress"),
  phase: ProjectPhaseSchema,
  message: z.string(),
  detail: z.record(z.string(), z.unknown()),
}).strict();

const SearchResultsEventSchema = z.object({
  type: z.literal("search_results"),
  item_id: z.string(),
  item_name: z.string(),
  sources: z.array(z.object({
    url: z.string().url(),
    title: z.string().nullable(),
    excerpt: z.string(),
  }).strict()),
}).strict();

const SearchFailedEventSchema = z.object({
  type: z.literal("search_failed"),
  item_id: z.string(),
  message: z.string(),
}).strict();

const ItemStatusEventSchema = z.object({
  type: z.literal("item_status"),
  item_id: z.string(),
  status: WorkflowStatusSchema,
  color: HeatColorSchema.optional(),
}).strict();

const ItemResearchedEventSchema = z.object({
  type: z.literal("item_researched"),
  item_id: z.string(),
  item_name: z.string(),
  status: WorkflowStatusSchema,
  color: HeatColorSchema,
  citations: z.number().int().nonnegative(),
  holders: z.number().int().nonnegative(),
}).strict();

const MonitorEventSchema = z.object({
  type: z.literal("monitor_event"),
  monitor_id: z.string(),
  item_id: z.string(),
  item_name: z.string(),
}).strict();

const DoneEventSchema = z.object({
  type: z.literal("done"),
  phase: ProjectPhaseSchema,
}).strict();

const ErrorEventSchema = z.object({
  type: z.literal("error"),
  phase: ProjectPhaseSchema,
  message: z.string(),
  recoverable: z.boolean().default(true),
}).strict();

const HeartbeatEventSchema = z.object({
  type: z.literal("heartbeat"),
  at: z.string(),
}).strict();

export const ProjectStreamEventSchema = z.discriminatedUnion("type", [
  SnapshotEventSchema,
  ProgressEventSchema,
  SearchResultsEventSchema,
  SearchFailedEventSchema,
  ItemStatusEventSchema,
  ItemResearchedEventSchema,
  MonitorEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
  HeartbeatEventSchema,
]);

export const ProjectStreamEnvelopeSchema = z.object({
  id: z.number().int().positive(),
  event: ProjectStreamEventSchema,
}).strict();

export type ProjectStreamEvent = z.infer<typeof ProjectStreamEventSchema>;
export type ProjectStreamEnvelope = z.infer<typeof ProjectStreamEnvelopeSchema>;
