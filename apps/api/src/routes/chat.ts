import type { Hono } from "hono";
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
}
