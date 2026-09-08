import { Container, ContainerProxy } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

import { handleBindingRequest, type BindingEnv } from "./bindings";

type ContainerRuntimeEnv = {
  BINDING_NONCE: string;
  GOOGLE_API_KEY: string;
  PARALLEL_API_KEY: string;
  PARALLEL_WEBHOOK_SECRET: string;
  PUBLIC_BASE_URL: string;
  MOCK_RESEARCH?: string;
};

const runtimeEnv = env as unknown as ContainerRuntimeEnv;

export { ContainerProxy };

export class ClearCutApiContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "20m";
  entrypoint = ["bun", "run", "src/server.ts"];
  interceptHttps = true;
  allowedHosts = ["bindings.internal", "api.parallel.ai", "generativelanguage.googleapis.com"];
  envVars = {
    HOST: "0.0.0.0",
    PORT: "8080",
    ASSET_STORAGE_DIR: "/tmp/clearcut-assets",
    CLOUDFLARE_BINDING_ORIGIN: "http://bindings.internal",
    CLOUDFLARE_BINDING_NONCE: runtimeEnv.BINDING_NONCE,
    GOOGLE_API_KEY: runtimeEnv.GOOGLE_API_KEY,
    PARALLEL_API_KEY: runtimeEnv.PARALLEL_API_KEY,
    PARALLEL_WEBHOOK_SECRET: runtimeEnv.PARALLEL_WEBHOOK_SECRET,
    PUBLIC_BASE_URL: runtimeEnv.PUBLIC_BASE_URL,
    MOCK_RESEARCH: runtimeEnv.MOCK_RESEARCH ?? "false",
  };
}

ClearCutApiContainer.outboundByHost = {
  "bindings.internal": (request, bindingEnv) => handleBindingRequest(request, bindingEnv as BindingEnv),
};
