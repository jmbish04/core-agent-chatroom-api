/**
 * @file This module implements the JSON-RPC 2.0 handling layer.
 *
 * @description
 * This file defines the central `rpcRegistry`, which maps method names
 * (e.g., "tasks.list") to their corresponding implementations. Each method
 * definition includes Zod schemas for parameter and result validation,
 * as well as metadata for documentation.
 *
 * The main export, `handleRpc`, is a Cloudflare Worker request handler
 * that:
 * 1.  Parses an incoming JSON-RPC request.
 * 2.  Looks up the method in the `rpcRegistry`.
 * 3.  Validates the `params` against the method's `paramsSchema`.
 * 4.  Executes the method's `handler` function.
 * 5.  Validates the `result` against the method's `resultSchema`.
 * 6.  Returns a standardized JSON-RPC success or error response.
 *
 * This provides a single, type-safe, and auto-validating entry point
 * for all RPC-style communication, distinct from the MCP and REST APIs.
 *
 * @module rpc
 */

import { z } from "zod";

import type { Env, RpcMethod, RpcRegistry } from "../../types";
import {
  // Schemas
  analyzeRequestSchema,
  analyzeResponseSchema,
  bulkReassignRequestSchema,
  bulkReassignResponseSchema,
  bulkStatusUpdateRequestSchema,
  bulkStatusUpdateResponseSchema,
  docsQueryRequestSchema,
  docsQueryResponseSchema,
  listTasksResponseSchema,
  rpcRequestSchema,
  rpcResponseSchema,
  runTestsResponseSchema,
  singleStatusUpdateRequestSchema,
  taskSchema,
  registry,
  sessionResultsResponseSchema,
} from "../../schemas/apiSchemas";
import {
  // Task utilities
  queryOpenTasks,
  queryTasks,
  reassignTasks,
  updateSingleTaskStatus,
  updateTasksStatus,
} from "../../utils/tasks";
import { runAllTests } from "../../tests/runner";
import { getLatestSession } from "../../utils/db";
import {
  queryCloudflareDocs,
  searchDocsTopic,
} from "../../utils/cloudflareDocs";

// --- Local Schemas ---

/**
 * @private
 * @description Zod schema for filtering tasks. Used by `tasks.list`.
 */
const statusFilterSchema = z.object({
  agent: z.string().optional(),
  status: z.enum(["backlog", "todo", "in_progress", "review", "blocked", "done", "cancelled", "on_hold"]).optional(),
  search: z.string().optional(),
});

/**
 * @private
 * @description Zod schema for updating a single task. Used by `tasks.updateSingle`.
 */
const singleStatusUpdateWithIdSchema = singleStatusUpdateRequestSchema.extend({
  taskId: z.string().uuid(),
});

// --- OpenAPI Registration ---

/**
 * @description
 * Registers the generic `/rpc` endpoint with the OpenAPI registry.
 * This allows API consumers to know that the RPC endpoint exists.
 * The individual methods are exposed via the `mcp/tools` endpoint
 * or a separate specification generated from `rpcRegistry`.
 */
registry.registerPath({
  method: "post",
  path: "/rpc",
  summary: "Invoke RPC method",
  operationId: "invokeRpc",
  tags: ["rpc"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: rpcRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "RPC result",
      content: {
        "application/json": {
          schema: rpcResponseSchema,
        },
      },
    },
  },
});

// --- RPC Response Helpers ---

/**
 * Creates a standardized JSON-RPC success response.
 * @param {unknown} result - The payload of the successful result.
 * @returns {Response} A 200 OK JSON response.
 * @private
 */
const success = (result: unknown): Response =>
  new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/**
 * Creates a standardized JSON-RPC error response.
 * @param {string} message - The human-readable error message.
 * @param {string} [code="RPC_ERROR"] - An internal error code.
 * @param {unknown} [details] - Optional details (e.g., validation errors).
 * @param {number} [status=400] - The HTTP status code.
 * @returns {Response} A JSON error response.
 * @private
 */
const errorResponse = (
  message: string,
  code = "RPC_ERROR",
  details?: unknown,
  status = 400,
) =>
  new Response(
    JSON.stringify({
      success: false,
      error: {
        code,
        message,
        details,
      },
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );

// --- RPC Method Definition Helper ---

/**
 * A type-safe helper function for creating an `RpcMethod` definition.
 * This provides type inference and ensures the handler, params, and result
 * schemas are correctly aligned.
 * @template ParamsSchema - Zod schema for input parameters.
 * @template ResultSchema - Zod schema for the output/result.
 * @param {Omit<RpcMethod<ParamsSchema, ResultSchema>, "method"> & { method: string }} method
 * - The method definition.
 * @returns {RpcMethod<ParamsSchema, ResultSchema>} The fully typed RpcMethod.
 * @private
 */
const createMethod = <
  ParamsSchema extends z.ZodTypeAny,
  ResultSchema extends z.ZodTypeAny,
>(
  method: Omit<RpcMethod<ParamsSchema, ResultSchema>, "method"> & {
    method: string;
  },
): RpcMethod<ParamsSchema, ResultSchema> =>
  method as RpcMethod<ParamsSchema, ResultSchema>;

// --- RPC Method Registry ---

/**
 * @description
 * The central registry of all available JSON-RPC methods.
 *
 * Each key is the method name (e.g., "tasks.list") that clients will use.
 * Each value is an `RpcMethod` object created with `createMethod`,
 * which includes:
 * - `summary`/`description`: For documentation (used by MCP tools).
 * - `paramsSchema`: A Zod schema for *validating* incoming parameters.
 * - `resultSchema`: A Zod schema for *validating* outgoing results.
 * - `handler`: The async function that performs the business logic.
 */
export const rpcRegistry: RpcRegistry = {
  // --- Task Methods ---
  "tasks.list": createMethod({
    method: "tasks.list",
    summary: "List tasks with optional filters",
    paramsSchema: statusFilterSchema,
    resultSchema: listTasksResponseSchema,
    tags: ["tasks"],
    async handler({ env }, params) {
      const tasks = await queryTasks(env, params);
      return listTasksResponseSchema.parse({ tasks });
    },
  }),
  "tasks.open": createMethod({
    method: "tasks.open",
    summary: "List open tasks",
    paramsSchema: z.object({}).optional().default({}),
    resultSchema: listTasksResponseSchema,
    tags: ["tasks"],
    async handler({ env }) {
      const tasks = await queryOpenTasks(env);
      return listTasksResponseSchema.parse({ tasks });
    },
  }),
  "tasks.reassign": createMethod({
    method: "tasks.reassign",
    summary: "Bulk reassign tasks to another agent",
    paramsSchema: bulkReassignRequestSchema,
    resultSchema: bulkReassignResponseSchema,
    tags: ["tasks"],
    async handler({ env }, params) {
      return reassignTasks(env, params.taskIds, params.agent);
    },
  }),
  "tasks.updateStatus": createMethod({
    method: "tasks.updateStatus",
    summary: "Bulk update task statuses",
    paramsSchema: bulkStatusUpdateRequestSchema,
    resultSchema: bulkStatusUpdateResponseSchema,
    tags: ["tasks"],
    async handler({ env }, params) {
      return updateTasksStatus(env, params.updates);
    },
  }),
  "tasks.updateSingle": createMethod({
    method: "tasks.updateSingle",
    summary: "Update a single task status",
    paramsSchema: singleStatusUpdateWithIdSchema,
    resultSchema: taskSchema,
    tags: ["tasks"],
    async handler({ env }, params) {
      const result = await updateSingleTaskStatus(
        env,
        params.taskId,
        params.status,
      );
      if (!result) {
        throw new Error("Task not found");
      }
      return taskSchema.parse(result);
    },
  }),

  // --- Test Methods ---
  "tests.run": createMethod({
    method: "tests.run",
    summary: "Trigger test run",
    paramsSchema: z
      .object({
        concurrency: z.number().int().min(1).max(5).optional(),
        reason: z.string().optional(),
      })
      .optional()
      .default({}),
    resultSchema: runTestsResponseSchema,
    tags: ["tests"],
    async handler({ env }, params) {
      return runAllTests(env, {
        concurrency: params.concurrency,
        reason: params.reason,
      });
    },
  }),
  "tests.latest": createMethod({
    method: "tests.latest",
    summary: "Fetch latest test session summary",
    paramsSchema: z.object({}).optional().default({}),
    resultSchema: sessionResultsResponseSchema,
    tags: ["tests"],
    async handler({ env }) {
      const session = await getLatestSession(env);
      if (!session) {
        throw new Error("No sessions recorded yet");
      }
      return sessionResultsResponseSchema.parse({ session });
    },
  }),

  // --- Analysis Methods ---
  "analysis.run": createMethod({
    method: "analysis.run",
    summary: "Perform lightweight analysis",
    paramsSchema: analyzeRequestSchema,
    resultSchema: analyzeResponseSchema,
    tags: ["analysis"],
    async handler(_, params) {
      // This is a placeholder implementation
      const res = analyzeResponseSchema.parse({
        target: params.target,
        summary: `Analysis for ${params.target} with depth ${params.depth}`,
        recommendations: [
          {
            title: "Tighten CI",
            description:
              "Schedule health runner to act on regressions promptly.",
            impact: "high" as const,
          },
        ],
        diagnostics: params.includeAi ? { ai: true } : {},
      });
      return res;
    },
  }),

  // --- AI / Docs Methods ---
  "docs.query": createMethod({
    method: "docs.query",
    summary: "Query Cloudflare documentation using AI",
    description:
      "Search and get answers from Cloudflare's official documentation using Workers AI",
    paramsSchema: docsQueryRequestSchema,
    resultSchema: docsQueryResponseSchema,
    tags: ["docs", "ai"],
    async handler({ env }, params) {
      return await queryCloudflareDocs(env, {
        query: params.query,
        topic: params.topic,
        maxResults: params.maxResults,
      });
    },
  }),
  "docs.search": createMethod({
    method: "docs.search",
    summary: "Search Cloudflare docs by topic",
    description:
      "Search documentation for a specific Cloudflare service (workers, durable-objects, d1, r2, ai, agents)",
    paramsSchema: z.object({
      topic: z
        .string()
        .min(1)
        .describe(
          "The Cloudflare service topic (e.g., 'workers', 'durable-objects', 'agents')",
        ),
      question: z
        .string()
        .min(1)
        .describe("The question to ask about this topic"),
    }),
    resultSchema: docsQueryResponseSchema,
    tags: ["docs", "ai"],
    async handler({ env }, params) {
      return await searchDocsTopic(env, params.topic, params.question);
    },
  }),
};

// --- RPC Handler ---

/**
 * Handles an incoming JSON-RPC request.
 * This function is the primary HTTP handler for the `/rpc` endpoint.
 *
 * It performs the following steps:
 * 1.  Parses the request body against the base `rpcRequestSchema`.
 * 2.  Looks up the `method` in the `rpcRegistry`.
 * 3.  If not found, returns a 404 "METHOD_NOT_FOUND" error.
 * 4.  Validates the `parsed.params` against the specific `method.paramsSchema`.
 * 5.  If invalid, returns a 422 "INVALID_PARAMS" error with Zod details.
 * 6.  Executes the `method.handler` with the validated params.
 * 7.  If the handler throws, returns a 500 "HANDLER_ERROR".
 * 8.  Validates the handler's return value against the `method.resultSchema`.
 * 9.  Returns a 200 success response with the validated result.
 * 10. If the initial request parsing fails, returns a 400 "BAD_REQUEST".
 *
 * @param {Request} request - The incoming Cloudflare request object.
 * @param {Env} env - The environment bindings.
 * @param {ExecutionContext} executionCtx - The execution context.
 * @returns {Promise<Response>} A standardized JSON-RPC success or error response.
 */
export const handleRpc = async (
  request: Request,
  env: Env,
  executionCtx: ExecutionContext,
) => {
  try {
    // 1. Parse the basic RPC structure
    const parsed = rpcRequestSchema.parse(await request.json());

    // 2. Look up the method in the registry
    const method = rpcRegistry[parsed.method];
    if (!method) {
      // 3. Handle "Method Not Found"
      return errorResponse(
        `Unknown method: ${parsed.method}`,
        "METHOD_NOT_FOUND",
        undefined,
        404,
      );
    }

    let params: unknown = parsed.params ?? {};
    try {
      // 4. Validate the *specific* parameters for the found method
      params = method.paramsSchema.parse(params);
    } catch (validationError) {
      // 5. Handle "Invalid Parameters"
      return errorResponse(
        "Invalid parameters",
        "INVALID_PARAMS",
        validationError,
        422,
      );
    }

    try {
      // 6. Execute the method's handler
      const result = await method.handler({ env, request, executionCtx }, params);
      // 8. Validate the handler's output and 9. Return success
      return success(method.resultSchema.parse(result));
    } catch (handlerError) {
      // 7. Handle "Handler Error"
      return errorResponse(
        handlerError instanceof Error ? handlerError.message : "Handler failed",
        "HANDLER_ERROR",
        handlerError,
        500,
      );
    }
  } catch (error) {
    // 10. Handle "Bad Request" (initial parsing failed)
    return errorResponse("Invalid RPC payload", "BAD_REQUEST", error, 400);
  }
};