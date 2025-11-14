/**
 * @file This file serves as the central source of truth for all data structures,
 * type aliases, and interfaces used throughout the Cloudflare Worker application.
 *
 * @description
 * This module defines the core types for various domains within the application:
 *
 * 1.  **Environment (`Env`):**
 * - Defines the bindings available to the worker, including D1 databases,
 * Durable Object (DO) namespaces, and the Cloudflare AI service.
 *
 * 2.  **API & RPC (`ApiResponse`, `ApiError`, `RpcMethod`, etc.):**
 * - Specifies the standardized success/error envelopes for Hono API routes.
 * - Defines the structure for JSON-RPC methods, their context, and the
 * registry that holds them.
 *
 * 3.  **ChatRoom & WebSocket (`RoomState`, `AgentConnection`, `FileLock`, etc.):**
 * - Defines the state and communication protocols for the `ChatRoom`
 * Durable Object, which handles real-time agent coordination.
 * - Includes types for WebSocket messages, file locking, and the
 * help/query system.
 *
 * 4.  **Task Management (`TaskRecord`, `TaskSummary`, `TaskBlocker`, etc.):**
 * - Defines the data models for the task-tracking system, including
 * D1 records, API-facing summaries, agent activity, and task blockers.
 * - Includes input types for creating/updating tasks.
 *
 * 5.  **Health & Testing (`SessionSummary`, `TestRunResult`, `HealthSnapshot`, etc.):**
 * - Defines the data models for the automated testing framework, including
 * test definitions, session results, and the overall service health snapshot.
 *
 * 6.  **AI (`AiAnalysisResult`):**
 * - Simple types for AI-generated analysis.
 *
 * @module types
 */

import type { z } from "zod";

/**
 * @description Defines the environment bindings available to the Cloudflare Worker.
 * These are configured in the `wrangler.toml` file.
 */
export interface Env {
  /**
   * @property Binding for serving static assets (e.g., the health check page).
   */
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  /**
   * @property The primary D1 database for persistent, relational data
   * (tasks, test results, message history, etc.).
   */
  DB: D1Database;
  /**
   * @property Durable Object namespace for the original `RoomDO`.
   * @deprecated May be replaced by CHATROOM.
   */
  ROOM_DO: DurableObjectNamespace;
  /**
   * @property Durable Object namespace for the stateful agent room.
   * @see {@link ./durable-objects/AgentRoomDO.ts}
   */
  AGENT_ROOM_DO?: DurableObjectNamespace;
  /**
   * @property Durable Object namespace for the Cloudflare Docs MCP agent.
   * @see {@link ./durable-objects/CloudflareDocsMcpAgent.ts}
   */
  CLOUDFLARE_DOCS_MCP?: DurableObjectNamespace;
  /**
   * @property Durable Object namespace for the primary agent coordination room.
   * @see {@link ./durable-objects/RoomDO.ts}
   */
  CHATROOM: DurableObjectNamespace;
  /**
   * @property Binding for the Cloudflare AI service (Workers AI).
   */
  AI: {
    run<ModelParams = unknown, Result = unknown>(
      model: string,
      input: ModelParams,
    ): Promise<Result>;
  };
}

/**
 * @description Represents an agent's live connection within a Durable Object.
 * This is an in-memory representation and is *not* persisted.
 */
export interface AgentConnection {
  /** @property The unique identifier for the agent. */
  agentId: string;
  /** @property The human-readable name of the agent. */
  agentName: string;
  /** @property The active WebSocket connection object. */
  webSocket: WebSocket;
  /** @property The timestamp (ms) when the agent joined. */
  joinedAt: number;
  /** @property The timestamp (ms) when the agent was last seen. */
  lastSeen: number;
}

/**
 * @description Represents a file lock held by an agent in a coordination room.
 * This state *is* persisted in the Durable Object storage.
 */
export interface FileLock {
  /** @property The canonical path of the file being locked. */
  filePath: string;
  /** @property The type of lock. */
  lockType: "read" | "write" | "create";
  /** @property The ID of the agent holding the lock. */
  agentId: string;
  /** @property The name of the agent holding the lock. */
  agentName?: string;
  /** @property The timestamp (ms) when the lock was granted. */
  timestamp: number;
}

/**
 * @description A generic wrapper for messages sent over a WebSocket.
 * @template T - The type of the `data` payload.
 */
export interface WebSocketMessage<T = unknown> {
  /** @property The message type, used for routing (e.g., 'chat', 'file_lock'). */
  type: string;
  /** @property The message payload. */
  data: T;
  /** @property The timestamp (ms) when the message was created. */
  timestamp: number;
}

/**
 * @description Represents a message logged to the D1 database from a chat room.
 */
export interface AgentMessage {
  /** @property The type of event (e.g., 'chat', 'join', 'leave', 'file_lock'). */
  type: string;
  /** @property The ID of the project where the message originated. */
  projectId: string;
  /** @property The ID of the agent who sent the message. */
  agentId: string;
  /** @property The name of the agent. */
  agentName?: string;
  /** @property The text content of the message (for 'chat' types). */
  content?: string;
  /** @property Any additional structured metadata. */
  metadata?: Record<string, unknown>;
  /** @property The timestamp (ms) when the event occurred. */
  timestamp: number;
}

/**
 * @description Defines a parameter for a `help` command.
 */
export interface CommandParameter {
  /** @property The name of the parameter. */
  name: string;
  /** @property The data type (e.g., 'string', 'object'). */
  type: string;
  /** @property Whether the parameter is required. */
  required?: boolean;
  /** @property A brief description of the parameter. */
  description?: string;
}

/**
 * @description Defines a command available to agents in the `help` response.
 */
export interface Command {
  /** @property The name of the command (e.g., 'file_lock'). */
  name: string;
  /** @property A description of what the command does. */
  description: string;
  /** @property An array of parameters the command accepts. */
  parameters?: CommandParameter[];
  /** @property A JSON string example of how to use the command. */
  example?: string;
}

/**
 * @description Defines an example use case in the `help` response.
 */
export interface Example {
  /** @property The title of the example. */
  title: string;
  /** @property A description of the scenario. */
  description: string;
  /** @property A code snippet demonstrating the example. */
  code: string;
}

/**
 * @description Defines an HTTP endpoint in the `help` response.
 */
export interface EndpointInfo {
  /** @property The URL path for the endpoint. */
  path: string;
  /** @property The HTTP method (e.g., 'GET', 'POST'). */
  method: string;
  /** @property A description of the endpoint. */
  description: string;
}

/**
 * @description Provides information about MCP (Model Context Protocol) integration.
 */
export interface MCPInfo {
  /** @property A general description of the MCP integration. */
  description: string;
  /** @property Step-by-step instructions for setup. */
  setupInstructions: string[];
  /** @property An example configuration string. */
  exampleConfig: string;
}

/**
 * @description The complete payload for a `help` response.
 */
export interface HelpResponse {
  /** @property List of available WebSocket commands. */
  commands: Command[];
  /** @property List of practical examples. */
  examples: Example[];
  /** @property List of available HTTP endpoints. */
  endpoints: EndpointInfo[];
  /** @property Information on MCP integration. */
  mcpInfo: MCPInfo;
}

/**
 * @description Defines filters for a D1 'query' command via WebSocket.
 */
export interface QueryFilters {
  /** @property The maximum number of records to return. */
  limit?: number;
  /** @property The number of records to skip (for pagination). */
  offset?: number;
  /** @property Filter by a specific agent ID. */
  agentId?: string;
  /** @property Filter by a specific file path. */
  filePath?: string;
  /** @property Filter for records created after this timestamp (ms). */
  since?: number;
}

/**
 * @description Defines a 'query' request sent via WebSocket.
 */
export interface QueryRequest {
  /** @property The type of data to query from D1. */
  queryType: "history" | "locks" | "agents" | "file_history" | "rooms";
  /** @property The filters to apply to the query. */
  filters?: QueryFilters;
}

/**
 * @description The response payload for a 'query' request.
 */
export interface QueryResponse {
  /** @property Indicates if the query was successful. */
  success: boolean;
  /** @property The array of results from the D1 database. */
  data: unknown[];
  /** @property The number of records returned. */
  count: number;
  /** @property The original query type. */
  queryType: QueryRequest["queryType"];
}

/**
 * @description The core *in-memory* state of a `ChatRoom` Durable Object.
 * @see {@link ./durable-objects/RoomDO.ts}
 */
export interface RoomState {
  /** @property The ID of the project (from the DO state). */
  projectId: string;
  /** @property The human-readable name of the project. */
  name: string;
  /** @property An optional description. */
  description?: string;
  /**
   * @property In-memory map of *live* WebSocket connections.
   * **Not** persisted to storage.
   */
  agents: Map<string, AgentConnection>;
  /**
   * @property In-memory map of *current* file locks.
   * **Is** persisted to DO storage.
   */
  fileLocks: Map<string, FileLock>;
  /** @property A counter of total messages processed (persisted). */
  messageCount: number;
  /** @property The timestamp (ms) when the room was first created (persisted). */
  createdAt: number;
}

/**
 * @description The context object passed to all JSON-RPC method handlers.
 */
export interface RpcContext {
  /** @property The worker environment bindings. */
  env: Env;
  /** @property The incoming HTTP request object. */
  request: Request;
  /** @property The worker execution context. */
  executionCtx: ExecutionContext;
}

/**
 * @description Defines a single JSON-RPC method, including its schemas and handler.
 * @template ParamsSchema - Zod schema for input parameters.
 * @template ResultSchema - Zod schema for the output/result.
 */
export interface RpcMethod<
  ParamsSchema extends z.ZodTypeAny = z.ZodTypeAny,
  ResultSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  /** @property The name of the method (e.g., 'tasks.create'). */
  method: string;
  /** @property A brief summary for OpenAPI. */
  summary?: string;
  /** @property A detailed description for OpenAPI. */
  description?: string;
  /** @property The Zod schema for validating input parameters. */
  paramsSchema: ParamsSchema;
  /** @property The Zod schema for validating the method's result. */
  resultSchema: ResultSchema;
  /** @property Tags for grouping in OpenAPI. */
  tags?: string[];
  /**
   * @property The async function that implements the method's logic.
   * @param {RpcContext} ctx - The RPC context.
   * @param {z.infer<ParamsSchema>} params - The validated input parameters.
   * @returns {Promise<z.infer<ResultSchema>>} The validated result.
   */
  handler: (
    ctx: RpcContext,
    params: z.infer<ParamsSchema>,
  ) => Promise<z.infer<ResultSchema>>;
}

/**
 * @description A record mapping method names to their `RpcMethod` definitions.
 * This is the central registry for all RPC and MCP tools.
 * @see {@link ./endpoints/rpc/handler.ts}
 */
export type RpcRegistry = Record<string, RpcMethod<any, any>>;

/**
 * @description The status of an individual test run.
 */
export type TestStatus = "pass" | "fail";

/**
 * @description The raw record structure for a test definition in the D1 database.
 */
export interface TestDefinitionRecord {
  id: string;
  name: string;
  description: string;
  category?: string | null;
  severity?: string | null;
  /** @property Stored as a number (0 or 1) in D1. */
  is_active: number;
  /** @property A JSON string mapping error codes to descriptions. (Legacy field) */
  error_map?: string | null;
  /** @property A JSON string mapping error codes to their meanings. */
  error_meanings_json?: string | null;
  /** @property A JSON string mapping error codes to solution paths. */
  error_solutions_json?: string | null;
  /** @property Additional context for AI models. */
  metadata?: string | null;
  created_at: string;
}

/**
 * @description A normalized, application-friendly version of a test definition.
 */
export interface NormalizedTestDefinition {
  id: string;
  name: string;
  description: string;
  category?: string | null;
  severity?: string | null;
  createdAt: string;
  /** @property Converted from a number to a boolean. */
  isActive: boolean;
  /** @property Parsed from a JSON string into an object. (Legacy field) */
  errorMap: Record<string, { meaning: string; fix: string }>;
  /** @property Parsed from error_meanings_json - mapping of error codes to meanings. */
  errorMeaningsJson?: Record<string, { meaning: string }>;
  /** @property Parsed from error_solutions_json - mapping of error codes to solution paths. */
  errorSolutionsJson?: Record<string, { fix: string }>;
  /** @property Additional context for AI models. */
  metadata?: string | null;
}

/**
 * @description The raw record structure for a test result in the D1 database.
 */
export interface TestResultRecord {
  id: string;
  session_uuid: string;
  test_fk: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: TestStatus;
  error_code: string | null;
  /** @property A JSON string of the raw error or response. */
  raw: string | null;
  /** @property An AI-generated explanation of the error. */
  ai_human_readable_error_description: string | null;
  /** @property An AI-generated prompt to help fix the error. */
  ai_prompt_to_fix_error: string | null;
  created_at: string;
}

/**
 * @description A combined object representing a single test run's result,
 * linking the definition with the result record.
 */
export interface TestRunResult {
  /** @property The definition of the test that was run. */
  definition: NormalizedTestDefinition;
  /** @property The final status (pass/fail). */
  status: TestStatus;
  /** @property The duration of the test in milliseconds. */
  durationMs: number;
  /** @property The specific error code, if the test failed. */
  errorCode?: string;
  /** @property The parsed raw error or response. */
  raw?: unknown;
  /** @property The AI-generated error description. */
  aiDescription?: string;
  /** @property The AI-generated fix prompt. */
  aiFixPrompt?: string;
}

/**
 * @description A summary of a complete test session (one run of all tests).
 */
export interface SessionSummary {
  /** @property The unique ID for this entire test session. */
  sessionUuid: string;
  /** @property The timestamp when the session started. */
  startedAt: string;
  /** @property The timestamp when the session finished. */
  finishedAt?: string;
  /** @property The total number of tests run. */
  total: number;
  /** @property The number of tests that passed. */
  passed: number;
  /** @property The number of tests that failed. */
  failed: number;
  /** @property The total duration of the session in milliseconds. */
  durationMs?: number;
  /** @property An array of all individual test run results. */
  results: TestRunResult[];
}

/**
 * @description The payload for the `GET /api/health` endpoint.
 */
export interface HealthSnapshot {
  /** @property The number of seconds the worker has been running. */
  uptimeSeconds: number;
  /** @property The summary of the most recent test session. */
  lastSession?: SessionSummary;
  /** @property The overall service status based on the last session. */
  status: "healthy" | "degraded" | "failing";
}

/**
 * @description A standardized *successful* API response envelope.
 * @template T - The type of the `data` payload.
 */
export interface ApiResponse<T> {
  /** @property Always `true` for a successful response. */
  success: true;
  /** @property The data payload. */
  data: T;
  /** @property Optional metadata (e.g., pagination). */
  meta?: Record<string, unknown>;
}

/**
 * @description A standardized *failed* API response envelope.
 */
export interface ApiError {
  /** @property Always `false` for a failed response. */
  success: false;
  /** @property The error payload. */
  error: {
    /** @property An internal error code (e.g., "TASK_NOT_FOUND"). */
    code: string;
    /** @property A human-readable error message. */
    message: string;
    /** @property Optional details (e.g., Zod validation errors). */
    details?: unknown;
  };
}

/**
 * @description A union type representing any possible API response.
 * @template T - The type of the `data` payload for a successful response.
 */
export type ApiEnvelope<T> = ApiResponse<T> | ApiError;

/**
 * @description The result of the OpenAPI document generation utility.
 */
export interface OpenAPIGenerationResult {
  /** @property The OpenAPI specification as a JSON object. */
  json: unknown;
  /** @property The OpenAPI specification as a YAML string. */
  yaml: string;
}


/**
 * @description The raw record structure for a task in the D1 database.
 */
export interface TaskRecord {
  id: string;
  project_id: string;
  epic_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_agent: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  requires_human_review: number;
  human_review_reason: string | null;
  human_review_response: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * @description A normalized, application-friendly (camelCase) version of a task.
 */
export interface TaskSummary {
  id: string;
  projectId: string;
  epicId?: string | null;
  parentTaskId?: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgent: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  requiresHumanReview?: boolean;
  humanReviewReason?: string | null;
  humanReviewResponse?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * @description The D1 record for an agent's last reported activity.
 */
export interface AgentActivity {
  agentName: string;
  status: AgentStatusType;
  taskId?: string | null;
  note?: string | null;
  lastCheckIn: string;
  updatedAt: string;
}

/**
 * @description The D1 record for a task blocker.
 */
export interface TaskBlocker {
  id: string;
  taskId: string;
  /** @property The agent who is blocked. */
  blockedAgent: string;
  /** @property The agent/human who can resolve the block. */
  blockingOwner?: string | null;
  /** @property The reason for the block. */
  reason?: string | null;
  /** @property Whether the owner has acknowledged the block. */
  acked: boolean;
  /** @property The timestamp of the last notification sent. */
  lastNotified?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * @description The raw record structure for an agent status in the D1 database.
 */
export interface AgentStatusRecord {
  id: string;
  projectId: string;
  agentName: string;
  status: string;
  currentTaskId?: string | null;
  lastActivity: string;
  statusMessage?: string | null;
  requiresAttention: number;
  attentionReason?: string | null;
  updatedAt: string;
}

/**
 * @description Task counts by status.
 */
export interface TaskCounts {
  pending: number;
  in_progress: number;
  blocked: number;
  done: number;
  backlog: number;
  todo: number;
  review: number;
  cancelled: number;
  on_hold: number;
  total: number;
}

/**
 * @description The payload for the `GET /api/tasks/stats` endpoint.
 */
export interface TaskStatsSnapshot {
  /** @property Aggregate counts of tasks by status. */
  counts: TaskCounts;
  /** @property A list of the latest activity for each known agent. */
  agentActivity: AgentActivity[];
  /** @property A list of all currently active (unresolved) blockers. */
  blocked: TaskBlocker[];
}

/**
 * @description Optional filters for querying tasks.
 * @see {@link ./utils/tasks.ts}
 */
export interface TaskFilterOptions {
  /** @property Filter by assigned agent name. */
  agent?: string;
  /** @property Filter by project. */
  projectId?: string;
  /** @property Filter by epic. */
  epicId?: string;
  /** @property Filter by parent task. */
  parentTaskId?: string;
  /** @property Filter by task status. */
  status?: TaskStatus;
  /** @property Filter by full-text search. */
  search?: string;
  /** @property Filter by a specific list of task IDs. */
  taskIds?: string[];
}

/**
 * @description Input structure for bulk task status updates.
 */
export interface TaskStatusUpdateInput {
  /** @property The ID of the task to update. */
  taskId: string;
  /** @property The new status to set. */
  status: TaskStatus;
}


/**
 * @description Input payload for an agent check-in.
 * @see {@link ./schemas/apiSchemas.ts}
 */
export interface AgentCheckInInput {
  /** @property The name of the agent checking in. */
  agentName: string;
  /** @property The current status of the agent. */
  status: AgentStatusType;
  /** @property The task the agent is currently working on, if any. */
  taskId?: string | null;
  /** @property An optional note from the agent. */
  note?: string | null;
}

/**
 * @description Input payload for blocking a task.
 * @see {@link ./schemas/apiSchemas.ts}
 */
export interface TaskBlockInput {
  /** @property The task that is blocked. */
  taskId: string;
  /** @property The agent who is blocked. */
  blockedAgent: string;
  /** @property The owner responsible for unblocking. */
  blockingOwner?: string | null;
  /** @property The reason for the block. */
  reason?: string | null;
}

/**
 * @description Input payload for unblocking a task.
 * @see {@link ./schemas/apiSchemas.ts}
 */
export interface TaskUnblockInput {
  /** @property The task that was blocked. */
  taskId: string;
  /** @property The agent who was blocked. */
  blockedAgent: string;
  /** @property The agent/human who resolved the block. */
  resolvedBy?: string | null;
  /** @property An optional note about the resolution. */
  note?: string | null;
}

/**
 * @description A generic WebSocket message structure (alternative format).
 * @template T - The type of the `payload`.
 */
export interface WsMessage<T = unknown> {
  /** @property The message type for routing. */
  type: string;
  /** @property The message payload. */
  payload: T;
  /** @property An optional ID to correlate requests and responses. */
  requestId?: string;
  /** @property Optional metadata. */
  meta?: Record<string, unknown>;
}

/**
 * @description Metadata sent to a client upon connecting to a `WsRoom`.
 */
export interface WsRoomMeta {
  /** @property The ID of the room. */
  roomId: string;
  /** @property The timestamp of the connection. */
  connectedAt: string;
  /** @property The number of other peers in the room. */
  peers: number;
  /** @property The name of the agent, if provided. */
  agentName?: string;
  /** @property The last seen timestamp, if reconnected. */
  lastSeen?: string;
}

// --- Project Management Types ---

/**
 * @description Epic status values.
 */
export type EpicStatus = "planning" | "active" | "completed" | "cancelled";

/**
 * @description Task priority levels.
 */
export type TaskPriority = "low" | "medium" | "high" | "critical";

/**
 * @description Task status values (expanded from basic).
 */
export type TaskStatus =
  | "pending"
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "blocked"
  | "done"
  | "cancelled"
  | "on_hold";

/**
 * @description Dependency relationship types.
 */
export type DependencyType = "blocks" | "requires" | "suggests";

/**
 * @description Blockage severity levels.
 */
export type BlockageSeverity = "low" | "medium" | "high" | "critical";

/**
 * @description Agent status types (expanded).
 */
export type AgentStatusType =
  | "offline"
  | "available"
  | "busy"
  | "in_progress"
  | "blocked"
  | "awaiting_human"
  | "done"
  | "error";

/**
 * @description An epic record from the database.
 * @see {@link ./utils/db.ts}
 */
export interface Epic {
  /** @property Unique identifier for the epic. */
  id: string;
  /** @property Project identifier for isolation. */
  projectId?: string;
  /** @property Human-readable title. */
  title: string;
  /** @property Optional detailed description. */
  description?: string | null;
  /** @property Current status of the epic. */
  status: EpicStatus;
  /** @property Priority level. */
  priority: TaskPriority;
  /** @property Agent assigned to the epic. */
  assignedAgent?: string | null;
  /** @property Target completion date. */
  targetCompletion?: string | null;
  /** @property When the epic was created. */
  createdAt: string;
  /** @property When the epic was last updated. */
  updatedAt: string;
}

/**
 * @description A task record from the database (expanded).
 * @see {@link ./utils/db.ts}
 */
export interface Task {
  /** @property Unique identifier for the task. */
  id: string;
  /** @property Project identifier for isolation. */
  projectId: string;
  /** @property Associated epic ID. */
  epicId?: string | null;
  /** @property Parent task ID for subtasks. */
  parentTaskId?: string | null;
  /** @property Human-readable title. */
  title: string;
  /** @property Optional detailed description. */
  description?: string | null;
  /** @property Current status of the task. */
  status: TaskStatus;
  /** @property Priority level. */
  priority: TaskPriority;
  /** @property Agent assigned to the task. */
  assignedAgent?: string | null;
  /** @property Estimated hours to complete. */
  estimatedHours?: number | null;
  /** @property Actual hours spent. */
  actualHours?: number | null;
  /** @property Whether this task requires human review. */
  requiresHumanReview: boolean;
  /** @property Reason for human review. */
  humanReviewReason?: string | null;
  /** @property Human review response. */
  humanReviewResponse?: string | null;
  /** @property When the task was created. */
  createdAt: string;
  /** @property When the task was last updated. */
  updatedAt: string;
}

/**
 * @description A task dependency record.
 * @see {@link ./utils/db.ts}
 */
export interface TaskDependency {
  /** @property Unique identifier. */
  id: string;
  /** @property Project identifier for isolation. */
  projectId: string;
  /** @property Task that depends on another. */
  dependentTaskId: string;
  /** @property Task that must be completed first. */
  dependencyTaskId: string;
  /** @property Type of dependency. */
  dependencyType: DependencyType;
  /** @property When the dependency was created. */
  createdAt: string;
}

/**
 * @description A task blockage record (expanded).
 * @see {@link ./utils/db.ts}
 */
export interface TaskBlockage {
  /** @property Unique identifier. */
  id: string;
  /** @property Project identifier for isolation. */
  projectId: string;
  /** @property Task that is blocked. */
  taskId: string;
  /** @property Agent who is blocked. */
  blockedAgent: string;
  /** @property Owner responsible for unblocking. */
  blockingOwner?: string | null;
  /** @property Reason for the blockage. */
  reason: string;
  /** @property Severity of the blockage. */
  severity: BlockageSeverity;
  /** @property Whether human intervention is required. */
  requiresHumanIntervention: boolean;
  /** @property Reason for human intervention. */
  humanInterventionReason?: string | null;
  /** @property When the blockage was resolved. */
  resolvedAt?: string | null;
  /** @property Who resolved the blockage. */
  resolvedBy?: string | null;
  /** @property Resolution note. */
  resolutionNote?: string | null;
  /** @property Whether the blockage has been acknowledged. */
  acked: boolean;
  /** @property When the agent was last notified. */
  lastNotified?: string | null;
  /** @property When the blockage was created. */
  createdAt: string;
  /** @property When the blockage was last updated. */
  updatedAt: string;
}

/**
 * @description Agent status tracking record.
 * @see {@link ./utils/db.ts}
 */
export interface AgentStatus {
  /** @property Unique identifier. */
  id: string;
  /** @property Project identifier for isolation. */
  projectId: string;
  /** @property Agent name. */
  agentName: string;
  /** @property Current status. */
  status: AgentStatusType;
  /** @property Current task being worked on. */
  currentTaskId?: string | null;
  /** @property Last activity timestamp. */
  lastActivity: string;
  /** @property Status message. */
  statusMessage?: string | null;
  /** @property Whether the agent requires attention. */
  requiresAttention: boolean;
  /** @property Reason for requiring attention. */
  attentionReason?: string | null;
  /** @property When the status was last updated. */
  updatedAt: string;
}

/**
 * @description Input for creating a new epic.
 */
export interface CreateEpicInput {
  projectId: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  assignedAgent?: string | null;
  targetCompletion?: string | null;
}

/**
 * @description Input for creating a new task (expanded).
 */
export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  assignedAgent?: string | null;
  epicId?: string | null;
  parentTaskId?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  requiresHumanReview?: boolean;
  humanReviewReason?: string | null;
}

/**
 * @description Bulk task creation input.
 */
export interface BulkCreateTasksInput {
  projectId: string;
  epicId?: string | null;
  tasks: CreateTaskInput[];
  dependencies?: Array<{
    dependentTaskIndex: number;
    dependencyTaskIndex: number;
    dependencyType?: DependencyType;
  }>;
}

/**
 * @description Input for creating task dependencies.
 */
export interface CreateTaskDependencyInput {
  projectId: string;
  dependentTaskId: string;
  dependencyTaskId: string;
  dependencyType?: DependencyType;
}

/**
 * @description Input for creating task blockages (expanded).
 */
export interface CreateTaskBlockageInput {
  projectId: string;
  taskId: string;
  blockedAgent: string;
  blockingOwner?: string | null;
  reason: string;
  severity?: BlockageSeverity;
  requiresHumanIntervention?: boolean;
  humanInterventionReason?: string | null;
}

/**
 * @description Input for updating agent status.
 */
export interface UpdateAgentStatusInput {
  projectId: string;
  agentName: string;
  status: AgentStatusType;
  currentTaskId?: string | null;
  statusMessage?: string | null;
  requiresAttention?: boolean;
  attentionReason?: string | null;
}

/**
 * @description Human review response input.
 */
export interface HumanReviewResponseInput {
  projectId: string;
  taskId: string;
  response: string;
  approved: boolean;
}

/**
 * @description Message types for WebSocket communication and logging.
 */
export type MessageType = "chat" | "broadcast" | "alarm" | "system" | "task_update" | "agent_status" | "human_review";

/**
 * @description Sender types for messages.
 */
export type SenderType = "user" | "agent" | "system";

/**
 * @description Thread information for conversation threading.
 * @see {@link ./utils/db.ts}
 */
export interface Thread {
  /** @property Auto-incrementing database ID. */
  id: number;
  /** @property Project/room identifier. */
  projectId: string;
  /** @property Unique thread identifier (UUID). */
  threadId: string;
  /** @property Thread subject/title. */
  subject: string;
  /** @property Who created the thread. */
  createdBy: string;
  /** @property When the thread was created. */
  createdAt: string;
  /** @property When the thread was last updated. */
  updatedAt: string;
}

/**
 * @description WebSocket message log entry.
 * @see {@link ./utils/db.ts}
 */
export interface MessageLog {
  /** @property Auto-incrementing database ID. */
  id: number;
  /** @property Unique message identifier (UUID). */
  messageId: string;
  /** @property Project identifier. */
  projectId: string;
  /** @property Thread identifier for conversation threading. */
  threadId?: string | null;
  /** @property ID of the message this is replying to. */
  replyToMessageId?: string | null;
  /** @property Type of message. */
  messageType: MessageType;
  /** @property Type of sender. */
  senderType: SenderType;
  /** @property Display name of the sender. */
  senderName: string;
  /** @property Unique ID of the sender. */
  senderId?: string | null;
  /** @property Associated epic ID. */
  epicId?: string | null;
  /** @property Associated task ID. */
  taskId?: string | null;
  /** @property Message content. */
  content: string;
  /** @property Additional metadata as JSON string. */
  metadata?: string | null;
  /** @property Message timestamp. */
  timestamp: string;
  /** @property Database creation timestamp. */
  createdAt: string;
}

/**
 * @description Input for logging a message.
 */
export interface LogMessageInput {
  projectId: string;
  threadId?: string | null;
  replyToMessageId?: string | null;
  messageType: MessageType;
  senderType: SenderType;
  senderName: string;
  senderId?: string | null;
  epicId?: string | null;
  taskId?: string | null;
  content: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * @description Project record with auto-increment pk and UUID project_id.
 */
export interface Project {
  /** @property Unique project identifier (UUID). */
  id: string;
  /** @property Project title. */
  title: string;
  /** @property Project description. */
  description?: string | null;
  /** @property Project status. */
  status: string;
  /** @property Project priority. */
  priority: string;
  /** @property Assigned agent. */
  assignedAgent?: string | null;
  /** @property Target completion date. */
  targetCompletion?: string | null;
  /** @property When the project was created. */
  createdAt: string;
  /** @property When the project was last updated. */
  updatedAt: string;
}

/**
 * @description Chat room record linked to a project.
 */
export interface ChatRoom {
  /** @property Auto-incrementing database primary key. */
  pk: number;
  /** @property Unique chat room identifier (UUID) for API use. */
  id: string;
  /** @property Project identifier this room belongs to. */
  projectId: string;
  /** @property Chat room name. */
  name: string;
  /** @property Chat room description. */
  description?: string | null;
  /** @property When the room was created. */
  createdAt: string;
  /** @property When the room was last updated. */
  updatedAt: string;
}

/**
 * @description Chat thread record linked to a chat room.
 */
export interface ChatThread {
  /** @property Auto-incrementing database primary key. */
  pk: number;
  /** @property Unique thread identifier (UUID) for API use. */
  id: string;
  /** @property Chat room identifier this thread belongs to. */
  chatRoomId: string;
  /** @property Thread subject/title. */
  subject: string;
  /** @property Who created the thread. */
  createdBy: string;
  /** @property When the thread was created. */
  createdAt: string;
  /** @property When the thread was last updated. */
  updatedAt: string;
}

/**
 * @description Chat message record linked to a thread.
 */
export interface ChatMessage {
  /** @property Auto-incrementing database primary key. */
  pk: number;
  /** @property Unique message identifier (UUID) for API use. */
  id: string;
  /** @property Thread identifier this message belongs to. */
  threadId: string;
  /** @property Type of sender: user, ai, or system. */
  senderType: "user" | "ai" | "system";
  /** @property Display name of the sender. */
  senderName: string;
  /** @property Unique ID of the sender. */
  senderId?: string | null;
  /** @property Message content. */
  content: string;
  /** @property Additional metadata as JSON string. */
  metadata?: string | null;
  /** @property When the message was created. */
  createdAt: string;
  /** @property When the message was last updated. */
  updatedAt: string;
}

/**
 * @description Search filters for message logs.
 */
export interface MessageSearchFilters {
  projectId: string;
  threadId?: string;
  epicId?: string;
  taskId?: string;
  senderName?: string;
  senderType?: SenderType;
  messageType?: MessageType;
  content?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * @description Search results for message logs.
 */
export interface MessageSearchResults {
  messages: MessageLog[];
  total: number;
  hasMore: boolean;
}

/**
 * @description Thread information for message threading.
 */
export interface MessageThread {
  threadId: string;
  projectId: string;
  epicId?: string | null;
  taskId?: string | null;
  messageCount: number;
  lastMessageAt: string;
  participants: string[];
}

/**
 * @description A standardized structure for AI analysis results.
 */
export interface AiAnalysisResult {
  /** @property A human-readable description of the analysis. */
  description: string;
  /** @property A prompt that can be used to (re)generate or fix. */
  fixPrompt: string;
  /** @property The raw output from the AI model. */
  raw?: unknown;
}
