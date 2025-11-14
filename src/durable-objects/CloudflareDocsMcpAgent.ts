/**
 * Cloudflare Docs MCP Agent
 * 
 * A Durable Object that extends McpAgent to provide Cloudflare documentation query tools
 * to our agents. This uses the Agents SDK MCP pattern.
 * 
 * This is for INBOUND MCP - giving our agents access to Cloudflare docs tools.
 * 
 * Note: This is separate from the MCP server (src/endpoints/mcp/) which exposes
 * our chatroom capabilities to external agents.
 * 
 * Location: This file is in src/durable-objects/ because it's agent infrastructure,
 * not general application infrastructure. It provides MCP tools specifically
 * for our agents to use.
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "../types";
import { queryCloudflareDocs, searchDocsTopic } from "../utils/cloudflareDocs";

interface State {
  queryCount: number;
  lastQuery?: string;
  lastQueryTime?: string;
}

export class CloudflareDocsMcpAgent extends McpAgent<Env, State, {}> {
  server = new McpServer({
    name: "Cloudflare Docs MCP Agent",
    version: "1.0.0",
  });

  initialState: State = {
    queryCount: 0,
  };

  // Store env reference for tool handlers
  private _env: Env | undefined;

  // Override constructor to store env
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this._env = env;
  }

  async init() {
    // Register the mcp-cloudflare-docs tool
    this.server.tool(
      "mcp-cloudflare-docs",
      "Query Cloudflare documentation using AI. Search and get answers from Cloudflare's official documentation.",
      {
        query: z.string().describe("The question or topic to search for in Cloudflare documentation"),
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
          .default("general")
          .describe("The Cloudflare service area to focus on"),
        maxResults: z.number().int().min(1).max(10).optional().default(5).describe("Maximum number of documentation sources to return"),
      },
      async ({ query, topic, maxResults }) => {
        // Update state - these come from Agent base class
        this.setState({
          ...this.state,
          queryCount: this.state.queryCount + 1,
          lastQuery: query,
          lastQueryTime: new Date().toISOString(),
        });

        try {
          if (!this._env) {
            throw new Error("Environment not initialized");
          }
          const result = await queryCloudflareDocs(this._env, {
            query,
            topic: topic || "general",
            maxResults: maxResults || 5,
          });

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
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Unknown error",
                  query,
                }),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Register the mcp-cloudflare-docs-search tool
    this.server.tool(
      "mcp-cloudflare-docs-search",
      "Search Cloudflare documentation for a specific service topic",
      {
        topic: z.string().describe("The Cloudflare service topic (e.g., 'workers', 'durable-objects', 'agents')"),
        question: z.string().describe("The question to ask about this topic"),
      },
      async ({ topic, question }) => {
        // Update state - these come from Agent base class
        this.setState({
          ...this.state,
          queryCount: this.state.queryCount + 1,
          lastQuery: question,
          lastQueryTime: new Date().toISOString(),
        });

        try {
          if (!this._env) {
            throw new Error("Environment not initialized");
          }
          const result = await searchDocsTopic(this._env, topic, question);

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
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Unknown error",
                  topic,
                  question,
                }),
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  onStateUpdate(state: State) {
    console.log("Cloudflare Docs MCP Agent state updated:", {
      queryCount: state.queryCount,
      lastQuery: state.lastQuery,
      lastQueryTime: state.lastQueryTime,
    });
  }
}

