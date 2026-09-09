import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import type { ApiDependencies, ClearCutEnv } from "../context";

const ChatSchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  session_id: z.string().max(200).optional(),
}).strict();

export function registerChatRoutes(app: Hono<ClearCutEnv>, dependencies: ApiDependencies) {
  app.post("/api/projects/:projectId/chat", async (context) => {
    const input = ChatSchema.parse(await context.req.json());
    const project = await dependencies.repository.require(context.req.param("projectId"));
    const response = await dependencies.gemini.answerCopilot({ project: structuredClone(project), question: input.question });
    return context.json({
      answer: response.answer,
      citations: response.citations,
      session_id: input.session_id ?? `chat-${project.id}`,
    });
  });

  /**
   * Streaming copilot. Deltas arrive as they are generated; citations follow on
   * `done` because they come from the stored record, not the model.
   */
  app.post("/api/projects/:projectId/chat/stream", async (context) => {
    const input = ChatSchema.parse(await context.req.json());
    const project = await dependencies.repository.require(context.req.param("projectId"));
    const citations = [...new Set(
      project.items.flatMap((item) => (item.sources ?? []).map((source) => source.url)),
    )].slice(0, 8);

    return streamSSE(context, async (stream) => {
      try {
        for await (const delta of dependencies.gemini.streamCopilot({
          project: structuredClone(project),
          question: input.question,
        })) {
          await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: delta }) });
        }
        await stream.writeSSE({ event: "done", data: JSON.stringify({ citations }) });
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: error instanceof Error ? error.message : "The copilot could not answer." }),
        });
      }
    });
  });
}
