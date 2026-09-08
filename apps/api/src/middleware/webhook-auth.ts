import { createHash, timingSafeEqual } from "node:crypto";

import { ApiProblem } from "./errors";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function requireWebhookSecret(received: string, expected: string): void {
  if (!expected || !timingSafeEqual(digest(received), digest(expected))) {
    throw new ApiProblem(401, "invalid_webhook_secret", "The webhook signature is invalid.");
  }
}
