/**
 * @file This file is the single source of truth for all API data models and schemas.
 *
 * @description
 * It uses `zod` and `@asteasolutions/zod-to-openapi` to define strongly-typed
 * Zod schemas for all API request/response payloads, database models, and
 * other data structures.
 *
 * All schemas are registered with the central `registry` instance, which is
 * then used to automatically generate an OpenAPI (Swagger) specification.
 *
 * This file also exports the inferred TypeScript types from these schemas
 * for use throughout the application, ensuring type safety between the
 * API layer, database utilities, and RPC handlers.
 *
 * @module apiSchemas
 */

import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// --- Initialization ---

// Enhance the Zod instance with OpenAPI generation capabilities
extendZodWithOpenApi(z);

/**
 * The central OpenAPI registry.
 * All exported Zod schemas intended for the API specification
 * MUST be registered using `registry.register()`.
 */
export const registry = new OpenAPIRegistry();

// --- Private/Shared Schemas ---

/**
 * @private
 * @description A reusable schema for a dictionary of error codes.
 */
const errorDictionarySchema = z
  .record(
    z.object({
      meaning: z
        .string()
        .describe("Human-friendly explanation of the error code"),
      fix: z.string().describe("Suggested corrective action"),
    }),
  )
  .default({});

/**
 * @private
 * @description A reusable Zod enum for task status.
 */
const statusEnum = z.enum([
  "pending",
  "backlog",
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
  "cancelled",
  "on_hold",
]);

/**
 * @private
 * @description A reusable Zod enum for agent status.
 */
const agentStatusEnum = z.enum([
  "offline",
  "available",
  "busy",
  "in_progress",
  "blocked",
  "awaiting_human",
  "done",
  "error",
]);

// --- Health & Test Schemas ---

/**
 * @description Defines the structure of an automated test definition.
 */
export const testDefinitionSchema = registry.register(
  "TestDefinition",
  z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.string().nullable().default(null),
    severity: z.string().nullable().default(null),
    isActive: z.boolean().default(true),
    errorMap: errorDictionarySchema,
    createdAt: z.string().datetime(),
  }),
);

/**
 * @description Defines the structure of a single test run result.
 */
export const testResultSchema = registry.register(
  "TestResult",
  z.object({
    definition: testDefinitionSchema,
    status: z.enum(["pass", "fail"]),
    durationMs: z.number().int().nonnegative(),
    errorCode: z.string().optional(),
    raw: z.unknown().optional(),
    aiDescription: z.string().optional(),
    aiFixPrompt: z.string().optional(),
  }),
);

/**
 * @description A summary of a complete test session, including all results.
 */
export const sessionSummarySchema = registry.register(
  "SessionSummary",
  z.object({
    sessionUuid: z.string().uuid(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    total: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
    results: z.array(testResultSchema),
  }),
);

/**
 * @description Detailed health check result for a specific component.
 */
export const healthCheckResultSchema = registry.register(
  "HealthCheckResult",
  z.object({
    name: z.string(),
    status: z.enum(["pass", "fail", "warn"]),
    message: z.string(),
    durationMs: z.number().int().nonnegative(),
    details: z.record(z.unknown()).optional(),
  }),
);

/**
 * @description Comprehensive health snapshot with detailed component checks.
 */
export const healthSnapshotSchema = registry.register(
  "HealthSnapshot",
  z.object({
    status: z.enum(["healthy", "degraded", "failing"]),
    uptimeSeconds: z.number().int().nonnegative(),
    timestamp: z.string().datetime(),
    version: z.string(),
    checks: z.array(healthCheckResultSchema),
    summary: z.object({
      total: z.number().int(),
      passed: z.number().int(),
      failed: z.number().int(),
      warned: z.number().int(),
    }),
    lastSession: sessionSummarySchema.optional(),
  }),
);

/**
 * @description The request body for creating/updating a test definition (`POST /api/tests/defs`).
 */
export const upsertTestDefinitionRequestSchema = registry.register(
  "UpsertTestDefinitionRequest",
  z.object({
    id: z.string().min(1).max(100).describe("Unique identifier for the test definition"),
    name: z.string().min(1).max(100).describe("Human readable name for the test"),
    description: z.string().min(1).max(500).describe("Detailed description of what the test does"),
    category: z.string().min(1).max(50).optional().describe("Test category (e.g., 'api', 'database', 'realtime')"),
    severity: z.enum(["critical", "high", "medium", "low"]).optional().describe("Test severity level"),
    isActive: z.boolean().default(true).describe("Whether this test definition is active"),
    errorMap: z.record(z.object({
      meaning: z.string().min(1).max(200).describe("What this error code means"),
      fix: z.string().min(1).max(500).describe("How to fix this error"),
    })).optional().describe("Map of error codes to meanings and fixes"),
  }),
);

/**
 * @description The request body for triggering a new test run (`POST /api/tests/run`).
 */
export const runTestsRequestSchema = registry.register(
  "RunTestsRequest",
  z.object({
    reason: z
      .string()
      .min(3)
      .max(240)
      .describe("Human readable reason for triggering the test run")
      .optional(),
    concurrency: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(3)
      .describe("Maximum number of test executions run concurrently"),
  }),
);

/**
 * @description The response body for `POST /api/tests/run`.
 */
export const runTestsResponseSchema = registry.register(
  "RunTestsResponse",
  z.object({
    sessionUuid: z.string().uuid(),
    startedAt: z.string().datetime(),
  }),
);

/**
 * @description The response body for `GET /api/tests/session/{id}` or `/api/tests/latest`.
 */
export const sessionResultsResponseSchema = registry.register(
  "SessionResultsResponse",
  z.object({
    session: sessionSummarySchema,
  }),
);

/**
 * @description The response body for `GET /api/tests/defs`.
 */
export const testDefinitionsResponseSchema = registry.register(
  "TestDefinitionsResponse",
  z.object({
    tests: z.array(testDefinitionSchema),
  }),
);

// --- API Envelope Schemas ---

/**
 * @description A standardized *failure* response envelope for all API endpoints.
 */
export const apiErrorSchema = registry.register(
  "ApiError",
  z.object({
    success: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  }),
);

/**
 * @description A standardized *success* response envelope for all API endpoints.
 */
export const apiSuccessSchema = registry.register(
  "ApiSuccess",
  z.object({
    success: z.literal(true),
    data: z.unknown(),
    meta: z.record(z.unknown()).optional(),
  }),
);

/**
 * @description A union of the success and error envelopes.
 */
export const apiEnvelopeSchema = registry.register(
  "ApiEnvelope",
  apiSuccessSchema.or(apiErrorSchema),
);

// --- Task Schemas ---

/**
 * @description The core schema for a Task object.
 */
export const taskSchema = registry.register(
  "Task",
  z.object({
    id: z.string().uuid(),
    projectId: z.string(),
    epicId: z.string().uuid().nullable().optional(),
    parentTaskId: z.string().uuid().nullable().optional(),
    title: z.string(),
    description: z.string().nullable(),
    status: statusEnum,
    priority: z.enum(["low", "medium", "high", "critical"]),
    assignedAgent: z.string().nullable(),
    estimatedHours: z.number().nonnegative().nullable().optional(),
    actualHours: z.number().nonnegative().nullable().optional(),
    requiresHumanReview: z.boolean().optional(),
    humanReviewReason: z.string().nullable().optional(),
    humanReviewResponse: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
);

/**
 * @description The response body for `GET /api/tasks`.
 */
export const listTasksResponseSchema = registry.register(
  "ListTasksResponse",
  z.object({
    tasks: z.array(taskSchema),
  }),
);

/**
 * @description The request body for creating a new task (`POST /api/tasks`).
 */
export const createTaskRequestSchema = registry.register(
  "CreateTaskRequest",
  z.object({
    projectId: z.string(),
    epicId: z.string().uuid().optional(),
    parentTaskId: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    assignedAgent: z.string().max(160).optional(),
    status: statusEnum.default("todo"),
    estimatedHours: z.number().nonnegative().optional(),
    requiresHumanReview: z.boolean().default(false),
    humanReviewReason: z.string().max(320).optional(),
  }),
);

/**
 * @description The response body for `POST /api/tasks`.
 */
export const createTaskResponseSchema = registry.register(
  "CreateTaskResponse",
  z.object({
    task: taskSchema,
  }),
);

/**
 * @description The request body for `POST /api/tasks/reassign`.
 */
export const bulkReassignRequestSchema = registry.register(
  "BulkReassignRequest",
  z.object({
    taskIds: z.array(z.string().uuid()).min(1),
    agent: z.string().min(1).max(160),
  }),
);

/**
 * @description The response body for `POST /api/tasks/reassign`.
 */
export const bulkReassignResponseSchema = registry.register(
  "BulkReassignResponse",
  z.object({
    tasks: z.array(taskSchema),
  }),
);

/**
 * @description The request body for `POST /api/tasks/status` (bulk update).
 */
export const bulkStatusUpdateRequestSchema = registry.register(
  "BulkStatusUpdateRequest",
  z.object({
    updates: z
      .array(
        z.object({
          taskId: z.string().uuid(),
          status: statusEnum,
        }),
      )
      .min(1),
  }),
);

/**
 * @description The response body for `POST /api/tasks/status` (bulk update).
 */
export const bulkStatusUpdateResponseSchema = registry.register(
  "BulkStatusUpdateResponse",
  z.object({
    tasks: z.array(taskSchema),
  }),
);

/**
 * @description The request body for `POST /api/tasks/{id}/status` (single update).
 */
export const singleStatusUpdateRequestSchema = registry.register(
  "SingleStatusUpdateRequest",
  z.object({
    status: statusEnum,
  }),
);

/**
 * @description The response body for `GET /api/tasks/agent/{agent}`.
 */
export const taskLookupByAgentResponseSchema = registry.register(
  "TaskLookupByAgentResponse",
  z.object({
    agent: z.string(),
    tasks: z.array(taskSchema),
  }),
);

/**
 * @description The response body for `GET /api/tasks/search`.
 */
export const taskSearchResponseSchema = registry.register(
  "TaskSearchResponse",
  z.object({
    query: z.string(),
    tasks: z.array(taskSchema),
  }),
);

// --- Task Stats & Agent Schemas ---

/**
 * @description A schema for aggregate task counts by status.
 */
export const taskCountsSchema = registry.register(
  "TaskCounts",
  z.object({
    pending: z.number().int().nonnegative(),
    in_progress: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
    backlog: z.number().int().nonnegative(),
    todo: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    on_hold: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
);

/**
 * @description A schema representing an agent's last reported activity.
 */
export const agentActivitySchema = registry.register(
  "AgentActivity",
  z.object({
    agentName: z.string(),
    status: agentStatusEnum,
    taskId: z.string().uuid().nullable().optional(),
    note: z.string().nullable().optional(),
    lastCheckIn: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
);

/**
 * @description A schema representing an active task blocker.
 */
export const taskBlockerSchema = registry.register(
  "TaskBlocker",
  z.object({
    id: z.string().uuid(),
    projectId: z.string(),
    taskId: z.string().uuid(),
    blockedAgent: z.string(),
    blockingOwner: z.string().nullable(),
    reason: z.string().nullable(),
    severity: z.enum(["low", "medium", "high", "critical"]),
    requiresHumanIntervention: z.boolean(),
    humanInterventionReason: z.string().nullable(),
    resolvedAt: z.string().datetime().nullable(),
    resolvedBy: z.string().nullable(),
    resolutionNote: z.string().nullable(),
    acked: z.boolean(),
    lastNotified: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
);

/**
 * @description The response body for `GET /api/tasks/stats`.
 */
export const taskStatsResponseSchema = registry.register(
  "TaskStatsResponse",
  z.object({
    counts: taskCountsSchema,
    agentActivity: z.array(agentActivitySchema),
    blocked: z.array(taskBlockerSchema),
  }),
);

/**
 * @description The request body for `POST /api/agents/check-in`.
 */
export const agentCheckInRequestSchema = registry.register(
  "AgentCheckInRequest",
  z.object({
    agentName: z.string().min(1),
    status: agentStatusEnum,
    taskId: z.string().uuid().nullable().optional(),
    note: z.string().max(240).optional(),
  }),
);

/**
 * @description The response body for `POST /api/agents/check-in`.
 */
export const agentCheckInResponseSchema = registry.register(
  "AgentCheckInResponse",
  z.object({
    activity: agentActivitySchema,
  }),
);

/**
 * @description The request body for `POST /api/tasks/{id}/block`.
 */
export const blockTaskRequestSchema = registry.register(
  "BlockTaskRequest",
  z.object({
    projectId: z.string(),
    blockedAgent: z.string().min(1),
    blockingOwner: z.string().max(160).optional(),
    reason: z.string().min(1).max(320),
    severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    requiresHumanIntervention: z.boolean().default(false),
    humanInterventionReason: z.string().max(320).optional(),
  }),
);

/**
 * @description The request body for `POST /api/tasks/{id}/unblock`.
 */
export const unblockTaskRequestSchema = registry.register(
  "UnblockTaskRequest",
  z.object({
    blockedAgent: z.string().min(1),
    resolvedBy: z.string().min(1).max(160).optional(),
    note: z.string().max(320).optional(),
  }),
);

/**
 * @description The response body for `POST /api/tasks/{id}/block`.
 */
export const taskBlockerResponseSchema = registry.register(
  "TaskBlockerResponse",
  z.object({
    blocker: taskBlockerSchema,
  }),
);

/**
 * @description The response body for `POST /api/tasks/{id}/unblock`.
 */
export const unblockTaskResponseSchema = registry.register(
  "UnblockTaskResponse",
  z.object({
    blocker: taskBlockerSchema,
  }),
);

/**
 * @description The response body for a (hypothetical) endpoint to list all blockers.
 */
export const blockedSummaryResponseSchema = registry.register(
  "BlockedSummaryResponse",
  z.object({
    blocked: z.array(taskBlockerSchema),
  }),
);

// --- Analysis Schemas ---

/**
 * @description The request body for `POST /api/analyze`.
 */
export const analyzeRequestSchema = registry.register(
  "AnalyzeRequest",
  z.object({
    target: z.string().min(3),
    depth: z.enum(["shallow", "normal", "deep"]).default("normal"),
    includeAi: z.boolean().default(true),
  }),
);

/**
 * @description The response body for `POST /api/analyze`.
 */
export const analyzeResponseSchema = registry.register(
  "AnalyzeResponse",
  z.object({
    target: z.string(),
    summary: z.string(),
    recommendations: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        impact: z.enum(["low", "medium", "high"]),
      }),
    ),
    diagnostics: z.record(z.unknown()).optional(),
  }),
);

// --- RPC & WebSocket Schemas ---

/**
 * @description A generic schema for a JSON-RPC request.
 */
export const rpcRequestSchema = registry.register(
  "RpcRequest",
  z.object({
    method: z.string(),
    params: z.unknown().optional(),
  }),
);

/**
 * @description A generic schema for a JSON-RPC response.
 */
export const rpcResponseSchema = registry.register(
  "RpcResponse",
  z.object({
    success: z.boolean(),
    result: z.unknown().optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional(),
      })
      .optional(),
  }),
);

/**
 * @description A generic schema for a WebSocket message.
 */
export const wsMessageSchema = registry.register(
  "WsMessage",
  z.object({
    type: z.string(),
    payload: z.unknown(),
    meta: z.record(z.unknown()).optional(),
  }),
);

// --- Cloudflare Docs Schemas ---

/**
 * @description The request schema for the Cloudflare Docs query RPC tool.
 */
export const docsQueryRequestSchema = registry.register(
  "DocsQueryRequest",
  z.object({
    query: z
      .string()
      .min(1)
      .describe("The question or topic to search for in Cloudflare documentation"),
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
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe("Maximum number of documentation sources to return"),
  }),
);

/**
 * @description A schema for a single documentation source.
 */
export const docsSourceSchema = registry.register(
  "DocsSource",
  z.object({
    title: z.string(),
    url: z.string().url(),
    snippet: z.string(),
  }),
);

/**
 * @description The response schema for the Cloudflare Docs query RPC tool.
 */
export const docsQueryResponseSchema = registry.register(
  "DocsQueryResponse",
  z.object({
    answer: z
      .string()
      .describe("The AI-generated answer based on Cloudflare documentation"),
    sources: z
      .array(docsSourceSchema)
      .describe("Relevant documentation sources with URLs"),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe("Confidence score of the answer (0-1)"),
  }),
);

// --- Inferred TypeScript Types ---

/**
 * @description Inferred type for the `runTests` POST request body.
 * @see {@link runTestsRequestSchema}
 */
export type RunTestsRequest = z.infer<typeof runTestsRequestSchema>;

/**
 * @description Inferred type for the `runTests` POST response payload.
 * @see {@link runTestsResponseSchema}
 */
export type RunTestsResponse = z.infer<typeof runTestsResponseSchema>;

/**
 * @description Inferred type for the upsert test definition request.
 * @see {@link upsertTestDefinitionRequestSchema}
 */
export type UpsertTestDefinitionRequest = z.infer<typeof upsertTestDefinitionRequestSchema>;

/**
 * @description Inferred type for the test session results response.
 * @see {@link sessionResultsResponseSchema}
 */
export type SessionSummaryResponse = z.infer<typeof sessionResultsResponseSchema>;

/**
 * @description Inferred type for the test definitions list response.
 * @see {@link testDefinitionsResponseSchema}
 */
export type TestDefinitionsResponse = z.infer<
  typeof testDefinitionsResponseSchema
>;

/**
 * @description Inferred type for the health snapshot payload.
 * @see {@link healthSnapshotSchema}
 */
export type HealthSnapshot = z.infer<typeof healthSnapshotSchema>;

/**
 * @description Inferred type for a health check result.
 * @see {@link healthCheckResultSchema}
 */
export type HealthCheckResult = z.infer<typeof healthCheckResultSchema>;

/**
 * @description Inferred type for a single Task object.
 * @see {@link taskSchema}
 */
export type Task = z.infer<typeof taskSchema>;

/**
 * @description Inferred type for the `createTask` POST request body.
 * @see {@link createTaskRequestSchema}
 */
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

/**
 * @description Inferred type for the `createTask` POST response payload.
 * @see {@link createTaskResponseSchema}
 */
export type CreateTaskResponse = z.infer<typeof createTaskResponseSchema>;

/**
 * @description Inferred type for the `bulkReassign` POST request body.
 * @see {@link bulkReassignRequestSchema}
 */
export type BulkReassignRequest = z.infer<typeof bulkReassignRequestSchema>;

/**
 * @description Inferred type for the `bulkReassign` POST response payload.
 * @see {@link bulkReassignResponseSchema}
 */
export type BulkReassignResponse = z.infer<typeof bulkReassignResponseSchema>;

/**
 * @description Inferred type for the `bulkStatusUpdate` POST request body.
 * @see {@link bulkStatusUpdateRequestSchema}
 */
export type BulkStatusUpdateRequest = z.infer<
  typeof bulkStatusUpdateRequestSchema
>;

/**
 * @description Inferred type for the `bulkStatusUpdate` POST response payload.
 * @see {@link bulkStatusUpdateResponseSchema}
 */
export type BulkStatusUpdateResponse = z.infer<
  typeof bulkStatusUpdateResponseSchema
>;

/**
 * @description Inferred type for the `singleStatusUpdate` POST request body.
 * @see {@link singleStatusUpdateRequestSchema}
 */
export type SingleStatusUpdateRequest = z.infer<
  typeof singleStatusUpdateRequestSchema
>;

/**
 * @description Inferred type for the `getTasksByAgent` GET response payload.
 * @see {@link taskLookupByAgentResponseSchema}
 */
export type TaskLookupByAgentResponse = z.infer<
  typeof taskLookupByAgentResponseSchema
>;

/**
 * @description Inferred type for the `searchTasks` GET response payload.
 * @see {@link taskSearchResponseSchema}
 */
export type TaskSearchResponse = z.infer<typeof taskSearchResponseSchema>;

/**
 * @description Inferred type for the TaskCounts object.
 * @see {@link taskCountsSchema}
 */
export type TaskCounts = z.infer<typeof taskCountsSchema>;

/**
 * @description Inferred type for the AgentActivity object.
 * @see {@link agentActivitySchema}
 */
export type AgentActivity = z.infer<typeof agentActivitySchema>;

/**
 * @description Inferred type for the TaskBlocker object.
 * @see {@link taskBlockerSchema}
 */
export type TaskBlocker = z.infer<typeof taskBlockerSchema>;

/**
 * @description Inferred type for the `getTaskStats` GET response payload.
 * @see {@link taskStatsResponseSchema}
 */
export type TaskStatsResponse = z.infer<typeof taskStatsResponseSchema>;

/**
 * @description Inferred type for the `agentCheckIn` POST request body.
 * @see {@link agentCheckInRequestSchema}
 */
export type AgentCheckInRequest = z.infer<typeof agentCheckInRequestSchema>;

/**
 * @description Inferred type for the `agentCheckIn` POST response payload.
 * @see {@link agentCheckInResponseSchema}
 */
export type AgentCheckInResponse = z.infer<typeof agentCheckInResponseSchema>;

/**
 * @description Inferred type for the `blockTask` POST request body.
 * @see {@link blockTaskRequestSchema}
 */
export type BlockTaskRequest = z.infer<typeof blockTaskRequestSchema>;

/**
 * @description Inferred type for the `unblockTask` POST request body.
 * @see {@link unblockTaskRequestSchema}
 */
export type UnblockTaskRequest = z.infer<typeof unblockTaskRequestSchema>;

/**
 * @description Inferred type for the `blockTask` POST response payload.
 * @see {@link taskBlockerResponseSchema}
 */
export type TaskBlockerResponse = z.infer<typeof taskBlockerResponseSchema>;

/**
 * @description Inferred type for the `unblockTask` POST response payload.
 * @see {@link unblockTaskResponseSchema}
 */
export type UnblockTaskResponse = z.infer<typeof unblockTaskResponseSchema>;

/**
 * @description Inferred type for the `analyze` POST request body.
 * @see {@link analyzeRequestSchema}
 */
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

/**
 * @description Inferred type for the `analyze` POST response payload.
 * @see {@link analyzeResponseSchema}
 */
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

/**
 * @description Inferred type for a generic RPC request.
 * @see {@link rpcRequestSchema}
 */
export type RpcRequest = z.infer<typeof rpcRequestSchema>;

/**
 * @description Inferred type for a generic RPC response.
 * @see {@link rpcResponseSchema}
 */
export type RpcResponse = z.infer<typeof rpcResponseSchema>;

// --- Projects & Chat System Schemas ---

/**
 * @description Project schema with UUID primary key.
 */
export const projectSchema = registry.register(
  "Project",
  z.object({
    id: z.string().uuid().describe("Unique project identifier (UUID)"),
    title: z.string().describe("Project title"),
    description: z.string().nullable().describe("Project description"),
    status: z.string().describe("Project status"),
    priority: z.string().describe("Project priority"),
    assignedAgent: z.string().nullable().optional().describe("Assigned agent"),
    targetCompletion: z.string().nullable().optional().describe("Target completion date"),
    createdAt: z.string().datetime().describe("When the project was created"),
    updatedAt: z.string().datetime().describe("When the project was last updated"),
    taskCount: z.number().optional().describe("Number of tasks in the project"),
    epicCount: z.number().optional().describe("Number of epics in the project"),
  }),
);

/**
 * @description Create project request schema.
 */
export const createProjectRequestSchema = registry.register(
  "CreateProjectRequest",
  z.object({
    name: z.string().min(1).describe("Project name"),
    description: z.string().nullable().optional().describe("Project description"),
    priority: z.string().optional().describe("Project priority"),
    targetCompletion: z.string().nullable().optional().describe("Target completion date"),
    assignedAgent: z.string().nullable().optional().describe("Assigned agent"),
    githubRepo: z.string().nullable().optional().describe("GitHub repository name"),
    githubOwner: z.string().nullable().optional().describe("GitHub owner/organization"),
    githubBranch: z.string().nullable().optional().describe("GitHub branch name"),
  }),
);

/**
 * @description Update project request schema.
 */
export const updateProjectRequestSchema = registry.register(
  "UpdateProjectRequest",
  z.object({
    name: z.string().min(1).optional().describe("Project name"),
    description: z.string().nullable().optional().describe("Project description"),
    githubRepo: z.string().nullable().optional().describe("GitHub repository name"),
    githubOwner: z.string().nullable().optional().describe("GitHub owner/organization"),
    githubBranch: z.string().nullable().optional().describe("GitHub branch name"),
  }),
);

/**
 * @description Chat room schema.
 */
export const chatRoomSchema = registry.register(
  "ChatRoom",
  z.object({
    pk: z.number().int().describe("Auto-incrementing database primary key"),
    id: z.string().uuid().describe("Unique chat room identifier (UUID) for API use"),
    projectId: z.string().uuid().describe("Project identifier this room belongs to"),
    name: z.string().describe("Chat room name"),
    description: z.string().nullable().describe("Chat room description"),
    createdAt: z.string().datetime().describe("When the room was created"),
    updatedAt: z.string().datetime().describe("When the room was last updated"),
  }),
);

/**
 * @description Create chat room request schema.
 */
export const createChatRoomRequestSchema = registry.register(
  "CreateChatRoomRequest",
  z.object({
    projectId: z.string().uuid().describe("Project identifier"),
    name: z.string().min(1).describe("Chat room name"),
    description: z.string().nullable().optional().describe("Chat room description"),
  }),
);

/**
 * @description Chat thread schema.
 */
export const chatThreadSchema = registry.register(
  "ChatThread",
  z.object({
    pk: z.number().int().describe("Auto-incrementing database primary key"),
    id: z.string().uuid().describe("Unique thread identifier (UUID) for API use"),
    chatRoomId: z.string().uuid().describe("Chat room identifier this thread belongs to"),
    subject: z.string().describe("Thread subject/title"),
    createdBy: z.string().describe("Who created the thread"),
    createdAt: z.string().datetime().describe("When the thread was created"),
    updatedAt: z.string().datetime().describe("When the thread was last updated"),
  }),
);

/**
 * @description Create chat thread request schema.
 */
export const createChatThreadRequestSchema = registry.register(
  "CreateChatThreadRequest",
  z.object({
    chatRoomId: z.string().uuid().describe("Chat room identifier"),
    subject: z.string().min(1).describe("Thread subject/title"),
    createdBy: z.string().min(1).describe("Who created the thread"),
  }),
);

/**
 * @description Chat message schema.
 */
export const chatMessageSchema = registry.register(
  "ChatMessage",
  z.object({
    pk: z.number().int().describe("Auto-incrementing database primary key"),
    id: z.string().uuid().describe("Unique message identifier (UUID) for API use"),
    threadId: z.string().uuid().describe("Thread identifier this message belongs to"),
    senderType: z.enum(["user", "ai", "system"]).describe("Type of sender"),
    senderName: z.string().describe("Display name of the sender"),
    senderId: z.string().nullable().describe("Unique ID of the sender"),
    content: z.string().describe("Message content"),
    metadata: z.string().nullable().describe("Additional metadata as JSON string"),
    createdAt: z.string().datetime().describe("When the message was created"),
    updatedAt: z.string().datetime().describe("When the message was last updated"),
  }),
);

/**
 * @description Create chat message request schema.
 */
export const createChatMessageRequestSchema = registry.register(
  "CreateChatMessageRequest",
  z.object({
    threadId: z.string().uuid().describe("Thread identifier"),
    senderType: z.enum(["user", "ai", "system"]).describe("Type of sender"),
    senderName: z.string().min(1).describe("Display name of the sender"),
    senderId: z.string().nullable().optional().describe("Unique ID of the sender"),
    content: z.string().min(1).describe("Message content"),
    metadata: z.record(z.unknown()).nullable().optional().describe("Additional metadata"),
  }),
);

/**
 * @description List projects response schema.
 */
export const listProjectsResponseSchema = registry.register(
  "ListProjectsResponse",
  z.object({
    projects: z.array(projectSchema),
  }),
);

/**
 * @description List chat rooms response schema.
 */
export const listChatRoomsResponseSchema = registry.register(
  "ListChatRoomsResponse",
  z.object({
    rooms: z.array(chatRoomSchema),
  }),
);

/**
 * @description List chat threads response schema.
 */
export const listChatThreadsResponseSchema = registry.register(
  "ListChatThreadsResponse",
  z.object({
    threads: z.array(chatThreadSchema),
  }),
);

/**
 * @description List chat messages response schema.
 */
export const listChatMessagesResponseSchema = registry.register(
  "ListChatMessagesResponse",
  z.object({
    messages: z.array(chatMessageSchema),
  }),
);
