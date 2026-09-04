import { z } from "zod";

import { ProjectSchema } from "./project";

const SnapshotEventSchema = z.object({
  type: z.literal("snapshot"),
  project: ProjectSchema,
}).strict();

const ProgressEventSchema = z.object({
  type: z.literal("progress"),
  phase: z.string(),
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
  status: z.string(),
  color: z.string().optional(),
}).strict();

const ItemResearchedEventSchema = z.object({
  type: z.literal("item_researched"),
  item_id: z.string(),
  item_name: z.string(),
  status: z.string(),
  color: z.string(),
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
  phase: z.string(),
}).strict();

const ErrorEventSchema = z.object({
  type: z.literal("error"),
  phase: z.string(),
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
