/**
 * MCP Server Handler
 * Exposes the chatroom API as MCP tools that external agents can use
 * 
 * This is for OUTBOUND MCP - making our worker's capabilities available
 * to external MCP clients (like ChatGPT, Claude, etc.)
 */

import { z } from "zod";
import type { Env } from "../../types";
import { rpcRegistry } from "../rpc/handler";

// --- Schemas ---

/**
 * Zod schema for validating the payload of a `POST /mcp/execute` request.
 */
const executeSchema = z.object({
  tool: z.string(),
  params: z.unknown().optional(),
});

// --- Utility Functions ---

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// --- MCP Server Handler ---

/**
 * Handles incoming HTTP requests for the Multi-Agent Control Plane (MCP) Server.
 * 
 * This exposes our chatroom API capabilities as MCP tools that external agents can discover and use.
 * 
 * Routes:
 * - GET /mcp/tools: Lists all available tools
 * - POST /mcp/execute: Executes a specific tool
 */
export const handleMcpServer = async (
  request: Request,
  env: Env,
  executionCtx: ExecutionContext,
): Promise<Response> => {
  const url = new URL(request.url);

  /**
   * GET /mcp/tools
   * Lists all available tools for external MCP clients
   */
  if (request.method === "GET" && url.pathname === "/mcp/tools") {
    const tools = Object.values(rpcRegistry).map((method) => ({
      name: method.method,
      summary: method.summary,
      description: method.description,
      tags: method.tags,
      inputSchema: method.paramsSchema._def, // Zod schema definition
    }));
    return json({ tools });
  }

  /**
   * POST /mcp/execute
   * Executes a tool requested by an external MCP client
   */
  if (request.method === "POST" && url.pathname === "/mcp/execute") {
    try {
      const payload = executeSchema.parse(await request.json());

      // Find the tool in the RPC registry
      const method = rpcRegistry[payload.tool];
      if (!method) {
        return json(
          { error: { code: "TOOL_NOT_FOUND", message: `Unknown tool: ${payload.tool}` } },
          404,
        );
      }

      // Validate params
      const params = method.paramsSchema.parse(payload.params ?? {});

      // Execute the tool
      const result = await method.handler(
        { env, request, executionCtx },
        params,
      );

      // Validate and return result
      return json({ result: method.resultSchema.parse(result) });
    } catch (error) {
      return json(
        {
          error: {
            code: "TOOL_EXECUTION_FAILED",
            message: error instanceof Error ? error.message : "Unknown error",
            details: error instanceof Error ? error.stack : String(error),
          },
        },
        400,
      );
    }
  }

  return new Response("Not found", { status: 404 });
};

