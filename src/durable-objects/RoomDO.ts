/**
 * @file This file defines the `RoomDO` Durable Object.
 *
 * @description
 * This Durable Object (DO) provides a real-time coordination room for AI agents
 * focused specifically on **task orchestration**. It manages WebSocket
 * connections from multiple agents and provides a real-time, broadcast-based
 * API for querying and manipulating the central `tasks` database (via `utils/db`).
 *
 * Key Responsibilities:
 * 1.  **WebSocket Management**: Handles agent connections, disconnections,
 * and heartbeats.
 * 2.  **Real-time Task API**: Allows agents to create, update, reassign, and
 * query tasks. All state-changing operations are broadcast to all
 * connected peers, ensuring all agents have a consistent view.
 * 3.  **Proactive Coordination**: Actively monitors the "blocked" task list.
 * - It broadcasts a summary of blocked tasks periodically.
 * - When an external system unblocks a task (via `/broadcast`), it
 * starts a "nag" timer (`startAckReminder`) to ping the assigned
 * agent until they acknowledge the unblock (`agents.ackUnblock`).
 * 4.  **External Event Injection**: Exposes an HTTP `POST /broadcast` endpoint,
 * allowing the main worker (or other services) to inject events
 * (e.g., `tasks.blocked`) into the room.
 *
 * @note This DO is ephemeral and does *not* persist its own state (like
 * agent names) to DO storage. It relies entirely on the D1 database
 * (`utils/db`) as the source of truth for task data. This contrasts with
 * `AgentRoomDO`, which persists its own `RoomState` (like agent preferences).
 *
 * @module RoomDO
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
  // Zod schemas
  bulkReassignRequestSchema,
  bulkStatusUpdateRequestSchema,
  createTaskRequestSchema,
  singleStatusUpdateRequestSchema,
} from "../schemas/apiSchemas";

// --- Constants ---

/** Interval for sending keep-alive pings to all connected clients. */
const HEARTBEAT_INTERVAL_MS = 30_000;
/** Interval for proactively broadcasting the list of blocked tasks. */
const BLOCKED_SUMMARY_INTERVAL_MS = 20_000;
/** Interval for reminding an agent to acknowledge an unblocked task. */
const UNBLOCK_PING_INTERVAL_MS = 10_000;

// --- Zod Schemas for WebSocket Messages ---

/** Schema for the `agents.register` message payload. */
const registerAgentSchema = z.object({ agentName: z.string().min(1) });
/** Schema for the `agents.ackUnblock` message payload. */
const ackUnblockSchema = z.object({
  taskId: z.string().uuid(),
  agentName: z.string().min(1),
});
/** Schema for the `agents.requestStats` message payload. */
const statsRequestSchema = z.object({ scope: z.string().optional() }).optional();

/** Schema for the `tasks.fetchByAgent` message payload. */
const fetchByAgentSchema = z.object({ agent: z.string().min(1) });
/** Schema for the `tasks.fetchById` message payload. */
const fetchByIdSchema = z.object({ id: z.string().uuid() });
/** Schema for the `tasks.search` message payload. */
const fetchBySearchSchema = z.object({ query: z.string().min(1) });
/** Schema for the `tasks.fetchOpen` message payload. */
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

// --- Durable Object Class ---

/**
 * @class RoomDO
 * @description Implements the stateful Durable Object for real-time
 * task orchestration among connected agents.
 */
export class RoomDO {
  /** @property The Durable Object state and storage context. */
  private readonly ctx: DurableObjectState;
  /** @property The worker's environment bindings (e.g., D1 database). */
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
   * Creates an instance of the RoomDO.
   * @param {DurableObjectState} ctx - The Durable Object state and storage context.
   * @param {Env} env - The worker's environment bindings.
   */
  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  /**
   * The main HTTP entry point for the Durable Object.
   * It handles WebSocket upgrades and the `/broadcast` endpoint.
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
    const client = pair[0];
    const server = pair[1];

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
  webSocketOpen(ws: WebSocket) {
    // 1. Create in-memory metadata for this connection
    const meta: WsRoomMeta = {
      roomId: this.ctx.id.toString(),
      connectedAt: new Date().toISOString(),
      peers: this.connections.size + 1,
    };
    this.connections.set(ws, meta);

    // 2. Send a welcome message to the connecting client
    ws.send(
      serializeMessage(
        buildFrame("system.welcome", {
          meta,
          message: "Connected to collaborative agent room",
        }),
      ),
    );

    // 3. Broadcast the new peer count to all clients
    this.broadcastState();

    // 4. Start timers if this is the first connection
    this.ensureHeartbeat();
    this.ensureBlockedSummary();

    // 5. Send an immediate summary of blocked tasks
    this.ctx.waitUntil(this.broadcastBlockedSummary());
  }

  /**
   * Called by the DO runtime when a message is received.
   * @param {WebSocket} ws - The socket that sent the message.
   * @param {ArrayBuffer | string} data - The message payload.
   */
  webSocketMessage(ws: WebSocket, data: ArrayBuffer | string) {
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
        // Agent Coordination
        case "agents.register":
          await this.handleAgentRegister(ws, message);
          break;
        case "agents.requestStats":
          await this.handleStatsRequest(ws, message);
          break;
        case "agents.ackUnblock":
          await this.handleAckUnblock(ws, message);
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

  // --- Agent & Stats Handlers ---

  /**
   * Handles `agents.register`.
   * Associates a human-readable name with the WebSocket connection.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleAgentRegister(ws: WebSocket, message: WsMessage) {
    const payload = registerAgentSchema.parse(message.payload ?? {});
    const meta = this.connections.get(ws);

    // 1. Update in-memory metadata
    if (meta) {
      meta.agentName = payload.agentName;
      meta.lastSeen = new Date().toISOString();
    }

    // 2. Confirm registration with the agent
    ws.send(
      serializeMessage(
        buildFrame("agents.registered", { agentName: payload.agentName }),
      ),
    );

    // 3. Broadcast new agent list and send current stats
    this.broadcastState();
    await this.sendStatsFrame(ws);
  }

  /**
   * Handles `agents.requestStats`.
   * Fetches all task stats from D1 and sends them to the requestor.
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
   * 4. Broadcasts the updated blocked summary to all peers.
   * 5. Notifies all peers of the acknowledgment.
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
      this.env,
      payload.taskId,
      payload.agentName,
    );

    if (blocker) {
      // 3. Broadcast updates to all peers
      await this.broadcastBlockedSummary();
      await notifyAgentAndPeers(
        this.connections,
        buildFrame("agents.unblockAck", { blocker }),
      );
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
    const tasks = await listTasks(this.env, { agent: parsed.agent });
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
    const task = await getTaskById(this.env, id);
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
    const tasks = await listTasks(this.env, { search: query });
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
    const tasks = await listOpenTasks(this.env);
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
    // 1. Update D1
    const tasks = await bulkReassignTasks(
      this.env,
      payload.taskIds,
      payload.agent,
    );
    // 2. Build response frame
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
    // 3. Send confirmation to requestor and broadcast to others
    ws.send(serializeMessage(response));
    this.broadcastToOthers(ws, response);
    // 4. Trigger a state refresh for all clients
    this.ctx.waitUntil(this.broadcastBlockedSummary());
  }

  /**
   * Handles `tasks.bulkUpdateStatus`. Updates task statuses in D1 and broadcasts.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleBulkStatus(ws: WebSocket, message: WsMessage) {
    const payload = bulkStatusUpdateRequestSchema.parse(message.payload ?? {});
    // 1. Update D1
    const tasks = await bulkUpdateTaskStatuses(this.env, payload.updates);
    // 2. Build response frame
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
    // 3. Send confirmation and broadcast
    ws.send(serializeMessage(frame));
    this.broadcastToOthers(ws, frame);
    // 4. Trigger state refresh
    this.ctx.waitUntil(this.broadcastBlockedSummary());
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
    // 1. Update D1
    const tasks = await bulkUpdateTaskStatuses(this.env, [
      { taskId: payload.taskId, status: payload.status as TaskStatus },
    ]);
    // 2. Build response frame
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
    // 3. Send confirmation and broadcast
    ws.send(serializeMessage(frame));
    this.broadcastToOthers(ws, frame);
    // 4. Trigger state refresh
    this.ctx.waitUntil(this.broadcastBlockedSummary());
  }

  /**
   * Handles `tasks.create`. Creates a new task in D1 and broadcasts.
   * @param {WebSocket} ws - The source WebSocket connection.
   * @param {WsMessage} message - The deserialized message.
   * @private
   */
  private async handleCreateTask(ws: WebSocket, message: WsMessage) {
    const payload = createTaskRequestSchema.parse(message.payload ?? {});
    // 1. Create in D1
    const task = await createTaskRecord(this.env, {
      ...payload,
      projectId: payload.projectId || "default",
    } as CreateTaskInput);
    // 2. Build response frame
    const frame = buildFrame(
      "tasks.created",
      {
        task: toTaskPayload(task),
      },
      undefined,
      message.requestId,
    );
    // 3. Send confirmation and broadcast
    ws.send(serializeMessage(frame));
    this.broadcastToOthers(ws, frame);
    // 4. Trigger state refresh
    this.ctx.waitUntil(this.broadcastBlockedSummary());
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
      // 1. Broadcast to all connected clients
      broadcast(this.connections.keys(), body);
      // 2. Allow the room to react to externally injected events
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
   * This allows the room to react to external events and
   * initiate proactive coordination patterns.
   * @param {WsMessage} message - The message from the broadcast.
   * @private
   */
  private async processServerFrame(message: WsMessage) {
    switch (message.type) {
      /**
       * @description
       * **Coordination Pattern**: An external system (e.g., API)
       * reports a task is now 'blocked'.
       */
      case "tasks.blocked":
        // Refresh everyone's view of blocked tasks
        this.ctx.waitUntil(this.broadcastBlockedSummary());
        // If the payload contains the blocker, proactively ping the agent
        if (
          message.payload &&
          (message.payload as { blocker?: TaskBlocker }).blocker
        ) {
          const blocker = (message.payload as { blocker: TaskBlocker }).blocker;
          await this.promptBlockedAgent(blocker);
        }
        break;

      /**
       * @description
       * **Coordination Pattern**: An external system reports a task
       * is now 'unblocked'.
       */
      case "tasks.unblocked": {
        const blocker = (message.payload as { blocker?: TaskBlocker }).blocker;
        if (blocker) {
          // Start the "nag" timer to remind the agent to acknowledge
          await this.startAckReminder(
            blocker,
            message.meta?.notifyAgent as string | undefined,
          );
        }
        // Refresh everyone's view
        this.ctx.waitUntil(this.broadcastBlockedSummary());
        break;
      }

      // Ensure timers are active if we receive these messages
      case "tasks.blockedSummary":
      case "agents.activity":
        this.ensureBlockedSummary();
        break;
      default:
        // No special processing needed
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
   * This will send a message immediately, then start a timer to
   * send it repeatedly until `stopAckReminder` is called.
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
      await touchBlockLastNotified(this.env, blocker.id);
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
    if (!sent) {
      // Fallback: if we couldn't find the named agent, send to everyone
      // This ensures observers still see pending notifications.
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
      getTaskCounts(this.env),
      listAgentActivity(this.env),
      listBlockedTasks(this.env, { includeAcked: false }),
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
    const blocked = await listBlockedTasks(this.env, { includeAcked: false });
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