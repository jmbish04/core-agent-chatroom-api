/**
 * @file This module creates and configures the Hono API router for the worker.
 *
 * @description
 * This file is responsible for:
 * 1.  Initializing the Hono application.
 * 2.  Registering all API routes, schemas, and OpenAPI path definitions using `zod-openapi`.
 * 3.  Defining and applying middleware for CORS, security headers, and request ID injection.
 * 4.  Implementing the handler logic for each API endpoint (e.g., /api/health, /api/tasks, /api/tests).
 * 5.  Connecting handler logic to database and task utility functions (e.g., `getLatestSession`, `createTask`).
 *
 * @module router
 * @see {@link ../../schemas/apiSchemas.ts} for Zod schemas and the OpenAPI registry.
 * @see {@link ../../utils/tasks.ts} for task management logic.
 * @see {@link ../../utils/db.ts} for database interaction logic.
 */

// --- Imports ---

import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Env } from "../../types";

// --- Schemas ---
import {
  analyzeRequestSchema,
  analyzeResponseSchema,
  bulkReassignRequestSchema,
  bulkReassignResponseSchema,
  bulkStatusUpdateRequestSchema,
  bulkStatusUpdateResponseSchema,
  createTaskRequestSchema,
  healthSnapshotSchema,
  listTasksResponseSchema,
  registry,
  runTestsRequestSchema,
  runTestsResponseSchema,
  sessionResultsResponseSchema,
  singleStatusUpdateRequestSchema,
  taskSchema,
  taskLookupByAgentResponseSchema,
  taskSearchResponseSchema,
  testDefinitionsResponseSchema,
  upsertTestDefinitionRequestSchema,
  apiErrorSchema,
  taskStatsResponseSchema,
  agentCheckInRequestSchema,
  agentCheckInResponseSchema,
  blockTaskRequestSchema,
  unblockTaskRequestSchema,
  // Projects & Chat schemas
  projectSchema,
  createProjectRequestSchema,
  updateProjectRequestSchema,
  listProjectsResponseSchema,
  chatRoomSchema,
  createChatRoomRequestSchema,
  listChatRoomsResponseSchema,
  chatThreadSchema,
  createChatThreadRequestSchema,
  listChatThreadsResponseSchema,
  chatMessageSchema,
  createChatMessageRequestSchema,
  listChatMessagesResponseSchema,
  taskBlockerResponseSchema,
  unblockTaskResponseSchema,
} from "../../schemas/apiSchemas";
import {
  // DB Utilities
  getLatestSession,
  getSessionSummary,
  listActiveTests,
  getDrizzle,
  epicsTable,
  tasksTable,
  taskBlockersTable,
  agentStatusTable,
  deserializeEpic,
  deserializeTask,
  deserializeTaskBlockage,
  deserializeAgentStatus,
  // Projects & Chat DB functions
  updateProject,
  deleteProject,
  createChatRoom,
  listChatRooms,
  createChatThread,
  listChatThreads,
  createChatMessage,
  listChatMessages,
  upsertTestDefinition,
} from "../../utils/db";
import {
  // Task Utilities
  checkInAgent,
  createTask,
  getTask,
  queryOpenTasks,
  queryTasks,
  queryTasksByAgent,
  reassignTasks,
  searchTasksByQuery,
  unblockTask,
  updateSingleTaskStatus,
  updateTasksStatus,
} from "../../utils/tasks";
import { runAllTests } from "../../tests/runner";
import { runHealthChecks } from "../../utils/health";
import { nowPST, isoToPST } from "../../utils/time";
import {
  createProject,
  listProjects,
  getProject,
  getProjectEpics,
  reassignProjectTasks,
  getProjectThreads,
  createProjectThread,
  getProjectThreadMessages,
  createThreadMessage,
  listAgents,
} from "../../utils/projects";
import { getTaskCounts, listAgentActivity, listBlockedTasks } from "../../utils/db";

// Remove duplicate imports that conflict with existing ones
// These are handled by the existing endpoint implementations
import {
  searchMessages,
  getThreads,
  getThread,
  createThread,
  getThreadMessages,
  getRecentMessages,
} from "../../utils/messageLogging";

// --- Constants ---

/**
 * @description
 * Original list of allowed origins.
 *
 * @warning
 * This list is **no longer used** by the `applyCors` middleware below,
 * which has been modified to allow all origins (`*`) as requested by the user.
 */
// const allowedOrigins = ["*"];

/** Timestamp of when the worker was initialized. Used for uptime calculation. */
const startedAt = Date.now();

// --- Zod Schemas for Request Validation ---

/** Zod schema for validating query parameters on `GET /api/tasks`. */
const taskQuerySchema = z.object({
  agent: z.string().optional(),
  status: z.enum(["backlog", "todo", "in_progress", "review", "blocked", "done", "cancelled", "on_hold"]).optional(),
  search: z.string().optional(),
});

/** Zod schema for validating a UUID `id` path parameter. */
const taskIdParamSchema = z.object({ id: z.string().uuid() });
/** Zod schema for validating an `agent` path parameter. */
const agentParamSchema = z.object({ agent: z.string() });
/** Zod schema for validating a UUID `id` path parameter for sessions. */
const sessionParamSchema = z.object({ id: z.string().uuid() });
/** Zod schema for validating a `q` (query) search parameter. */
const taskSearchQuerySchema = z.object({ q: z.string().min(1) });

// --- OpenAPI Schema Registration Helpers ---

/**
 * Creates a standardized "success" response schema envelope for the OpenAPI registry.
 *
 * @param {string} name - The name to register the schema under (e.g., "HealthResponse").
 * @param {T} schema - The Zod schema for the `data` payload.
 * @returns A registered Zod object schema.
 */
const successEnvelope = <T extends z.ZodTypeAny>(name: string, schema: T) =>
  registry.register(
    name,
    z.object({
      success: z.literal(true),
      data: schema,
    }),
  );

/** Registered schema for a standardized error response. */
const errorEnvelope = registry.register("ErrorResponse", apiErrorSchema);

// --- Registered Success Envelopes for OpenAPI ---

const healthSuccessSchema = successEnvelope(
  "HealthResponse",
  healthSnapshotSchema,
);
const testDefsSuccessSchema = successEnvelope(
  "TestDefsResponse",
  testDefinitionsResponseSchema,
);
const runTestsSuccessSchema = successEnvelope(
  "RunTestsResponse",
  runTestsResponseSchema,
);
const sessionSuccessSchema = successEnvelope(
  "SessionResponse",
  sessionResultsResponseSchema,
);
const taskListSuccessSchema = successEnvelope(
  "TaskListResponse",
  listTasksResponseSchema,
);
const taskDetailSuccessSchema = successEnvelope(
  "TaskDetailResponse",
  z.object({ task: taskSchema }),
);
const taskAgentSuccessSchema = successEnvelope(
  "TaskAgentResponse",
  taskLookupByAgentResponseSchema,
);
const taskSearchSuccessSchema = successEnvelope(
  "TaskSearchResponse",
  taskSearchResponseSchema,
);
const taskCreateSuccessSchema = successEnvelope(
  "TaskCreateResponse",
  z.object({ task: taskSchema }),
);

// Message logging schemas
const messageSearchFiltersSchema = z.object({
  projectId: z.string(),
  threadId: z.string().optional(),
  epicId: z.string().optional(),
  taskId: z.string().optional(),
  senderName: z.string().optional(),
  senderType: z.enum(["user", "agent", "system"]).optional(),
  messageType: z.enum(["chat", "broadcast", "alarm", "system", "task_update", "agent_status", "human_review"]).optional(),
  content: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

const messageLogSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  threadId: z.string().nullable(),
  replyToMessageId: z.string().nullable(),
  messageType: z.string(),
  senderType: z.string(),
  senderName: z.string(),
  senderId: z.string().nullable(),
  epicId: z.string().nullable(),
  taskId: z.string().nullable(),
  content: z.string(),
  metadata: z.string().nullable(),
  timestamp: z.string(),
  createdAt: z.string(),
});

const messageSearchResultsSchema = z.object({
  messages: z.array(messageLogSchema),
  total: z.number(),
  hasMore: z.boolean(),
});

const threadSchema = z.object({
  id: z.number(),
  projectId: z.string(),
  threadId: z.string(),
  subject: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const createThreadSchema = z.object({
  subject: z.string().min(1).max(200),
});

const createEpicSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignedAgent: z.string().optional(),
  targetCompletion: z.string().datetime().optional(),
});

const createTaskSchema = z.object({
  projectId: z.string(),
  epicId: z.string().optional(),
  parentTaskId: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignedAgent: z.string().optional(),
  estimatedHours: z.number().positive().optional(),
  requiresHumanReview: z.boolean().default(false),
  humanReviewReason: z.string().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(["pending", "backlog", "todo", "in_progress", "review", "blocked", "done", "cancelled", "on_hold"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assignedAgent: z.string().nullable().optional(),
  estimatedHours: z.number().positive().optional(),
  actualHours: z.number().positive().optional(),
  requiresHumanReview: z.boolean().optional(),
  humanReviewReason: z.string().optional(),
  humanReviewResponse: z.string().optional(),
});

const humanReviewSchema = z.object({
  projectId: z.string(),
  taskId: z.string(),
  response: z.string().min(1),
  approved: z.boolean(),
});

const updateAgentStatusSchema = z.object({
  projectId: z.string(),
  agentName: z.string(),
  status: z.enum([
    "offline",
    "available",
    "busy",
    "in_progress",
    "blocked",
    "awaiting_human",
    "done",
    "error",
  ]),
  currentTaskId: z.string().optional(),
  statusMessage: z.string().optional(),
  requiresAttention: z.boolean().default(false),
  attentionReason: z.string().optional(),
});

const taskReassignSuccessSchema = successEnvelope(
  "TaskReassignResponse",
  bulkReassignResponseSchema,
);
const taskStatusBulkSuccessSchema = successEnvelope(
  "TaskStatusBulkResponse",
  bulkStatusUpdateResponseSchema,
);
const taskStatsSuccessSchema = successEnvelope(
  "TaskStatsResponseEnvelope",
  taskStatsResponseSchema,
);
const agentCheckInSuccessSchema = successEnvelope(
  "AgentCheckInResponseEnvelope",
  agentCheckInResponseSchema,
);
const taskBlockerSuccessSchema = successEnvelope(
  "TaskBlockerResponseEnvelope",
  taskBlockerResponseSchema,
);
const unblockTaskSuccessSchema = successEnvelope(
  "UnblockTaskResponseEnvelope",
  unblockTaskResponseSchema,
);
const analyzeSuccessSchema = successEnvelope(
  "AnalyzeResponse",
  analyzeResponseSchema,
);

// --- OpenAPI Path Definitions ---

registry.registerPath({
  method: "get",
  path: "/api/health",
  summary: "Get health snapshot",
  description: "Returns current service health and latest session details.",
  operationId: "getHealth",
  tags: ["health"],
  responses: {
    200: {
      description: "Health snapshot",
      content: {
        "application/json": {
          schema: healthSuccessSchema,
          examples: {
            healthy: {
              value: {
                success: true,
                data: {
                  status: "healthy",
                  uptimeSeconds: 86400,
                  lastSession: {
                    sessionUuid: "550e8400-e29b-41d4-a716-446655440000",
                    startedAt: "2025-03-07T12:00:00.000Z",
                    total: 3,
                    passed: 3,
                    failed: 0,
                    durationMs: 1250,
                    results: [],
                  },
                },
              },
            },
            degraded: {
              value: {
                success: true,
                data: {
                  status: "degraded",
                  uptimeSeconds: 86400,
                  lastSession: {
                    sessionUuid: "550e8400-e29b-41d4-a716-446655440000",
                    startedAt: "2025-03-07T12:00:00.000Z",
                    total: 3,
                    passed: 2,
                    failed: 1,
                    durationMs: 1250,
                    results: [],
                  },
                },
              },
            },
          },
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: errorEnvelope,
          examples: {
            serverError: {
              value: {
                success: false,
                error: {
                  code: "INTERNAL_ERROR",
                  message: "Failed to retrieve health snapshot",
                },
              },
            },
          },
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tests/defs",
  summary: "List active test definitions",
  description: "Returns the catalog of active automated health tests.",
  operationId: "getTestDefinitions",
  tags: ["tests"],
  responses: {
    200: {
      description: "Active test definitions",
      content: {
        "application/json": {
          schema: testDefsSuccessSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tests/run",
  summary: "Trigger a full health test run",
  description:
    "Starts a new test session, running all active tests in parallel with configurable concurrency.",
  operationId: "runTests",
  tags: ["tests"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: runTestsRequestSchema,
          examples: {
            default: {
              value: {
                reason: "Manual health check",
                concurrency: 3,
              },
            },
            quick: {
              value: {
                reason: "Quick validation",
                concurrency: 5,
              },
            },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: "Test session started",
      content: {
        "application/json": {
          schema: runTestsSuccessSchema,
          examples: {
            default: {
              value: {
                success: true,
                data: {
                  sessionUuid: "550e8400-e29b-41d4-a716-446655440000",
                  startedAt: "2025-03-07T12:00:00.000Z",
                },
              },
            },
          },
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tests/session/{id}",
  summary: "Fetch test session details",
  operationId: "getTestSession",
  tags: ["tests"],
  request: {
    params: sessionParamSchema,
  },
  responses: {
    200: {
      description: "Session details",
      content: {
        "application/json": {
          schema: sessionSuccessSchema,
        },
      },
    },
    404: {
      description: "Session not found",
      content: {
        "application/json": {
          schema: errorEnvelope,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tests/latest",
  summary: "Fetch latest test session",
  operationId: "getLatestTestSession",
  tags: ["tests"],
  responses: {
    200: {
      description: "Latest session",
      content: {
        "application/json": {
          schema: sessionSuccessSchema,
        },
      },
    },
    404: {
      description: "No sessions",
      content: {
        "application/json": {
          schema: errorEnvelope,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks",
  summary: "List tasks",
  operationId: "listTasks",
  tags: ["tasks"],
  request: {
    query: taskQuerySchema,
  },
  responses: {
    200: {
      description: "Filtered tasks",
      content: {
        "application/json": {
          schema: taskListSuccessSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/open",
  summary: "List open tasks",
  operationId: "listOpenTasks",
  tags: ["tasks"],
  responses: {
    200: {
      description: "Open tasks",
      content: {
        "application/json": {
          schema: taskListSuccessSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/{id}",
  summary: "Get task by id",
  operationId: "getTask",
  tags: ["tasks"],
  request: {
    params: taskIdParamSchema,
  },
  responses: {
    200: {
      description: "Task detail",
      content: {
        "application/json": {
          schema: taskDetailSuccessSchema,
        },
      },
    },
    404: {
      description: "Task missing",
      content: {
        "application/json": {
          schema: errorEnvelope,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/agent/{agent}",
  summary: "List tasks for agent",
  operationId: "getTasksByAgent",
  tags: ["tasks"],
  request: {
    params: agentParamSchema,
  },
  responses: {
    200: {
      description: "Agent tasks",
      content: {
        "application/json": {
          schema: taskAgentSuccessSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/search",
  summary: "Search tasks",
  operationId: "searchTasks",
  tags: ["tasks"],
  request: {
    query: taskSearchQuerySchema,
  },
  responses: {
    200: {
      description: "Search results",
      content: {
        "application/json": {
          schema: taskSearchSuccessSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks",
  summary: "Create task",
  operationId: "createTask",
  tags: ["tasks"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createTaskRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Task created",
      content: {
        "application/json": {
          schema: taskCreateSuccessSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/reassign",
  summary: "Bulk reassign tasks",
  operationId: "reassignTasks",
  tags: ["tasks"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: bulkReassignRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Reassignment result",
      content: {
        "application/json": {
          schema: taskReassignSuccessSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/status",
  summary: "Bulk update task status",
  operationId: "bulkUpdateTaskStatus",
  tags: ["tasks"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: bulkStatusUpdateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Status update result",
      content: {
        "application/json": {
          schema: taskStatusBulkSuccessSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/{id}/status",
  summary: "Update single task status",
  operationId: "updateTaskStatus",
  tags: ["tasks"],
  request: {
    params: taskIdParamSchema,
    body: {
      content: {
        "application/json": {
          schema: singleStatusUpdateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Task status updated",
      content: {
        "application/json": {
          schema: taskDetailSuccessSchema,
        },
      },
    },
    404: {
      description: "Task not found",
      content: {
        "application/json": {
          schema: errorEnvelope,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/stats",
  summary: "Retrieve task and agent statistics",
  operationId: "getTaskStats",
  tags: ["tasks"],
  responses: {
    200: {
      description: "Task statistics snapshot",
      content: {
        "application/json": {
          schema: taskStatsSuccessSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents/check-in",
  summary: "Agent status check-in",
  operationId: "agentCheckIn",
  tags: ["tasks", "agents"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: agentCheckInRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Agent activity stored",
      content: {
        "application/json": {
          schema: agentCheckInSuccessSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/{id}/block",
  summary: "Mark a task as blocked",
  operationId: "blockTask",
  tags: ["tasks", "agents"],
  request: {
    params: taskIdParamSchema,
    body: {
      content: {
        "application/json": {
          schema: blockTaskRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Task blocker recorded",
      content: {
        "application/json": {
          schema: taskBlockerSuccessSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/{id}/unblock",
  summary: "Resolve a blocked task",
  operationId: "unblockTask",
  tags: ["tasks", "agents"],
  request: {
    params: taskIdParamSchema,
    body: {
      content: {
        "application/json": {
          schema: unblockTaskRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Task blocker resolved",
      content: {
        "application/json": {
          schema: unblockTaskSuccessSchema,
        },
      },
    },
    404: {
      description: "Blocker not found",
      content: {
        "application/json": {
          schema: errorEnvelope,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/analyze",
  summary: "Analyze target",
  operationId: "analyzeTarget",
  tags: ["analysis"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: analyzeRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Analysis summary",
      content: {
        "application/json": {
          schema: analyzeSuccessSchema,
        },
      },
    },
  },
});

// --- Middleware ---

/**
 * Applies standard security headers to all responses.
 * @param {any} c - Hono context object.
 */
const applySecurityHeaders = (c: any) => {
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self' https://core-agent-chatroom-api.hacolby.workers.dev",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://core-agent-chatroom-api.hacolby.workers.dev",
      "img-src 'self' data:",
    ].join("; "),
  );
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "0");
};

/**
 * Applies CORS (Cross-Origin Resource Sharing) headers.
 * **MODIFIED:** This now allows all origins (`*`) as requested.
 *
 * @param {any} c - Hono context object.
 */
const applyCors = (c: any) => {
  // Original logic validating against `allowedOrigins` is commented out.
  // const origin = c.req.header("Origin");
  // if (origin && allowedOrigins.includes(origin)) {
  //   c.header("Access-Control-Allow-Origin", origin);
  // } else {
  //   c.header("Access-Control-Allow-Origin", allowedOrigins[0]);
  // }

  // New logic to allow any origin.
  c.header("Access-Control-Allow-Origin", "*");

  // **NOTE:** `Access-Control-Allow-Credentials` cannot be used with a
  // wildcard origin (`*`). It is commented out to ensure a valid policy.
  // c.header("Access-Control-Allow-Credentials", "true");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Request-Id",
  );
  c.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
};

// --- Response Helpers ---

/**
 * Creates a standardized JSON success response.
 * @param {any} c - Hono context object.
 * @param {T} data - The payload to include in the `data` field.
 * @param {number} [status=200] - The HTTP status code.
 * @returns {Response} A Hono JSON response.
 */
const jsonSuccess = <T>(c: any, data: T, status = 200) =>
  c.json({ success: true, data }, status);

/**
 * Creates a standardized JSON error response.
 * @param {any} c - Hono context object.
 * @param {string} code - An internal error code (e.g., "TASK_NOT_FOUND").
 * @param {string} message - A human-readable error message.
 * @param {number} [status=400] - The HTTP status code.
 * @param {unknown} [details] - Optional details (e.g., Zod validation errors).
 * @returns {Response} A Hono JSON response.
 */
const jsonError = (
  c: any,
  code: string,
  message: string,
  status = 400,
  details?: unknown,
) =>
  c.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
    },
    status,
  );

// --- Router Creation ---

/**
 * Creates and configures the Hono app instance with all API routes.
 * @returns {Hono} The configured Hono app.
 */
export const createRouter = () => {
  const app = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();

  // --- Global Middleware ---

  /**
   * Global middleware applied to all requests.
   * 1. Injects a unique `requestId` into the context.
   * 2. Applies standard security headers.
   */
  app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    applySecurityHeaders(c);
    await next();
  });

  /**
   * Handles OPTIONS pre-flight requests for all API routes.
   * Applies CORS headers and returns an empty 204 response.
   */
  app.options("/api/*", (c) => {
    applyCors(c);
    return new Response(null, {
      status: 204,
      headers: c.res.headers,
    });
  });

  /**
   * Applies CORS headers to all matching API routes.
   */
  app.use("/api/*", async (c, next) => {
    applyCors(c);
    await next();
  });

  // --- Route Handlers ---

  /**
   * Route: GET /api/health
   * Provides a health snapshot of the service, including uptime and
   * the status of the last test run.
   * @see {@link registry.registerPath} for GET /api/health
   */
  app.get("/api/health", async (c) => {
    // Run comprehensive health checks
    const { checks, summary, status } = await runHealthChecks({
      env: c.env,
      request: c.req.raw,
    });

    const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const latest = await getLatestSession(c.env);

        return jsonSuccess(c, {
          status,
          uptimeSeconds,
          timestamp: nowPST(),
          version: "2.0.0",
          checks,
          summary,
          lastSession: latest,
        });
  });

  /**
   * Route: GET /api/tests/defs
   * Returns a list of all available test definitions from the database.
   * @see {@link registry.registerPath} for GET /api/tests/defs
   */
  app.get("/api/tests/defs", async (c) => {
    try {
      const defs = await listActiveTests(c.env);
      const payload = testDefinitionsResponseSchema.parse({
        tests: defs.map((def) => ({
          id: def.id,
          name: def.name,
          description: def.description,
          category: def.category,
          severity: def.severity,
          isActive: def.isActive,
          errorMap: def.errorMap,
          createdAt: isoToPST(def.createdAt),
        })),
      });
      return jsonSuccess(c, payload);
    } catch (error) {
      console.error("Failed to load test definitions", error);
      if (error instanceof Error && /no such table/i.test(error.message)) {
        return jsonSuccess(c, { tests: [] });
      }
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "TEST_DEFS_ERROR",
        "Failed to load test definitions",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: POST /api/tests/defs
   * Creates or updates a test definition in the database.
   * @see {@link registry.registerPath} for POST /api/tests/defs
   */
  app.post("/api/tests/defs", async (c) => {
    try {
      const body = await c.req.json();
      const params = upsertTestDefinitionRequestSchema.parse(body);

      await upsertTestDefinition(c.env, params);

      return jsonSuccess(c, {
        id: params.id,
        name: params.name,
        description: params.description,
        category: params.category,
        severity: params.severity,
        isActive: params.isActive ?? true,
        errorMap: params.errorMap,
        createdAt: nowPST(), // Approximate
        updatedAt: nowPST(),
      });
    } catch (error) {
      console.error("Failed to upsert test definition", error);
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "TEST_DEF_UPSERT_ERROR",
        "Failed to create/update test definition",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: DELETE /api/tests/defs/:id
   * Deactivates a test definition by ID (soft delete).
   * @see {@link registry.registerPath} for DELETE /api/tests/defs/{id}
   */
  app.delete("/api/tests/defs/:id", async (c) => {
    try {
      const { id } = c.req.param();
      if (!id) {
        return jsonError(c, "INVALID_ID", "Test definition ID is required", 400);
      }

      // Get all test definitions to find the one to delete
      const allDefs = await listActiveTests(c.env);
      const existingDef = allDefs.find(def => def.id === id);

      if (!existingDef) {
        return jsonError(c, "NOT_FOUND", "Test definition not found", 404);
      }

      // Soft delete by setting isActive to false
      await upsertTestDefinition(c.env, {
        ...existingDef,
        isActive: false,
      });

      return jsonSuccess(c, { id, deleted: true });
    } catch (error) {
      console.error("Failed to delete test definition", error);
      return jsonError(
        c,
        "TEST_DEF_DELETE_ERROR",
        "Failed to delete test definition",
        500,
      );
    }
  });

  /**
   * Route: POST /api/tests/run
   * Manually triggers a new, complete test run.
   * @see {@link registry.registerPath} for POST /api/tests/run
   */
  app.post("/api/tests/run", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = runTestsRequestSchema.parse(body);
      const result = await runAllTests(c.env, {
        concurrency: parsed.concurrency,
        reason: parsed.reason,
      });
      return jsonSuccess(c, runTestsResponseSchema.parse(result));
    } catch (error) {
      console.error("Failed to trigger test run", error);
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "TEST_RUN_ERROR",
        "Failed to trigger test run",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: GET /api/tests/session/:id
   * Fetches the detailed results for a specific test session by its UUID.
   * @see {@link registry.registerPath} for GET /api/tests/session/:id
   */
  app.get("/api/tests/session/:id", async (c) => {
    try {
      const { id } = sessionParamSchema.parse(c.req.param());
      const session = await getSessionSummary(c.env, id);
      if (!session) {
        return jsonError(c, "SESSION_NOT_FOUND", "No session found", 404);
      }
      return jsonSuccess(c, sessionResultsResponseSchema.parse({ session }));
    } catch (error) {
      console.error("Failed to load test session", error);
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "SESSION_LOOKUP_ERROR",
        "Failed to load test session",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: GET /api/tests/latest
   * Fetches the detailed results for the most recent test session.
   * @see {@link registry.registerPath} for GET /api/tests/latest
   */
  app.get("/api/tests/latest", async (c) => {
    try {
      const session = await getLatestSession(c.env);
      if (!session) {
        return jsonError(c, "NO_SESSIONS", "No sessions recorded yet", 404);
      }
      return jsonSuccess(c, sessionResultsResponseSchema.parse({ session }));
    } catch (error) {
      console.error("Failed to load latest session", error);
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "LATEST_SESSION_ERROR",
        "Failed to load latest test session",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: GET /api/tasks
   * Lists tasks, with optional filters for agent, status, or search.
   * @see {@link registry.registerPath} for GET /api/tasks
   */
  app.get("/api/tasks", async (c) => {
    const query = taskQuerySchema.parse(c.req.query());
    const tasks = await queryTasks(c.env, query);
    return jsonSuccess(c, listTasksResponseSchema.parse({ tasks }));
  });

  /**
   * Route: GET /api/tasks/open
   * A convenience endpoint to list all tasks not in 'done' or 'blocked' status.
   * @see {@link registry.registerPath} for GET /api/tasks/open
   */
  app.get("/api/tasks/open", async (c) => {
    const tasks = await queryOpenTasks(c.env);
    return jsonSuccess(c, listTasksResponseSchema.parse({ tasks }));
  });

  /**
   * Route: GET /api/tasks/stats
   * Retrieves aggregate statistics about tasks and agent activity.
   * @see {@link registry.registerPath} for GET /api/tasks/stats
   */
  app.get("/api/tasks/stats", async (c) => {
    try {
      // Test each function individually
      const counts = await getTaskCounts(c.env);
      const agentActivity = await listAgentActivity(c.env);
      const blocked = await listBlockedTasks(c.env, { includeAcked: false });

      const stats = { counts, agentActivity, blocked };
      return jsonSuccess(c, taskStatsResponseSchema.parse(stats));
    } catch (error) {
      console.error('Task stats error:', error);
      // Return a simple response for debugging
      return jsonSuccess(c, {
        counts: {
          pending: 0,
          in_progress: 0,
          blocked: 0,
          done: 0,
          backlog: 0,
          todo: 0,
          review: 0,
          cancelled: 0,
          on_hold: 0,
          total: 0,
        },
        agentActivity: [],
        blocked: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Route: GET /api/tasks/search
   * Performs a full-text search across task summaries and descriptions.
   * @see {@link registry.registerPath} for GET /api/tasks/search
   */
  app.get("/api/tasks/search", async (c) => {
    const params = taskSearchQuerySchema.safeParse({
      q: c.req.query("q") ?? c.req.query("query"),
    });
    if (!params.success) {
      return jsonError(
        c,
        "MISSING_QUERY",
        "Provide search query parameter",
        400,
        params.error,
      );
    }
    const payload = await searchTasksByQuery(c.env, params.data.q);
    return jsonSuccess(c, payload);
  });

  /**
   * Route: GET /api/tasks/:id
   * Fetches a single task by its UUID.
   * @see {@link registry.registerPath} for GET /api/tasks/:id
   */
  app.get("/api/tasks/:id", async (c) => {
    const { id } = taskIdParamSchema.parse(c.req.param());
    const task = await queryTasks(c.env, { taskIds: [id] });
    const record = task[0];
    if (!record) {
      return jsonError(c, "TASK_NOT_FOUND", "Task not found", 404);
    }
    return jsonSuccess(c, { task: taskSchema.parse(record) });
  });

  /**
   * Route: GET /api/tasks/agent/:agent
   * Fetches all tasks currently assigned to a specific agent.
   * @see {@link registry.registerPath} for GET /api/tasks/agent/:agent
   */
  app.get("/api/tasks/agent/:agent", async (c) => {
    const { agent } = agentParamSchema.parse(c.req.param());
    const payload = await queryTasksByAgent(c.env, agent);
    return jsonSuccess(c, taskLookupByAgentResponseSchema.parse(payload));
  });

  /**
   * Route: POST /api/tasks
   * Creates a new task.
   * @see {@link registry.registerPath} for POST /api/tasks
   */
  app.post("/api/tasks", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = createTaskSchema.parse(body);
    const task = await createTask(c.env, parsed);
    return jsonSuccess(c, { task: taskSchema.parse(task) }, 201);
  });

  /**
   * Route: PATCH /api/tasks/:id
   * Updates a specific task.
   */
  app.patch("/api/tasks/:id", async (c) => {
    try {
      const taskId = z.string().uuid().parse(c.req.param("id"));
      const body = await c.req.json().catch(() => ({}));
      const parsed = updateTaskSchema.parse(body);

      // For now, only support status and assignedAgent updates
      if (parsed.status) {
        await updateTasksStatus(c.env, [{
          taskId,
          status: parsed.status
        }]);
      }

      // Handle assignedAgent update separately if provided
      if (parsed.assignedAgent !== undefined) {
        const db = getDrizzle(c.env);
        await db.update(tasksTable)
          .set({
            assignedAgent: parsed.assignedAgent,
            updatedAt: nowPST()
          })
          .where(eq(tasksTable.id, taskId));
      }

      // Fetch the updated task
      const updatedTask = await getTask(c.env, taskId);
      if (!updatedTask) {
        return jsonError(c, "TASK_NOT_FOUND", "Task not found", 404);
      }

      return jsonSuccess(c, { task: taskSchema.parse(updatedTask) });
    } catch (error) {
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "UPDATE_TASK_ERROR",
        "Failed to update task",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: POST /api/tasks/reassign
   * Reassigns one or more tasks to a new agent in bulk.
   * @see {@link registry.registerPath} for POST /api/tasks/reassign
   */
  app.post("/api/tasks/reassign", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = bulkReassignRequestSchema.parse(body);
    const payload = await reassignTasks(c.env, parsed.taskIds, parsed.agent);
    return jsonSuccess(c, payload);
  });

  /**
   * Route: POST /api/tasks/status
   * Updates the status of one or more tasks in bulk.
   * @see {@link registry.registerPath} for POST /api/tasks/status
   */
  app.post("/api/tasks/status", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = bulkStatusUpdateRequestSchema.parse(body);
    const payload = await updateTasksStatus(c.env, parsed.updates);
    return jsonSuccess(c, payload);
  });

  /**
   * Route: POST /api/tasks/:id/status
   * Updates the status of a single task.
   * @see {@link registry.registerPath} for POST /api/tasks/:id/status
   */
  app.post("/api/tasks/:id/status", async (c) => {
    const { id } = taskIdParamSchema.parse(c.req.param());
    const body = await c.req.json().catch(() => ({}));
    const parsed = singleStatusUpdateRequestSchema.parse(body);
    const task = await updateSingleTaskStatus(c.env, id, parsed.status);
    if (!task) {
      return jsonError(c, "TASK_NOT_FOUND", "Task not found", 404);
    }
    return jsonSuccess(c, { task: taskSchema.parse(task) });
  });

  /**
   * Route: POST /api/agents/check-in
   * Allows an agent to report its status and current activity.
   * @see {@link registry.registerPath} for POST /api/agents/check-in
   */
  app.post("/api/agents/check-in", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = agentCheckInRequestSchema.parse(body);
    const activity = await checkInAgent(c.env, parsed);
    return jsonSuccess(c, agentCheckInResponseSchema.parse({ activity }));
  });

  /**
   * Route: POST /api/tasks/:id/block
   * Marks a task as 'blocked' and records the reason.
   * @see {@link registry.registerPath} for POST /api/tasks/:id/block
   */
  app.post("/api/tasks/:id/block", async (c) => {
    const { id } = taskIdParamSchema.parse(c.req.param());
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = blockTaskRequestSchema.parse(body);

      const db = getDrizzle(c.env);
      const blockageId = crypto.randomUUID();
      const timestamp = nowPST();

      await db
        .update(tasksTable)
        .set({ status: "blocked", updatedAt: timestamp })
        .where(eq(tasksTable.id, id));

      await db.insert(taskBlockersTable).values({
        id: blockageId,
        taskId: id,
        projectId: parsed.projectId,
        blockedAgent: parsed.blockedAgent,
        blockingOwner: parsed.blockingOwner ?? null,
        reason: parsed.reason,
        severity: parsed.severity,
        requiresHumanIntervention: parsed.requiresHumanIntervention ? 1 : 0,
        humanInterventionReason: parsed.humanInterventionReason ?? null,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
        acked: 0,
        lastNotified: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const [blockage] = await db
        .select()
        .from(taskBlockersTable)
        .where(eq(taskBlockersTable.id, blockageId))
        .limit(1);

      if (!blockage) {
        return jsonError(
          c,
          "BLOCK_TASK_ERROR",
          "Failed to persist task blockage",
          500,
        );
      }

      const payload = taskBlockerResponseSchema.parse({
        blocker: deserializeTaskBlockage(blockage),
      });

      return jsonSuccess(c, payload);
    } catch (error) {
      console.error("Failed to block task", error);
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "BLOCK_TASK_ERROR",
        "Failed to block task",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: POST /api/tasks/:id/unblock
   * Resolves a blocker on a task.
   * @see {@link registry.registerPath} for POST /api/tasks/:id/unblock
   */
  app.post("/api/tasks/:id/unblock", async (c) => {
    const { id } = taskIdParamSchema.parse(c.req.param());
    const body = await c.req.json().catch(() => ({}));
    const parsed = unblockTaskRequestSchema.parse(body);
    const blocker = await unblockTask(c.env, {
      taskId: id,
      blockedAgent: parsed.blockedAgent,
      resolvedBy: parsed.resolvedBy,
      note: parsed.note,
    });
    if (!blocker) {
      return jsonError(c, "BLOCKER_NOT_FOUND", "Task blocker not found", 404);
    }
    return jsonSuccess(c, unblockTaskResponseSchema.parse({ blocker }));
  });

  /**
   * Route: POST /api/analyze
   * A placeholder analysis endpoint.
   * @see {@link registry.registerPath} for POST /api/analyze
   */
  app.post("/api/analyze", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = analyzeRequestSchema.parse(body);
    const description = `Analysis for ${parsed.target} at depth ${parsed.depth}`;
    const recommendations = [
      {
        title: "Stabilise integration",
        description:
          "Review integration contract tests and align expectation suites.",
        impact: "high" as const,
      },
      {
        title: "Improve observability",
        description:
          "Add span-level attributes for task orchestration flows.",
        impact: "medium" as const,
      },
    ];
    const payload = analyzeResponseSchema.parse({
      target: parsed.target,
      summary: description,
      recommendations,
      diagnostics: parsed.includeAi ? { ai: true } : {},
    });
    return jsonSuccess(c, payload);
  });

  // --- Message Logging Endpoints ---

  /**
   * Route: GET /api/messages/search
   * Search message logs with filters.
   */
  app.get("/api/messages/search", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return jsonError(c, "MISSING_PROJECT_ID", "projectId query parameter is required", 400);
    }

    const rawFilters = {
      projectId,
      threadId: c.req.query("threadId") || undefined,
      epicId: c.req.query("epicId") || undefined,
      taskId: c.req.query("taskId") || undefined,
      senderName: c.req.query("senderName") || undefined,
      senderType: c.req.query("senderType") || undefined,
      messageType: c.req.query("messageType") || undefined,
      content: c.req.query("content") || undefined,
      fromDate: c.req.query("fromDate") || undefined,
      toDate: c.req.query("toDate") || undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
      offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
    };

    const parsedFilters = messageSearchFiltersSchema.safeParse(rawFilters);
    if (!parsedFilters.success) {
      return jsonError(
        c,
        "INVALID_FILTERS",
        "Message search query parameters are invalid",
        400,
        parsedFilters.error.flatten(),
      );
    }

    const results = await searchMessages(c.env, parsedFilters.data);
    return jsonSuccess(c, messageSearchResultsSchema.parse(results));
  });

  /**
   * Route: GET /api/threads
   * Get all threads for a project/room.
   */
  app.get("/api/threads", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return jsonError(c, "MISSING_PROJECT_ID", "projectId query parameter is required", 400);
    }

    const threads = await getThreads(c.env, projectId);
    return jsonSuccess(c, { threads: threads.map(thread => threadSchema.parse(thread)) });
  });

  /**
   * Route: GET /api/threads/:threadId
   * Get a specific thread by ID.
   */
  app.get("/api/threads/:threadId", async (c) => {
    const { threadId } = c.req.param();
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return jsonError(c, "MISSING_PROJECT_ID", "projectId query parameter is required", 400);
    }

    const thread = await getThread(c.env, projectId, threadId);
    if (!thread) {
      return jsonError(c, "THREAD_NOT_FOUND", "Thread not found", 404);
    }
    return jsonSuccess(c, threadSchema.parse(thread));
  });

  /**
   * Route: POST /api/threads
   * Create a new thread.
   */
  app.post("/api/threads", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return jsonError(c, "MISSING_PROJECT_ID", "projectId query parameter is required", 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = createThreadSchema.parse(body);

    // TODO: Add authentication/authorization check here
    // For now, assume the user is authenticated and we get their ID from somewhere
    const createdBy = "user"; // This should come from authentication

    const threadId = await createThread(c.env, projectId, parsed.subject, createdBy);

    const thread = await getThread(c.env, projectId, threadId);
    if (!thread) {
      return jsonError(c, "THREAD_CREATION_FAILED", "Failed to create thread", 500);
    }

    return jsonSuccess(c, threadSchema.parse(thread), 201);
  });

  /**
   * Route: GET /api/threads/:threadId/messages
   * Get all messages in a specific thread.
   */
  app.get("/api/threads/:threadId/messages", async (c) => {
    const { threadId } = c.req.param();
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return jsonError(c, "MISSING_PROJECT_ID", "projectId query parameter is required", 400);
    }

    const limit = parseInt(c.req.query("limit") || "100");
    const offset = parseInt(c.req.query("offset") || "0");

    const messages = await getThreadMessages(c.env, projectId, threadId, limit, offset);
    return jsonSuccess(c, { messages: messages.map(msg => messageLogSchema.parse(msg)) });
  });

  /**
   * Route: GET /api/messages/recent
   * Get recent messages for a room.
   */
  app.get("/api/messages/recent", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return jsonError(c, "MISSING_PROJECT_ID", "projectId query parameter is required", 400);
    }

    const limit = parseInt(c.req.query("limit") || "50");
    const messages = await getRecentMessages(c.env, projectId, limit);
    return jsonSuccess(c, { messages: messages.map(msg => messageLogSchema.parse(msg)) });
  });

  // --- Project Management Endpoints ---

  /**
   * Route: GET /api/epics
   * List all epics.
   * Note: Epics are not currently linked to projects in the database schema.
   */
  app.get("/api/epics", async (c) => {
    try {
      const db = getDrizzle(c.env);
      const epics = await db
        .select()
        .from(epicsTable)
        .orderBy(desc(epicsTable.createdAt));

      return jsonSuccess(c, { epics: epics.map(deserializeEpic) });
    } catch (error) {
      console.error("Failed to fetch epics", error);
      return jsonError(c, "FETCH_EPICS_ERROR", "Failed to fetch epics", 500);
    }
  });

  /**
   * Route: POST /api/epics
   * Create a new epic.
   */
  app.post("/api/epics", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = createEpicSchema.parse(body);

      const db = getDrizzle(c.env);
      const epicId = crypto.randomUUID();
      const timestamp = nowPST();

      await db.insert(epicsTable).values({
        id: epicId,
        title: parsed.title,
        description: parsed.description || null,
        status: "planning",
        priority: parsed.priority,
        assignedAgent: parsed.assignedAgent || null,
        targetCompletion: parsed.targetCompletion || null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const [epic] = await db
        .select()
        .from(epicsTable)
        .where(eq(epicsTable.id, epicId))
        .limit(1);

      if (!epic) {
        return jsonError(c, "CREATE_EPIC_ERROR", "Failed to read created epic", 500);
      }

      return jsonSuccess(c, deserializeEpic(epic), 201);
    } catch (error) {
      console.error("Failed to create epic", error);
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "CREATE_EPIC_ERROR",
        "Failed to create epic",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: POST /api/tasks/human-review
   * Submit human review response.
   */
  app.post("/api/tasks/human-review", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = humanReviewSchema.parse(body);

      const db = getDrizzle(c.env);
      const timestamp = nowPST();

      await db
        .update(tasksTable)
        .set({
          humanReviewResponse: parsed.response,
          status: parsed.approved ? "todo" : "cancelled",
          updatedAt: timestamp
        })
        .where(eq(tasksTable.id, parsed.taskId));

      const [task] = await db
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.id, parsed.taskId))
        .limit(1);

      if (!task) {
        return jsonError(c, "TASK_NOT_FOUND", "Task not found", 404);
      }

      return jsonSuccess(c, {
        task: deserializeTask(task),
        approved: parsed.approved,
        response: parsed.response
      });
    } catch (error) {
      console.error("Failed to submit human review", error);
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "HUMAN_REVIEW_ERROR",
        "Failed to submit human review",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: POST /api/agents/status
   * Update agent status.
   */
  app.post("/api/agents/status", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = updateAgentStatusSchema.parse(body);

      const db = getDrizzle(c.env);
      const statusId = crypto.randomUUID();
      const timestamp = nowPST();

      // Upsert agent status (insert or update)
      await db
        .insert(agentStatusTable)
        .values({
          id: statusId,
          projectId: parsed.projectId,
          agentName: parsed.agentName,
          status: parsed.status,
          currentTaskId: parsed.currentTaskId || null,
          lastActivity: timestamp,
          statusMessage: parsed.statusMessage || null,
          requiresAttention: parsed.requiresAttention ? 1 : 0,
          attentionReason: parsed.attentionReason || null,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [agentStatusTable.projectId, agentStatusTable.agentName],
          set: {
            status: parsed.status,
            currentTaskId: parsed.currentTaskId || null,
            lastActivity: timestamp,
            statusMessage: parsed.statusMessage || null,
            requiresAttention: parsed.requiresAttention ? 1 : 0,
            attentionReason: parsed.attentionReason || null,
            updatedAt: timestamp,
          },
        });

      const [status] = await db
        .select()
        .from(agentStatusTable)
        .where(
          and(
            eq(agentStatusTable.projectId, parsed.projectId),
            eq(agentStatusTable.agentName, parsed.agentName),
          ),
        )
        .limit(1);

      if (!status) {
        return jsonError(
          c,
          "UPDATE_AGENT_STATUS_ERROR",
          "Failed to update agent status",
          500,
        );
      }

      return jsonSuccess(c, deserializeAgentStatus(status));
    } catch (error) {
      console.error("Failed to update agent status", error);
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "UPDATE_AGENT_STATUS_ERROR",
        "Failed to update agent status",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  // ============================================================================
  // Projects API Endpoints
  // ============================================================================

  /**
   * Route: POST /api/projects
   * Creates a new project.
   */
  app.post("/api/projects", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = createProjectRequestSchema.parse(body);

      const result = await createProject(c.env, {
        title: parsed.name,
        description: parsed.description || undefined,
        priority: parsed.priority,
        targetCompletion: parsed.targetCompletion || undefined,
        assignedAgent: parsed.assignedAgent || undefined,
      } as any) as unknown as { data: any; error?: Error };

      if (result.error) {
        return jsonError(c, "CREATE_PROJECT_ERROR", result.error.message, 500);
      }

      return jsonSuccess(c, { project: projectSchema.parse(result.data) }, 201);
    } catch (error) {
      console.error('Exception in create project:', error);
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "CREATE_PROJECT_ERROR",
        error instanceof Error ? error.message : "Failed to create project",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: GET /api/projects
   * Lists all projects.
   */
  app.get("/api/projects", async (c) => {
    try {
      const result = await listProjects(c.env) as unknown as { data: any[]; error?: Error };
      if (result.error) {
        return jsonError(c, "LIST_PROJECTS_ERROR", result.error.message, 500);
      }
      return jsonSuccess(
        c,
        listProjectsResponseSchema.parse({ projects: result.data }),
      );
    } catch (error) {
      return jsonError(
        c,
        "LIST_PROJECTS_ERROR",
        "Failed to list projects",
        500,
      );
    }
  });

  /**
   * Route: GET /api/projects/:projectId
   * Gets a specific project by ID.
   */
  app.get("/api/projects/:projectId", async (c) => {
    try {
      const projectId = z.string().uuid().parse(c.req.param("projectId"));
      const result = await getProject(c.env, projectId) as unknown as { data: { project: any; epics: any[]; tasks: any[]; agentActivity: any[] }; error?: Error };
      if (result.error) {
        return jsonError(c, "PROJECT_NOT_FOUND", result.error.message, 404);
      }
      return jsonSuccess(c, { project: projectSchema.parse(result.data.project) });
    } catch (error) {
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "GET_PROJECT_ERROR",
        "Failed to get project",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: PUT /api/projects/:projectId
   * Updates a project.
   */
  app.put("/api/projects/:projectId", async (c) => {
    try {
      const projectId = z.string().uuid().parse(c.req.param("projectId"));
      const body = await c.req.json().catch(() => ({}));
      const parsed = updateProjectRequestSchema.parse(body);
      const project = await updateProject(c.env, projectId, parsed);
      if (!project) {
        return jsonError(c, "PROJECT_NOT_FOUND", "Project not found", 404);
      }
      return jsonSuccess(c, { project: projectSchema.parse(project) });
    } catch (error) {
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "UPDATE_PROJECT_ERROR",
        "Failed to update project",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: DELETE /api/projects/:projectId
   * Deletes a project.
   */
  app.delete("/api/projects/:projectId", async (c) => {
    try {
      const projectId = z.string().uuid().parse(c.req.param("projectId"));
      const deleted = await deleteProject(c.env, projectId);
      if (!deleted) {
        return jsonError(c, "PROJECT_NOT_FOUND", "Project not found", 404);
      }
      return jsonSuccess(c, { success: true });
    } catch (error) {
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "DELETE_PROJECT_ERROR",
        "Failed to delete project",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  // ============================================================================
  // Chat API Endpoints
  // ============================================================================

  /**
   * Route: POST /api/chat/rooms
   * Creates a chat room for a project.
   */
  app.post("/api/chat/rooms", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = createChatRoomRequestSchema.parse(body);
      // Verify project exists
      const project = await getProject(c.env, parsed.projectId);
      if (!project) {
        return jsonError(c, "PROJECT_NOT_FOUND", "Project not found", 404);
      }
      const roomId = crypto.randomUUID();
      const room = await createChatRoom(c.env, {
        id: roomId,
        ...parsed,
      });
      return jsonSuccess(c, { room: chatRoomSchema.parse(room) }, 201);
    } catch (error) {
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "CREATE_CHAT_ROOM_ERROR",
        "Failed to create chat room",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: GET /api/chat/rooms/:projectId
   * Lists all chat rooms in a project.
   */
  app.get("/api/chat/rooms/:projectId", async (c) => {
    try {
      const projectId = z.string().uuid().parse(c.req.param("projectId"));
      const rooms = await listChatRooms(c.env, projectId);
      return jsonSuccess(c, listChatRoomsResponseSchema.parse({ rooms }));
    } catch (error) {
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "LIST_CHAT_ROOMS_ERROR",
        "Failed to list chat rooms",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: POST /api/chat/threads
   * Creates a thread in a chat room.
   */
  app.post("/api/chat/threads", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = createChatThreadRequestSchema.parse(body);
      // Foreign key constraint will validate chat room exists
      const threadId = crypto.randomUUID();
      const thread = await createChatThread(c.env, {
        id: threadId,
        ...parsed,
      });
      return jsonSuccess(c, { thread: chatThreadSchema.parse(thread) }, 201);
    } catch (error) {
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "CREATE_CHAT_THREAD_ERROR",
        "Failed to create chat thread",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: GET /api/chat/threads/:chatRoomId
   * Lists all threads in a chat room.
   */
  app.get("/api/chat/threads/:chatRoomId", async (c) => {
    try {
      const chatRoomId = z.string().uuid().parse(c.req.param("chatRoomId"));
      const threads = await listChatThreads(c.env, chatRoomId);
      return jsonSuccess(
        c,
        listChatThreadsResponseSchema.parse({ threads }),
      );
    } catch (error) {
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "LIST_CHAT_THREADS_ERROR",
        "Failed to list chat threads",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: POST /api/chat/messages
   * Sends a message to a thread.
   */
  app.post("/api/chat/messages", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = createChatMessageRequestSchema.parse(body);
      const messageId = crypto.randomUUID();
      const message = await createChatMessage(c.env, {
        id: messageId,
        ...parsed,
      });
      return jsonSuccess(c, { message: chatMessageSchema.parse(message) }, 201);
    } catch (error) {
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "CREATE_CHAT_MESSAGE_ERROR",
        "Failed to create chat message",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  /**
   * Route: GET /api/chat/messages/:threadId
   * Gets all messages in a thread.
   */
  app.get("/api/chat/messages/:threadId", async (c) => {
    try {
      const threadId = z.string().uuid().parse(c.req.param("threadId"));
      const messages = await listChatMessages(c.env, threadId);
      return jsonSuccess(
        c,
        listChatMessagesResponseSchema.parse({ messages }),
      );
    } catch (error) {
      const details = error instanceof z.ZodError ? error.flatten() : undefined;
      return jsonError(
        c,
        "LIST_CHAT_MESSAGES_ERROR",
        "Failed to list chat messages",
        error instanceof z.ZodError ? 400 : 500,
        details,
      );
    }
  });

  // Additional project endpoints
  app.get("/api/projects/:id/epics", async (c) => {
    try {
      const projectId = c.req.param("id");
      const { data, error } = await getProjectEpics(c.env, projectId);
      if (error) return jsonError(c, "GET_PROJECT_EPICS_ERROR", error.message, 500);
      return jsonSuccess(c, { epics: data });
    } catch (error) {
      return jsonError(c, "GET_PROJECT_EPICS_ERROR", "Failed to get project epics", 500);
    }
  });

  app.post("/api/projects/:id/reassign", async (c) => {
    try {
      const projectId = c.req.param("id");
      const { data, error } = await reassignProjectTasks(c.env, projectId);
      if (error) return jsonError(c, "REASSIGN_PROJECT_TASKS_ERROR", error.message, 500);
      return jsonSuccess(c, data);
    } catch (error) {
      return jsonError(c, "REASSIGN_PROJECT_TASKS_ERROR", "Failed to reassign project tasks", 500);
    }
  });

  app.get("/api/projects/:id/threads", async (c) => {
    try {
      const projectId = c.req.param("id");
      const { data, error } = await getProjectThreads(c.env, projectId);
      if (error) return jsonError(c, "GET_PROJECT_THREADS_ERROR", error.message, 500);
      return jsonSuccess(c, { threads: data });
    } catch (error) {
      return jsonError(c, "GET_PROJECT_THREADS_ERROR", "Failed to get project threads", 500);
    }
  });

  app.post("/api/projects/:id/threads", async (c) => {
    try {
      const projectId = c.req.param("id");
      const body = await c.req.json();
      const { data, error } = await createProjectThread(c.env, projectId, body);
      if (error) return jsonError(c, "CREATE_PROJECT_THREAD_ERROR", error.message, 400);
      return jsonSuccess(c, data, 201);
    } catch (error) {
      return jsonError(c, "CREATE_PROJECT_THREAD_ERROR", "Failed to create project thread", 400);
    }
  });

  app.get("/api/threads/:id/messages", async (c) => {
    try {
      const threadId = c.req.param("id");
      const { data, error } = await getProjectThreadMessages(c.env, threadId);
      if (error) return jsonError(c, "GET_THREAD_MESSAGES_ERROR", error.message, 500);
      return jsonSuccess(c, { messages: data });
    } catch (error) {
      return jsonError(c, "GET_THREAD_MESSAGES_ERROR", "Failed to get thread messages", 500);
    }
  });

  app.post("/api/threads/:id/messages", async (c) => {
    try {
      const threadId = c.req.param("id");
      const body = await c.req.json();
      const { data, error } = await createThreadMessage(c.env, threadId, body);
      if (error) return jsonError(c, "CREATE_THREAD_MESSAGE_ERROR", error.message, 400);
      return jsonSuccess(c, data, 201);
    } catch (error) {
      return jsonError(c, "CREATE_THREAD_MESSAGE_ERROR", "Failed to create thread message", 400);
    }
  });

  // Agent endpoints
  app.get("/api/agents", async (c) => {
    try {
      const { data, error } = await listAgents(c.env);
      if (error) return jsonError(c, "LIST_AGENTS_ERROR", error.message, 500);
      return jsonSuccess(c, { agents: data });
    } catch (error) {
      return jsonError(c, "LIST_AGENTS_ERROR", "Failed to list agents", 500);
    }
  });

  // Return the configured app instance
  return app;
};

