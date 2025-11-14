/**
 * Cloudflare Docs MCP Tools for Agents
 * 
 * This provides MCP tools that OUR agents can use to query Cloudflare documentation.
 * This is for INBOUND MCP - giving our worker agents access to external tools.
 * 
 * This is separate from the MCP server (src/endpoints/mcp/) which exposes OUR tools
 * to external agents.
 */

import { z } from "zod";
import type { Env } from "../../../types";
import { queryCloudflareDocs, searchDocsTopic } from "../../../utils/cloudflareDocs";

/**
 * MCP tool definitions for Cloudflare documentation queries
 * These tools can be used by our agents via MCP client
 */
export const cloudflareDocsTools = {
  /**
   * Query Cloudflare documentation using AI
   */
  "mcp-cloudflare-docs": {
    name: "mcp-cloudflare-docs",
    description: "Query Cloudflare documentation using AI. Search and get answers from Cloudflare's official documentation.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The question or topic to search for in Cloudflare documentation",
        },
        topic: {
          type: "string",
          enum: [
            "workers",
            "durable-objects",
            "d1",
            "r2",
            "ai",
            "agents",
            "general",
            "cloudflare agents sdk",
            "cloudflare actors",
          ],
          description: "The Cloudflare service area to focus on",
          default: "general",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of documentation sources to return",
          minimum: 1,
          maximum: 10,
          default: 5,
        },
      },
      required: ["query"],
    },
    handler: async (env: Env, params: unknown) => {
      const schema = z.object({
        query: z.string().min(1),
        topic: z
          .enum([
            "workers",
            "durable-objects",
            "d1",
            "r2",
            "ai",
            "agents",
            "general",
            "cloudflare agents sdk",
            "cloudflare actors",
          ])
          .optional()
          .default("general"),
        maxResults: z.number().int().min(1).max(10).optional().default(5),
      });

      const validated = schema.parse(params);
      const result = await queryCloudflareDocs(env, validated);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                answer: result.answer,
                sources: result.sources,
                confidence: result.confidence,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  /**
   * Search Cloudflare documentation for a specific service topic
   */
  "mcp-cloudflare-docs-search": {
    name: "mcp-cloudflare-docs-search",
    description: "Search Cloudflare documentation for a specific service topic",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The Cloudflare service topic (e.g., 'workers', 'durable-objects', 'agents')",
        },
        question: {
          type: "string",
          description: "The question to ask about this topic",
        },
      },
      required: ["topic", "question"],
    },
    handler: async (env: Env, params: unknown) => {
      const schema = z.object({
        topic: z.string().min(1),
        question: z.string().min(1),
      });

      const validated = schema.parse(params);
      const result = await searchDocsTopic(env, validated.topic, validated.question);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                answer: result.answer,
                sources: result.sources,
                confidence: result.confidence,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },
};

/**
 * Get all Cloudflare docs MCP tools
 */
export function getCloudflareDocsTools() {
  return Object.values(cloudflareDocsTools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/**
 * Execute a Cloudflare docs MCP tool
 */
export async function executeCloudflareDocsTool(
  env: Env,
  toolName: string,
  params: unknown,
): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const tool = cloudflareDocsTools[toolName as keyof typeof cloudflareDocsTools];
  if (!tool) {
    throw new Error(`Unknown Cloudflare docs tool: ${toolName}`);
  }

  try {
    return await tool.handler(env, params);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
            tool: toolName,
          }),
        },
      ],
      isError: true,
    };
  }
}

