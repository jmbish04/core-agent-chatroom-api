import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import YAML from "yaml";

import { registry } from "../schemas/apiSchemas";
import type { Env, OpenAPIGenerationResult } from "../types";

export interface OpenApiOptions {
  request: Request;
  env: Env;
}

export const generateOpenApiDocument = ({ request }: OpenApiOptions): OpenAPIGenerationResult => {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  const generator = new OpenApiGeneratorV31(registry.definitions);
  const document = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Vibe Systems Control Plane",
      version: "1.0.0",
      description:
        "Operational API surface for orchestrating health checks, collaborative rooms, and AI-assisted remediation.",
    },
    servers: [
      {
        url: origin,
        description: "Primary edge endpoint",
      },
    ],
    tags: [
      { name: "health", description: "System health and testing" },
      { name: "operations", description: "Operational task APIs" },
      { name: "tasks", description: "Task orchestration and lifecycle" },
      { name: "agents", description: "Agent presence and coordination" },
      { name: "analysis", description: "AI analysis utilities" },
      { name: "realtime", description: "WebSocket streaming endpoints" },
    ],
  });

  const yaml = YAML.stringify(document);
  return { json: document, yaml };
};
