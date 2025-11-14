/**
 * @file This file defines the `AgentRoomDO`, a stateful Durable Object (DO)
 * designed for advanced AI agent coordination and state management.
 *
 * @description
 * This DO extends the concepts of a simple chat room by integrating
 * patterns from the Cloudflare Agents SDK. It provides a stateful,
 * single-threaded environment where multiple AI agents can connect via
 * WebSockets to collaborate.
 *
 * Its core responsibilities include:
 * 1.  **WebSocket Connection Management**: Handles the lifecycle of agent
 * WebSocket connections, including heartbeats.
 * 2.  **Persistent State**: Uses DO storage (`ctx.storage`) to maintain
 * persistent `RoomState`, including agent preferences and query history.
 * 3.  **Task Orchestration**: Acts as a real-time API for task management.
 * Agents can create, query, and update tasks, with changes
 * broadcast to all peers.
 * 4.  **AI Tool Execution**: Serves as a proxy for AI tool calls. The
 * `docs.query` message handler executes a tool against another
 * MCP-enabled agent (`executeCloudflareDocsTool`).
 * 5.  **Proactive Coordination**: Manages coordination patterns, such as
 * broadcasting summaries of blocked tasks and actively pinging agents
 * to acknowledge unblocked tasks.
 * 6.  **External Event Injection**: Exposes an HTTP `/broadcast` endpoint
 * to allow the main worker (or other systems) to inject events
 * (like `tasks.blocked`) into the room.
 *
 * @module AgentRoomDO
 */

// --- Imports ---

import { z } from "zod";
import {
  broadcast,
  buildFrame,
  deserializeMessage,
  serializeMessage,
} from "../utils/ws";
import type {
  Env,
  TaskBlocker,
  TaskSummary,
  TaskStatus,
  WsMessage,
  WsRoomMeta,
  CreateTaskInput,
} from "../types";
import {
  // Database utilities
  ackTaskBlock,
  bulkReassignTasks,
  bulkUpdateTaskStatuses,
  createTask as createTaskRecord,
  getTaskById,
  getTaskCounts,
  listAgentActivity,
  listBlockedTasks,
  listOpenTasks,
  listTasks,
  touchBlockLastNotified,
} from "../utils/db";
import {
  // Zod schemas for validation
  bulkReassignRequestSchema,
  bulkStatusUpdateRequestSchema,
  createTaskRequestSchema,
  singleStatusUpdateRequestSchema,
} from "../schemas/apiSchemas";
import { executeCloudflareDocsTool } from "../agents/tools/mcp/cloudflareDocs";

// --- Constants ---

/** Interval for sending keep-alive pings to all connected clients. */
const HEARTBEAT_INTERVAL_MS = 30_000;
/** Interval for proactively broadcasting the list of blocked tasks. */
const BLOCKED_SUMMARY_INTERVAL_MS = 20_000;
/** Interval for reminding an agent to acknowledge an unblocked task. */
const UNBLOCK_PING_INTERVAL_MS = 10_000;

// --- Zod Schemas for WebSocket Messages ---

const registerAgentSchema = z.object({ agentName: z.string().min(1) });
const ackUnblockSchema = z.object({
  taskId: z.string().uuid(),
  agentName: z.string().min(1),
});
const statsRequestSchema = z.object({ scope: z.string().optional() }).optional();
const docsQuerySchema = z.object({
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
    .optional(),
});

const fetchByAgentSchema = z.object({ agent: z.string().min(1) });
const fetchByIdSchema = z.object({ id: z.string().uuid() });
const fetchBySearchSchema = z.object({ query: z.string().min(1) });
const fetchOpenSchema = z.object({});

// --- Utility Functions ---

/**
 * Normalizes a `TaskSummary` (from DB) into the wire format for WebSocket payloads.
 * @param {TaskSummary} task - The task summary object from the database.
 * @returns {object} A plain object matching the API task schema.
 */
const toTaskPayload = (task: TaskSummary) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  status: task.status,
  priority: task.priority,
  assignedAgent: task.assignedAgent,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

/**
 * Creates a unique key for managing acknowledgment timers.
 * @param {string} agentName - The name of the agent.
 * @param {string} taskId - The ID of the task.
 * @returns {string} A unique key for the `ackTimers` map.
 */
const ackKey = (agentName: string, taskId: string) =>
  `${agentName}::${taskId}`;

// --- Persistent Room State Interface ---

/**
 * @description Defines the shape of the state object that is
 * persistently saved to Durable Object storage.
 * This represents the "memory" of the agent room itself.
 */
interface RoomState {
  roomId: string;
  initialized: boolean;
  createdAt: string;
  lastActivity: string;
  /** Stores AI-related preferences per agent (e.g., preferred doc topics). */
  agentPreferences: Record<
    string,
    { preferredTopics: string[]; lastQuery?: string }
  >;
  /** Stores the history of AI queries made in this room. */
  queryHistory: Array<{ query: string; topic?: string; timestamp: string }>;
  /** Stores a log of successful (or failed) coordination patterns (e.g., "unblock_ack"). */
  coordinationPatterns: Array<{
    pattern: string;
    timestamp: string;
    success: boolean;
  }>;
}

// --- Durable Object Class ---

/**
 * @class AgentRoomDO
 * @description Implements a stateful Durable Object for coordinating
 * multiple AI agents. It uses the "Agent SDK" pattern of persisting
 * its primary state object (`RoomState`) to DO storage, while managing
 * ephemeral WebSocket connections (`connections`) in memory.
 */
export class AgentRoomDO {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;

  /**
   * @property In-memory map of *active* WebSocket connections.
   * This is ephemeral and is rebuilt as agents connect.
   * `WebSocket` -> `WsRoomMeta`
   */
  private readonly connections = new Map<WebSocket, WsRoomMeta>();

  /** @property Timer for the `system.heartbeat` broadcast. */
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  /** @property Timer for the `tasks.blockedSummary` broadcast. */
  private blockedSummaryTimer: ReturnType<typeof setInterval> | undefined;
  /**
   * @property In-memory map of active `setInterval` timers for unblock reminders.
   * `ackKey` -> `Timer`
   */
  private ackTimers = new Map<string, ReturnType<typeof setInterval>>();

  /**
   * Creates an instance of the AgentRoomDO.
   * @param {DurableObjectState} ctx - The Durable Object state and storage context.
   * @param {Env} env - The worker's environment bindings.
   */
  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  // --- State Management (Agent SDK Pattern) ---

  /**
   * Retrieves the persistent `RoomState` from DO storage.
   * @template T - The expected type of the state (defaults to `RoomState`).
   * @returns {Promise<T | null>} The parsed state object or null if not found.
   */
  private async getState<T>(): Promise<T | null> {
    const state = await this.ctx.storage.get<T>("roomState");
    return state ?? null;
  }

  /**
   * Persists the `RoomState` object to DO storage.
   * @template T - The type of the state object to save.
   * @param {T} state - The state object to persist.
   */
  private async setState<T>(state: T): Promise<void> {
    await this.ctx.storage.put("roomState", state);
  }

  // --- Durable Object Entry Points ---

  /**
   * The main HTTP entry point for the Durable Object.
   * Handles WebSocket upgrades and the `/broadcast` endpoint.
   * @param {Request} request - The incoming HTTP request.
   * @returns {Promise<Response>}
   */
  async fetch(request: Request) {
    const url = new URL(request.url);

    /**
     * @description
     * **HTTP Broadcast Endpoint**:
     * Allows external systems (like the main API worker) to inject
     * events into this room, which are then broadcast to all
     * connected agents.
     * e.g., POST /broadcast with body `{"type": "tasks.blocked", ...}`
     */
    if (request.method === "POST" && url.pathname.endsWith("/broadcast")) {
      return this.handleBroadcast(request);
    }

    // Standard WebSocket upgrade handshake
    if (
      request.method !== "GET" ||
      request.headers.get("Upgrade") !== "websocket"
    ) {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Pass the server-side socket to the DO runtime to manage
    this.ctx.acceptWebSocket(server);

    // Return the client-side socket to the user
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // --- WebSocket Lifecycle Handlers ---

  /**
   * Called by the DO runtime when a new WebSocket is accepted.
   * @param {WebSocket} ws - The server-side WebSocket connection.
   */
  async webSocketOpen(ws: WebSocket) {
    // 1. Initialize persistent state if this is the first agent
    const state = await this.getState<RoomState>();
    if (!state || !state.initialized) {
      await this.setState<RoomState>({
        roomId: this.ctx.id.toString(),
        initialized: true,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        agentPreferences: {},
        queryHistory: [],
        coordinationPatterns: [],
      });
    }

    // 2. Create in-memory metadata for this connection
    const meta: WsRoomMeta = {
      roomId: this.ctx.id.toString(),
      connectedAt: new Date().toISOString(),
      peers: this.connections.size + 1,
    };
    this.connections.set(ws, meta);

    // 3. Send a welcome message to the connecting client
    ws.send(
      serializeMessage(
        buildFrame("system.welcome", {
          meta,
          message: "Connected to collaborative agent room with AI capabilities",
        }),
      ),
    );

    // 4. Broadcast the new peer count to all clients
    this.broadcastState();

    // 5. Start timers if this is the first connection
    this.ensureHeartbeat();
    this.ensureBlockedSummary();

    // 6. Send an immediate summary of blocked tasks
    this.ctx.waitUntil(this.broadcastBlockedSummary());
  }

  /**
   * Called by the DO runtime when a message is received.
   * @param {WebSocket} ws - The socket that sent the message.
   * @param {ArrayBuffer | string} data - The message payload.
   */
  async webSocketMessage(ws: WebSocket, data: ArrayBuffer | string) {
    const text =
      typeof data === "string" ? data : new TextDecoder().decode(data);
    const message = deserializeMessage(text);

    // Update lastSeen timestamp for this agent
    const meta = this.connections.get(ws);
    if (meta) {
      meta.lastSeen = new Date().toISOString();
    }

    // Handle low-latency ping/pong directly
    if (message.type === "ping") {
      ws.send(
        serializeMessage(
          buildFrame(
            "pong",
            { now: new Date().toISOString() },
            undefined,
            message.requestId,
          ),
        ),
      );
      return;
    }

    // Defer all other message handling to not block the event loop
    this.ctx.waitUntil(this.handleMessage(ws, message));
  }

  /**
   * Called by the DO runtime when a WebSocket closes.
   * @param {WebSocket} ws - The socket that closed.
   */
  webSocketClose(ws: WebSocket) {
    // 1. Remove from in-memory connection map
    this.connections.delete(ws);
    // 2. Broadcast new peer count to remaining clients
    this.broadcastState();
    // 3. If no clients are left, clear timers
    if (this.connections.size === 0) {
      this.clearHeartbeat();
      this.clearBlockedSummary();
      // Note: ackTimers are left to run, they will just fail silently
      // A more robust system might clear them on a per-agent-disconnect basis
    }
  }

  /**
   * Called by the DO runtime on a WebSocket error.
   * @param {WebSocket} ws - The socket that errored.
   * @param {unknown} error - The error object.
   */
  webSocketError(ws: WebSocket, error: unknown) {
    console.error("Room websocket error", error);
    ws.close(1011, "Internal error");
    this.connections.delete(ws);
    this.broadcastState();
  }

  // --- Primary Message Router ---

  /**
   * The main message router. Called by `webSocketMessage`.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleMessage(ws: WebSocket, message: WsMessage) {
    try {
      // Route message based on type
      switch (message.type) {
        // Agent & AI
        case "agents.register":
          await this.handleAgentRegister(ws, message);
          break;
        case "agents.requestStats":
          await this.handleStatsRequest(ws, message);
          break;
        case "agents.ackUnblock":
          await this.handleAckUnblock(ws, message);
          break;
        case "docs.query":
          await this.handleDocsQuery(ws, message);
          break;

        // Task Read Operations
        case "tasks.fetchByAgent":
          await this.handleFetchByAgent(ws, message);
          break;
        case "tasks.fetchById":
          await this.handleFetchById(ws, message);
          break;
        case "tasks.search":
          await this.handleSearch(ws, message);
          break;
        case "tasks.fetchOpen":
          await this.handleFetchOpen(ws, message);
          break;

        // Task Write Operations
        case "tasks.bulkReassign":
          await this.handleBulkReassign(ws, message);
          break;
        case "tasks.bulkUpdateStatus":
          await this.handleBulkStatus(ws, message);
          break;
        case "tasks.updateStatus":
          await this.handleSingleStatus(ws, message);
          break;
        case "tasks.create":
          await this.handleCreateTask(ws, message);
          break;

        // Fallback: simple broadcast
        default:
          this.forwardMessage(message);
      }
    } catch (error) {
      console.error("Task message failed", error);
      // Send a specific error response to the requestor
      ws.send(
        serializeMessage(
          buildFrame(
            "tasks.error",
            {
              code: "TASKS_HANDLE_FAILED",
              message: error instanceof Error ? error.message : "Unknown error",
            },
            undefined,
            message.requestId,
          ),
        ),
      );
    }
  }

  // --- AI & Agent Handlers ---

  /**
   * Handles `docs.query` (AI Tool Call).
   * 1. Validates payload.
   * 2. Saves query to persistent `RoomState.queryHistory`.
   * 3. Executes the AI tool call (`executeCloudflareDocsTool`).
   * 4. Saves agent preferences to persistent `RoomState.agentPreferences`.
   * 5. Sends `docs.queryResult` back to the requestor.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleDocsQuery(ws: WebSocket, message: WsMessage) {
    const payload = docsQuerySchema.parse(message.payload ?? {});

    // 1. Record query in persistent state history
    let currentState = (await this.getState<RoomState>())!; // Already init'd in webSocketOpen
    const queryHistory = currentState.queryHistory || [];
    queryHistory.push({
      query: payload.query,
      topic: payload.topic,
      timestamp: new Date().toISOString(),
    });

    const updatedState: RoomState = {
      ...currentState,
      queryHistory: queryHistory.slice(-100), // Keep last 100 queries
      lastActivity: new Date().toISOString(),
    };
    await this.setState<RoomState>(updatedState);

    try {
      // 2. Execute the AI tool call via the MCP client
      const toolResult = await executeCloudflareDocsTool(
        this.env as Env,
        "mcp-cloudflare-docs", // Target MCP agent name
        {
          query: payload.query,
          topic: payload.topic || "general",
          maxResults: 5,
        },
      );

      // 3. Extract the result (assuming MCP tool returns JSON string in content)
      const result = JSON.parse(toolResult.content[0].text);

      // 4. Update agent preferences in persistent state
      const meta = this.connections.get(ws);
      if (meta?.agentName) {
        const prefsState = (await this.getState<RoomState>())!;
        const preferences = prefsState.agentPreferences[meta.agentName] || {
          preferredTopics: [],
        };
        if (payload.topic && !preferences.preferredTopics.includes(payload.topic)) {
          preferences.preferredTopics.push(payload.topic);
        }
        preferences.lastQuery = payload.query;
        await this.setState<RoomState>({
          ...prefsState,
          agentPreferences: {
            ...prefsState.agentPreferences,
            [meta.agentName]: preferences,
          },
        });
      }

      // 5. Send the result back to the requestor
      ws.send(
        serializeMessage(
          buildFrame(
            "docs.queryResult",
            result,
            { query: payload.query, topic: payload.topic },
            message.requestId,
          ),
        ),
      );
    } catch (error) {
      ws.send(
        serializeMessage(
          buildFrame(
            "docs.error",
            {
              code: "DOCS_QUERY_FAILED",
              message: error instanceof Error ? error.message : "Unknown error",
            },
            undefined,
            message.requestId,
          ),
        ),
      );
    }
  }

  /**
   * Handles `agents.register`.
   * 1. Validates payload.
   * 2. Updates the agent's in-memory `WsRoomMeta` with their name.
   * 3. Initializes persistent `agentPreferences` in `RoomState` if new.
   * 4. Sends `agents.registered` confirmation.
   * 5. Broadcasts new agent list and sends current stats.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleAgentRegister(ws: WebSocket, message: WsMessage) {
    const payload = registerAgentSchema.parse(message.payload ?? {});
    const meta = this.connections.get(ws);
    let state = (await this.getState<RoomState>())!;

    if (meta) {
      // 1. Update in-memory metadata
      meta.agentName = payload.agentName;
      meta.lastSeen = new Date().toISOString();

      // 2. Initialize persistent preferences if they don't exist
      if (!state.agentPreferences[payload.agentName]) {
        await this.setState<RoomState>({
          ...state,
          agentPreferences: {
            ...state.agentPreferences,
            [payload.agentName]: { preferredTopics: [] },
          },
        });
      }
    }

    // 3. Confirm registration with the agent
    ws.send(
      serializeMessage(
        buildFrame("agents.registered", { agentName: payload.agentName }),
      ),
    );
    // 4. Broadcast new agent list and send stats
    this.broadcastState();
    await this.sendStatsFrame(ws);
  }

  /**
   * Handles `agents.requestStats`.
   * 1. Fetches all stats from D1.
   * 2. Sends `tasks.stats` to the requestor.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleStatsRequest(ws: WebSocket, message: WsMessage) {
    statsRequestSchema.parse(message.payload ?? {});
    await this.sendStatsFrame(ws, message.requestId);
  }

  /**
   * Handles `agents.ackUnblock` (Coordination Pattern).
   * 1. Validates payload.
   * 2. Stops the proactive reminder timer for this task/agent.
   * 3. Updates the blocker status in D1 (`ackTaskBlock`).
   * 4. Broadcasts the updated blocked summary.
   * 5. Notifies all peers of the acknowledgment.
   * 6. Records this successful coordination in persistent `RoomState`.
   * @param {WebSocket} _ - The source WebSocket connection (unused).
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleAckUnblock(_: WebSocket, message: WsMessage) {
    const payload = ackUnblockSchema.parse(message.payload ?? {});
    const key = ackKey(payload.agentName, payload.taskId);

    // 1. Stop the reminder timer
    this.stopAckReminder(key);

    // 2. Update DB
    const blocker = await ackTaskBlock(
      this.env as Env,
      payload.taskId,
      payload.agentName,
    );

    if (blocker) {
      // 3. Broadcast updates
      await this.broadcastBlockedSummary();
      await notifyAgentAndPeers(
        this.connections,
        buildFrame("agents.unblockAck", { blocker }),
      );

      // 4. "Learn" from this successful coordination pattern
      let state = (await this.getState<RoomState>())!;
      const patterns = state.coordinationPatterns || [];
      patterns.push({
        pattern: "unblock_ack",
        timestamp: new Date().toISOString(),
        success: true,
      });
      await this.setState<RoomState>({
        ...state,
        coordinationPatterns: patterns.slice(-50), // Keep last 50 patterns
      });
    }
  }

  // --- Task Read Handlers ---

  /**
   * Handles `tasks.fetchByAgent`. Fetches tasks for one agent.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleFetchByAgent(ws: WebSocket, message: WsMessage) {
    const parsed = fetchByAgentSchema.parse(message.payload ?? {});
    const tasks = await listTasks(this.env as Env, { agent: parsed.agent });
    ws.send(
      serializeMessage(
        buildFrame(
          "tasks.agentSnapshot",
          {
            agent: parsed.agent,
            tasks: tasks.map(toTaskPayload),
          },
          { scope: "agent" },
          message.requestId,
        ),
      ),
    );
  }

  /**
   * Handles `tasks.fetchById`. Fetches a single task by its ID.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleFetchById(ws: WebSocket, message: WsMessage) {
    const { id } = fetchByIdSchema.parse(message.payload ?? {});
    const task = await getTaskById(this.env as Env, id);
    ws.send(
      serializeMessage(
        buildFrame(
          "tasks.detail",
          {
            task: task ? toTaskPayload(task) : null,
          },
          { taskId: id },
          message.requestId,
        ),
      ),
    );
  }

  /**
   * Handles `tasks.search`. Performs a full-text search for tasks.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleSearch(ws: WebSocket, message: WsMessage) {
    const { query } = fetchBySearchSchema.parse(message.payload ?? {});
    const tasks = await listTasks(this.env as Env, { search: query });
    ws.send(
      serializeMessage(
        buildFrame(
          "tasks.searchResults",
          {
            query,
            tasks: tasks.map(toTaskPayload),
          },
          undefined,
          message.requestId,
        ),
      ),
    );
  }

  /**
   * Handles `tasks.fetchOpen`. Fetches all non-completed tasks.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleFetchOpen(ws: WebSocket, message: WsMessage) {
    fetchOpenSchema.parse(message.payload ?? {});
    const tasks = await listOpenTasks(this.env as Env);
    ws.send(
      serializeMessage(
        buildFrame(
          "tasks.open",
          {
            tasks: tasks.map(toTaskPayload),
          },
          undefined,
          message.requestId,
        ),
      ),
    );
  }

  // --- Task Write Handlers (Broadcast) ---

  /**
   * Handles `tasks.bulkReassign`. Reassigns tasks in D1 and broadcasts.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleBulkReassign(ws: WebSocket, message: WsMessage) {
    const payload = bulkReassignRequestSchema.parse(message.payload ?? {});
    const tasks = await bulkReassignTasks(
      this.env as Env,
      payload.taskIds,
      payload.agent,
    );
    const response = buildFrame(
      "tasks.reassigned",
      {
        tasks: tasks.map(toTaskPayload),
      },
      {
        agent: payload.agent,
        taskIds: payload.taskIds,
      },
      message.requestId,
    );
    ws.send(serializeMessage(response));
    this.broadcastToOthers(ws, response);
    this.ctx.waitUntil(this.broadcastBlockedSummary()); // State may have changed
  }

  /**
   * Handles `tasks.bulkUpdateStatus`. Updates task statuses in D1 and broadcasts.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleBulkStatus(ws: WebSocket, message: WsMessage) {
    const payload = bulkStatusUpdateRequestSchema.parse(message.payload ?? {});
    const tasks = await bulkUpdateTaskStatuses(this.env as Env, payload.updates);
    const frame = buildFrame(
      "tasks.statusUpdated",
      {
        tasks: tasks.map(toTaskPayload),
      },
      {
        updates: payload.updates,
      },
      message.requestId,
    );
    ws.send(serializeMessage(frame));
    this.broadcastToOthers(ws, frame);
    this.ctx.waitUntil(this.broadcastBlockedSummary()); // State may have changed
  }

  /**
   * Handles `tasks.updateStatus`. Updates a single task status and broadcasts.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleSingleStatus(ws: WebSocket, message: WsMessage) {
    const payload = singleStatusUpdateRequestSchema
      .extend({ taskId: z.string().uuid() })
      .parse(message.payload ?? {});
    const tasks = await bulkUpdateTaskStatuses(this.env as Env, [
      { taskId: payload.taskId, status: payload.status as TaskStatus },
    ]);
    const frame = buildFrame(
      "tasks.statusUpdated",
      {
        tasks: tasks.map(toTaskPayload),
      },
      {
        updates: [{ taskId: payload.taskId, status: payload.status }],
      },
      message.requestId,
    );
    ws.send(serializeMessage(frame));
    this.broadcastToOthers(ws, frame);
    this.ctx.waitUntil(this.broadcastBlockedSummary()); // State may have changed
  }

  /**
   * Handles `tasks.create`. Creates a new task in D1 and broadcasts.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleCreateTask(ws: WebSocket, message: WsMessage) {
    const payload = createTaskRequestSchema.parse(message.payload ?? {});
    const task = await createTaskRecord(this.env as Env, {
      ...payload,
      projectId: this.ctx.id.toString(),
    } as CreateTaskInput);
    const frame = buildFrame(
      "tasks.created",
      {
        task: toTaskPayload(task),
      },
      undefined,
      message.requestId,
    );
    ws.send(serializeMessage(frame));
    this.broadcastToOthers(ws, frame);
    this.ctx.waitUntil(this.broadcastBlockedSummary()); // State may have changed
  }

  /**
   * Fallback handler to broadcast any unrecognized message to all clients.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private forwardMessage(message: WsMessage) {
    broadcast(this.connections.keys(), message);
  }

  // --- HTTP Broadcast Handler ---

  /**
   * Handles HTTP POST to `/broadcast`.
   * 1. Parses the `WsMessage` from the request body.
   * 2. Broadcasts it to all connected WebSockets.
   * 3. Triggers internal processing via `processServerFrame`.
   * @param {Request} request - The incoming HTTP POST request.
   * @private
   * @returns {Promise<Response>} A JSON success or error response.
   */
  private async handleBroadcast(request: Request) {
    try {
      const body = (await request.json()) as WsMessage;
      broadcast(this.connections.keys(), body);
      // Allow the room to react to externally injected events
      this.ctx.waitUntil(this.processServerFrame(body));
      return new Response(JSON.stringify({ success: true }), {
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      console.error("Failed to broadcast message", error);
      return new Response(JSON.stringify({ success: false }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  }

  /**
   * Processes server-side frames injected via `/broadcast`.
   * This allows the room to react to external events.
   * @param {WsMessage} message - The message from the broadcast.
   * @private
   */
  private async processServerFrame(message: WsMessage) {
    switch (message.type) {
      // An external system reported a task is blocked
      case "tasks.blocked":
        this.ctx.waitUntil(this.broadcastBlockedSummary());
        if (
          message.payload &&
          (message.payload as { blocker?: TaskBlocker }).blocker
        ) {
          const blocker = (message.payload as { blocker: TaskBlocker }).blocker;
          // Proactively ping the agent who is blocked
          await this.promptBlockedAgent(blocker);
        }
        break;
      // An external system reported a task is unblocked
      case "tasks.unblocked": {
        const blocker = (message.payload as { blocker?: TaskBlocker }).blocker;
        if (blocker) {
          // Start reminders for the agent to acknowledge the unblock
          await this.startAckReminder(
            blocker,
            message.meta?.notifyAgent as string | undefined,
          );
        }
        this.ctx.waitUntil(this.broadcastBlockedSummary());
        break;
      }
      // Ensure timers are running if external events mention them
      case "tasks.blockedSummary":
      case "agents.activity":
        this.ensureBlockedSummary();
        break;
      default:
        break;
    }
  }

  // --- Proactive Coordination & Timers ---

  /**
   * Sends a `agents.promptUpdate` message to a specific agent who is blocked.
   * @param {TaskBlocker} blocker - The blocker record from D1.
   * @private
   */
  private async promptBlockedAgent(blocker: TaskBlocker) {
    const frame = buildFrame("agents.promptUpdate", {
      blocker,
      instruction: `Update status with POST /api/tasks/${blocker.taskId}/block and follow up with /api/tasks/${blocker.taskId}/unblock when resolved.`,
    });
    await this.sendToAgent(blocker.blockedAgent, frame);
  }

  /**
   * Starts a persistent reminder for an agent to acknowledge an unblocked task.
   * @param {TaskBlocker} blocker - The blocker that was resolved.
   * @param {string} [notifyAgent] - The specific agent to notify.
   * @private
   */
  private async startAckReminder(blocker: TaskBlocker, notifyAgent?: string) {
    const agentName = notifyAgent ?? blocker.blockedAgent;
    const key = ackKey(agentName, blocker.taskId);
    this.stopAckReminder(key); // Clear any existing timer for this key

    const sendReminder = async () => {
      // Touch the DB to keep the "lastNotified" timestamp fresh
      await touchBlockLastNotified(this.env as Env, blocker.id);
      const frame = buildFrame("agents.unblockedReminder", {
        blocker,
        message: "Task unblocked – please acknowledge when picked up",
      });
      await this.sendToAgent(agentName, frame);
    };

    // Send the first reminder immediately
    await sendReminder();
    // Start the interval timer
    const timer = setInterval(() => {
      this.ctx.waitUntil(sendReminder());
    }, UNBLOCK_PING_INTERVAL_MS);
    this.ackTimers.set(key, timer);
  }

  /**
   * Stops and clears an active acknowledgment reminder timer.
   * @param {string} key - The key from `ackKey()`.
   * @private
   */
  private stopAckReminder(key: string) {
    const timer = this.ackTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.ackTimers.delete(key);
    }
  }

  // --- WebSocket Broadcast & Send Helpers ---

  /**
   * Sends a WebSocket message to a single agent by name.
   * If the agent is not found, it broadcasts to everyone as a fallback.
   * @param {string} agentName - The name of the target agent.
   * @param {WsMessage} message - The message to send.
   * @private
   */
  private async sendToAgent(agentName: string, message: WsMessage) {
    let sent = false;
    const payload = serializeMessage(message);
    for (const [client, meta] of this.connections) {
      if (meta.agentName === agentName) {
        try {
          client.send(payload);
          sent = true;
        } catch (error) {
          console.warn("Failed to emit targeted frame", error);
        }
      }
    }
    // Fallback: if we couldn't find the named agent, send to everyone
    if (!sent) {
      broadcast(this.connections.keys(), message);
    }
  }

  /**
   * Fetches full task stats from D1 and sends them to a single WebSocket.
   * @param {WebSocket} ws - The target WebSocket connection.
   * @param {string} [requestId] - The optional request ID to correlate.
   * @private
   */
  private async sendStatsFrame(ws: WebSocket, requestId?: string) {
    // 1. Fetch all data from D1 in parallel
    const [counts, agentActivity, blocked] = await Promise.all([
      getTaskCounts(this.env as Env),
      listAgentActivity(this.env as Env),
      listBlockedTasks(this.env as Env, { includeAcked: false }),
    ]);
    // 2. Build and send the frame
    const frame = buildFrame(
      "tasks.stats",
      {
        counts,
        agentActivity,
        blocked,
      },
      undefined,
      requestId,
    );
    ws.send(serializeMessage(frame));
  }

  /**
   * Broadcasts a message to all connected clients *except* one.
   * @param {WebSocket} exclude - The WebSocket to exclude.
   * @param {WsMessage} message - The message to broadcast.
   * @private
   */
  private broadcastToOthers(exclude: WebSocket, message: WsMessage) {
    const payload = serializeMessage(message);
    for (const [client] of this.connections) {
      if (client === exclude) continue;
      try {
        client.send(payload);
      } catch (error) {
        console.warn("Failed to emit frame to peer", error);
      }
    }
  }

  /**
   * Fetches the current blocked task summary from D1 and broadcasts it.
   * @private
   */
  private async broadcastBlockedSummary() {
    const blocked = await listBlockedTasks(this.env as Env, {
      includeAcked: false,
    });
    const frame = buildFrame("tasks.blockedSummary", { blocked });
    broadcast(this.connections.keys(), frame);
  }

  /**
   * Broadcasts the current system state (peer count, agent names) to all.
   * @private
   */
  private broadcastState() {
    const agents = Array.from(this.connections.values())
      .map((meta) => meta.agentName)
      .filter((name): name is string => !!name); // Filter out undefined/null names
    const payload = buildFrame("system.state", {
      peers: this.connections.size,
      agents,
    });
    broadcast(this.connections.keys(), payload);
  }

  // --- Timer Management ---

  /**
   * Starts the heartbeat timer if it's not already running.
   * @private
   */
  private ensureHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const frame = buildFrame("system.heartbeat", {
        ts: Date.now(),
        peers: this.connections.size,
      });
      broadcast(this.connections.keys(), frame);
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stops the heartbeat timer.
   * @private
   */
  private clearHeartbeat() {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  /**
   * Starts the blocked summary broadcast timer if it's not already running.
   * @private
   */
  private ensureBlockedSummary() {
    if (this.blockedSummaryTimer) return;
    this.blockedSummaryTimer = setInterval(() => {
      this.ctx.waitUntil(this.broadcastBlockedSummary());
    }, BLOCKED_SUMMARY_INTERVAL_MS);
  }

  /**
   * Stops the blocked summary broadcast timer.
   * @private
   */
  private clearBlockedSummary() {
    if (!this.blockedSummaryTimer) return;
    clearInterval(this.blockedSummaryTimer);
    this.blockedSummaryTimer = undefined;
  }
}

// --- Module-Level Helper ---

/**
 * A helper function to broadcast a message to a map of connections.
 * (This is a simplified version of the class's `broadcast` method,
 * kept for compatibility with `handleAckUnblock`.)
 * @param {Map<WebSocket, WsRoomMeta>} connections - The map of connections.
 * @param {WsMessage} message - The message to send.
 */
const notifyAgentAndPeers = async (
  connections: Map<WebSocket, WsRoomMeta>,
  message: WsMessage,
) => {
  const payload = serializeMessage(message);
  for (const [client] of connections) {
    try {
      client.send(payload);
    } catch (error) {
      console.warn("Failed to deliver unblock ack", error);
    }
  }
};