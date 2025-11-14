/**
 * @file This file defines the `ChatRoom` Durable Object (DO).
 *
 * @description
 * The `ChatRoom` Durable Object acts as a stateful, single-threaded coordinator
 * for a specific "room". Its primary purpose is to manage real-time agent
 * coordination, particularly for tasks requiring shared resource access (file locks).
 *
 * It serves two main functions:
 * 1.  **WebSocket Server:** Manages persistent WebSocket connections from AI agents.
 * It handles agent joins/leaves, broadcasts messages, and manages a
 * file-locking system.
 * 2.  **HTTP API Server:** Exposes simple HTTP GET endpoints for querying the
 * room's current state (e.g., `/info`, `/locks`) or historical data
 * from D1 (e.g., `/history`).
 *
 * @key_concepts
 * - **In-Memory State (`roomState.agents`):** The map of active WebSocket
 * connections is ephemeral and lives only in memory. It is NOT persisted
 * to storage.
 * - **Persistent DO Storage (`this.storage`):** The *current* state of file
 * locks and basic room metadata is persisted to the DO's key-value storage
 * via `saveState()` and `loadState()`. This ensures that if the DO instance
 * is evicted, the file locks are remembered when it wakes up.
 * - **Persistent D1 Database (`this.env.DB`):** A long-term, queryable,
 * relational log of all events (messages, joins, leaves, lock history,
 * agent presence) is written to the bound D1 database. This provides
 * historical auditability and richer query capabilities via the `query`
 * WebSocket command.
 *
 * @module ChatRoomDurableObject
 * @see {@link ./types.ts} for all related type definitions.
 */

import type {
  Env,
  AgentMessage,
  WebSocketMessage,
  FileLock,
  QueryRequest,
  QueryResponse,
  HelpResponse,
  RoomState,
  AgentConnection,
  Command,
  Example,
  EndpointInfo,
  MCPInfo,
  MessageType,
  SenderType,
} from "./types";
import { logMessage, createThread, updateThreadActivity } from "./utils/messageLogging";

/**
 * Defines the shape of the room state that is persisted to Durable Object storage.
 * Note that `agents` is omitted, as live WebSocket connections cannot be serialized.
 */
type StoredRoomState = Omit<RoomState, "agents" | "fileLocks"> & {
  /** File locks are serialized from a Map to a plain object for storage. */
  fileLocks?: Record<string, FileLock>;
};

/**
 * Maps legacy message types to new message types.
 */
function mapLegacyMessageType(legacyType: string): MessageType {
  switch (legacyType) {
    case "chat":
      return "chat";
    case "join":
    case "leave":
      return "system";
    case "file_lock":
    case "file_unlock":
      return "task_update";
    default:
      return "system";
  }
}

/**
 * Implements the ChatRoom Durable Object.
 *
 * Each instance of this class represents a single, named chat/coordination room.
 * The Cloudflare runtime ensures that only one instance of this object exists
 * for a given ID (room name) at any time, providing a single point of
 * coordination.
 *
 * @class ChatRoom
 * @implements {DurableObject}
 */
export class ChatRoom implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  /**
   * The core in-memory state of the room.
   * - `agents`: Ephemeral map of live WebSocket connections.
   * - `fileLocks`: Live map of current locks, which is also persisted to DO storage.
   */
  private roomState: RoomState;
  private storage: DurableObjectStorage;

  /**
   * Creates an instance of the ChatRoom Durable Object.
   * @param {DurableObjectState} state - The Durable Object's state and storage accessor.
   * @param {Env} env - The worker's environment bindings (e.g., D1 database).
   */
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;

    // Initialize the default in-memory room state.
    this.roomState = {
      projectId: state.id.toString(),
      name: "Default Room", // This will be overwritten by loadState if it exists
      agents: new Map<string, AgentConnection>(),
      fileLocks: new Map<string, FileLock>(),
      messageCount: 0,
      createdAt: Date.now(),
    };

    /**
     * @description
     * **Critical:** This blocks all concurrent operations (like new `fetch`
     * events) until the promise resolves. This is essential to prevent race
     * conditions where a WebSocket connection might be handled *before*
     * the room's persistent state (especially file locks) has been loaded
     * from storage.
     */
    this.state.blockConcurrencyWhile(async () => {
      await this.loadState();
    });
  }

  /**
   * Loads the room's persistent state from Durable Object storage into memory.
   * @private
   */
  private async loadState(): Promise<void> {
    // Load persisted state from Durable Object key-value storage
    const savedState =
      await this.storage.get<Partial<StoredRoomState>>("roomState");

    if (savedState) {
      const { fileLocks, ...rest } = savedState;
      // Deserialize file locks from a plain object back into a Map
      const persistedLocks = fileLocks
        ? new Map<string, FileLock>(Object.entries(fileLocks))
        : new Map<string, FileLock>();

      this.roomState = {
        ...this.roomState,
        ...rest,
        agents: new Map<string, AgentConnection>(), // ALWAYS reset agents; they are ephemeral
        fileLocks: persistedLocks,
      };
    }
  }

  /**
   * Saves the room's persistent state (e.g., file locks) to Durable Object storage.
   * This does NOT save the `agents` map, which is ephemeral.
   * @private
   */
  private async saveState(): Promise<void> {
    // Create a serializable version of the state
    const stateToSave: StoredRoomState = {
      projectId: this.roomState.projectId,
      name: this.roomState.name,
      description: this.roomState.description,
      messageCount: this.roomState.messageCount,
      createdAt: this.roomState.createdAt,
      // Serialize the fileLocks Map into a plain object for storage
      fileLocks: Object.fromEntries(this.roomState.fileLocks),
    };
    await this.storage.put("roomState", stateToSave);
  }

  /**
   * The main entry point for all requests to the Durable Object.
   * It handles both HTTP requests and WebSocket upgrade requests.
   * @param {Request} request - The incoming HTTP request.
   * @returns {Promise<Response>} A promise that resolves to the HTTP response.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrades
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    // --- HTTP API Endpoints ---

    /**
     * @description
     * GET /info
     * Returns the current *in-memory* state of the room, including active
     * agents and file locks.
     */
    if (url.pathname === "/info") {
      return this.handleInfo();
    }

    /**
     * @description
     * GET /history
     * Returns historical messages from the *D1 Database*.
     */
    if (url.pathname === "/history") {
      return this.handleHistory(url);
    }

    /**
     * @description
     * GET /locks
     * Returns the current *in-memory* state of file locks.
     */
    if (url.pathname === "/locks") {
      return this.handleLocks();
    }

    return new Response("Not Found", { status: 404 });
  }

  /**
   * Handles a new WebSocket connection request.
   * This method sets up the WebSocket, registers the agent, and
   * attaches all necessary event listeners.
   * @param {Request} request - The incoming request with an 'Upgrade' header.
   * @private
   * @returns {Promise<Response>} A Response with status 101 (Switching Protocols).
   */
  private async handleWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection
    server.accept();

    // Identify the agent from URL parameters
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agentId") || crypto.randomUUID();
    const agentName = url.searchParams.get("agentName") || agentId;
    const projectId = this.roomState.projectId;

    // Register the agent in the in-memory state
    const connection: AgentConnection = {
      agentId,
      agentName,
      webSocket: server,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };
    this.roomState.agents.set(agentId, connection);

    // 1. Send welcome message *only* to the connecting agent
    this.sendToAgent(agentId, {
      type: "welcome",
      data: {
        message: `Welcome to room ${this.roomState.name}!`,
        agentId,
        projectId,
        help: await this.getHelpInfo(),
      },
      timestamp: Date.now(),
    });

    // 2. Notify *all other* agents about the new joiner
    await this.broadcast(
      {
        type: "agent_joined",
        data: { agentId, agentName, totalAgents: this.roomState.agents.size },
        timestamp: Date.now(),
      },
      agentId, // Exclude the new agent from this broadcast
    );

    // 3. Log the join event to the D1 database for history
    await this.logMessage({
      type: "join",
      agentId,
      agentName,
      projectId,
      content: `${agentName} joined the room`,
      timestamp: Date.now(),
    });

    // 4. Update the D1 presence table (upsert)
    await this.updateAgentPresence(agentId, agentName, "online");

    // --- Attach WebSocket Event Listeners ---

    // Handle incoming messages
    server.addEventListener("message", async (event: MessageEvent) => {
      await this.handleAgentMessage(agentId, event.data);
    });

    // Handle disconnections
    server.addEventListener("close", async () => {
      await this.handleAgentDisconnect(agentId);
    });

    // Handle errors (which usually also trigger a 'close' event)
    server.addEventListener("error", async (event: ErrorEvent) => {
      console.error(`WebSocket error for agent ${agentId}:`, event);
      await this.handleAgentDisconnect(agentId); // Ensure cleanup
    });

    // Return the client-side WebSocket to the runtime
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Primary router for all incoming WebSocket messages from a specific agent.
   * @param {string} agentId - The ID of the agent sending the message.
   * @param {string | ArrayBuffer} data - The raw message data.
   * @private
   */
  private async handleAgentMessage(
    agentId: string,
    data: string | ArrayBuffer,
  ): Promise<void> {
    try {
      const message =
        typeof data === "string"
          ? JSON.parse(data)
          : JSON.parse(new TextDecoder().decode(data));
      const agent = this.roomState.agents.get(agentId);

      if (!agent) return; // Agent disconnected but message was in-flight

      // Update last seen timestamp for presence
      agent.lastSeen = Date.now();

      // Route message based on its type
      switch (message.type) {
        case "chat":
          await this.handleChatMessage(agentId, message);
          break;
        case "create_thread":
          await this.handleCreateThread(agentId, message);
          break;
        case "thread_reply":
          await this.handleThreadReply(agentId, message);
          break;
        case "file_lock":
          await this.handleFileLock(agentId, message);
          break;
        case "file_unlock":
          await this.handleFileUnlock(agentId, message);
          break;
        case "query":
          await this.handleQuery(agentId, message);
          break;
        case "help":
          await this.handleHelp(agentId);
          break;
        case "ping":
          this.sendToAgent(agentId, {
            type: "pong",
            data: {},
            timestamp: Date.now(),
          });
          break;
        default:
          this.sendToAgent(agentId, {
            type: "error",
            data: { error: `Unknown message type: ${message.type}` },
            timestamp: Date.now(),
          });
      }
    } catch (error) {
      console.error(`Error handling message from agent ${agentId}:`, error);
      this.sendToAgent(agentId, {
        type: "error",
        data: { error: "Invalid message format" },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handles a standard 'chat' message.
   * It broadcasts the message to all agents and logs it to D1.
   * @param {string} agentId - The sender's ID.
   * @param {any} message - The parsed message object.
   * @private
   */
  private async handleChatMessage(agentId: string, message: any): Promise<void> {
    const agent = this.roomState.agents.get(agentId);
    if (!agent) return;

    const agentMessage: AgentMessage = {
      type: "chat",
      agentId,
      agentName: agent.agentName,
      projectId: this.roomState.projectId,
      content: message.content,
      metadata: message.metadata,
      timestamp: Date.now(),
    };

    // 1. Broadcast to all agents (including sender)
    await this.broadcast({
      type: "chat",
      data: {
        agentId,
        agentName: agent.agentName,
        content: message.content,
        metadata: message.metadata,
      },
      timestamp: agentMessage.timestamp,
    });

    // 2. Log to D1 database
    await this.logMessage(agentMessage);
  }

  /**
   * Handles a 'file_lock' request.
   * This is the core coordination logic. It checks the in-memory lock state.
   * If available, it grants the lock, saves the new lock state to DO storage,
   * logs the lock to D1, and notifies all agents.
   * @param {string} agentId - The sender's ID.
   * @param {any} message - The parsed message object.
   * @private
   */
  private async handleFileLock(agentId: string, message: any): Promise<void> {
    const agent = this.roomState.agents.get(agentId);
    if (!agent) return;

    const filePath = message.filePath;
    const lockType = message.lockType || "write";

    // Check if file is already locked by *another* agent
    const existingLock = this.roomState.fileLocks.get(filePath);

    if (existingLock && existingLock.agentId !== agentId) {
      // File is locked by another agent, deny request
      this.sendToAgent(agentId, {
        type: "file_lock_denied",
        data: {
          filePath,
          reason: `File is already locked by ${
            existingLock.agentName || existingLock.agentId
          }`,
          existingLock,
        },
        timestamp: Date.now(),
      });
      return;
    }

    // Grant the lock
    const lock: FileLock = {
      filePath,
      lockType,
      agentId,
      agentName: agent.agentName,
      timestamp: Date.now(),
    };

    // 1. Update in-memory state
    this.roomState.fileLocks.set(filePath, lock);
    // 2. Persist new lock state to DO storage
    await this.saveState();

    // 3. Log the *granting* of the lock to D1 history
    await this.logFileLock(lock, "locked");

    // 4. Notify all agents that the file is now locked
    await this.broadcast({
      type: "file_locked",
      data: {
        filePath,
        lockType,
        agentId,
        agentName: agent.agentName,
      },
      timestamp: lock.timestamp,
    });

    // 5. Send a specific confirmation to the requesting agent
    this.sendToAgent(agentId, {
      type: "file_lock_granted",
      data: { filePath, lockType },
      timestamp: lock.timestamp,
    });

    // 6. Log a "chat" message about the lock event for context
    await this.logMessage({
      type: "file_lock",
      agentId,
      agentName: agent.agentName,
      projectId: this.roomState.projectId,
      content: `Locked file: ${filePath} (${lockType})`,
      metadata: { filePath, lockType },
      timestamp: lock.timestamp,
    });
  }

  /**
   * Handles a 'file_unlock' request.
   * Checks if the requesting agent holds the lock. If so, removes the lock
   * from in-memory state, saves to DO storage, logs the release to D1,
   * and notifies all agents.
   * @param {string} agentId - The sender's ID.
   * @param {any} message - The parsed message object.
   * @private
   */
  private async handleFileUnlock(
    agentId: string,
    message: any,
  ): Promise<void> {
    const agent = this.roomState.agents.get(agentId);
    if (!agent) return;

    const filePath = message.filePath;
    const existingLock = this.roomState.fileLocks.get(filePath);

    if (!existingLock) {
      this.sendToAgent(agentId, {
        type: "error",
        data: { error: `No lock found for file: ${filePath}` },
        timestamp: Date.now(),
      });
      return;
    }

    // Check ownership
    if (existingLock.agentId !== agentId) {
      this.sendToAgent(agentId, {
        type: "error",
        data: {
          error: `File is locked by another agent: ${
            existingLock.agentName || existingLock.agentId
          }`,
        },
        timestamp: Date.now(),
      });
      return;
    }

    // 1. Release lock from in-memory state
    this.roomState.fileLocks.delete(filePath);
    // 2. Persist new state (without the lock) to DO storage
    await this.saveState();

    // 3. Log the *release* of the lock to D1 history
    await this.logFileLock(existingLock, "released");

    // 4. Notify all agents
    await this.broadcast({
      type: "file_unlocked",
      data: {
        filePath,
        agentId,
        agentName: agent.agentName,
      },
      timestamp: Date.now(),
    });

    // 5. Send confirmation to the unlocking agent
    this.sendToAgent(agentId, {
      type: "file_unlock_confirmed",
      data: { filePath },
      timestamp: Date.now(),
    });

    // 6. Log a "chat" message about the unlock event
    await this.logMessage({
      type: "file_unlock",
      agentId,
      agentName: agent.agentName,
      projectId: this.roomState.projectId,
      content: `Unlocked file: ${filePath}`,
      metadata: { filePath },
      timestamp: Date.now(),
    });
  }

  /**
   * Handles a 'query' request.
   * Executes a read-only query against the D1 database and sends
   * the response to the requesting agent.
   * @param {string} agentId - The sender's ID.
   * @param {any} message - The parsed message object containing the query.
   * @private
   */
  private async handleQuery(agentId: string, message: any): Promise<void> {
    const queryRequest: QueryRequest = message.query;

    try {
      const response = await this.executeQuery(queryRequest);
      this.sendToAgent(agentId, {
        type: "query_response",
        data: response,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendToAgent(agentId, {
        type: "error",
        data: { error: `Query failed: ${error}` },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handles a 'help' request.
   * Sends the comprehensive help and command info to the requesting agent.
   * @param {string} agentId - The sender's ID.
   * @private
   */
  private async handleHelp(agentId: string): Promise<void> {
    const helpInfo = await this.getHelpInfo();
    this.sendToAgent(agentId, {
      type: "help_response",
      data: helpInfo,
      timestamp: Date.now(),
    });
  }

  /**
   * Builds and executes a SQL query against the D1 database based on the
   * agent's query request.
   * @param {QueryRequest} query - The structured query request.
   * @private
   * @returns {Promise<QueryResponse>} The query results.
   */
  private async executeQuery(query: QueryRequest): Promise<QueryResponse> {
    const { queryType, filters = {} } = query;
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    let sql = "";
    let params: any[] = [];

    switch (queryType) {
      case "history":
        sql = `
          SELECT * FROM messages
          WHERE room_id = ?
          ${filters.agentId ? "AND agent_id = ?" : ""}
          ${filters.since ? "AND timestamp > ?" : ""}
          ORDER BY timestamp DESC
          LIMIT ? OFFSET ?
        `;
        params = [this.roomState.projectId];
        if (filters.agentId) params.push(filters.agentId);
        if (filters.since) params.push(filters.since);
        params.push(limit, offset);
        break;

      case "locks":
        // Queries the historical log of locks
        sql = `
          SELECT * FROM file_locks
          WHERE room_id = ? AND status = 'locked'
          ${filters.filePath ? "AND file_path = ?" : ""}
          ${filters.agentId ? "AND agent_id = ?" : ""}
          ORDER BY locked_at DESC
          LIMIT ? OFFSET ?
        `;
        params = [this.roomState.projectId];
        if (filters.filePath) params.push(filters.filePath);
        if (filters.agentId) params.push(filters.agentId);
        params.push(limit, offset);
        break;

      case "agents":
        // Queries the agent presence table
        sql = `
          SELECT * FROM agent_presence
          WHERE room_id = ? AND status = 'online'
          ORDER BY last_seen DESC
          LIMIT ? OFFSET ?
        `;
        params = [this.roomState.projectId, limit, offset];
        break;

      case "file_history":
        if (!filters.filePath) {
          throw new Error(
            "`filePath` filter is required for `file_history` query type.",
          );
        }
        sql = `
          SELECT * FROM file_locks
          WHERE room_id = ? AND file_path = ?
          ORDER BY locked_at DESC
          LIMIT ? OFFSET ?
        `;
        params = [this.roomState.projectId, filters.filePath, limit, offset];
        break;

      case "rooms":
        sql = `SELECT * FROM rooms ORDER BY last_activity DESC LIMIT ? OFFSET ?`;
        params = [limit, offset];
        break;

      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }

    const result = await this.env.DB.prepare(sql).bind(...params).all();

    return {
      success: true,
      data: result.results || [],
      count: result.results?.length || 0,
      queryType,
    };
  }

  /**
   * Generates the comprehensive help response object.
   * @private
   * @returns {Promise<HelpResponse>} The help object.
   */
  private async getHelpInfo(): Promise<HelpResponse> {
    const commands: Command[] = [
      {
        name: "chat",
        description: "Send a chat message to all agents in the room",
        parameters: [
          {
            name: "content",
            type: "string",
            required: true,
            description: "The message content",
          },
          {
            name: "metadata",
            type: "object",
            required: false,
            description: "Optional metadata",
          },
        ],
        example: JSON.stringify(
          { type: "chat", content: "Hello everyone!", metadata: { priority: "high" } },
          null,
          2,
        ),
      },
      {
        name: "file_lock",
        description:
          "Request a lock on a file to prevent other agents from modifying it",
        parameters: [
          {
            name: "filePath",
            type: "string",
            required: true,
            description: "The file path to lock",
          },
          {
            name: "lockType",
            type: "string",
            required: false,
            description: "Lock type: read, write, or create (default: write)",
          },
        ],
        example: JSON.stringify(
          { type: "file_lock", filePath: "/src/index.ts", lockType: "write" },
          null,
          2,
        ),
      },
      {
        name: "file_unlock",
        description: "Release a file lock",
        parameters: [
          {
            name: "filePath",
            type: "string",
            required: true,
            description: "The file path to unlock",
          },
        ],
        example: JSON.stringify(
          { type: "file_unlock", filePath: "/src/index.ts" },
          null,
          2,
        ),
      },
      {
        name: "query",
        description:
          "Query the D1 database for history, locks, agents, or file history",
        parameters: [
          {
            name: "query.queryType",
            type: "string",
            required: true,
            description:
              "Query type: history, locks, agents, file_history, or rooms",
          },
          {
            name: "query.filters",
            type: "object",
            required: false,
            description:
              "Optional filters (agentId, filePath, limit, offset, since)",
          },
        ],
        example: JSON.stringify(
          { type: "query", query: { queryType: "history", filters: { limit: 50 } } },
          null,
          2,
        ),
      },
      {
        name: "help",
        description: "Get help information and available commands",
        example: JSON.stringify({ type: "help" }, null, 2),
      },
      {
        name: "ping",
        description: "Ping the server to keep connection alive",
        example: JSON.stringify({ type: "ping" }, null, 2),
      },
    ];

    const examples: Example[] = [
      {
        title: "Coordinate File Creation",
        description:
          "Lock a file before creating it to prevent duplicate creation",
        code: `// Agent 1 requests lock
ws.send(JSON.stringify({
  type: 'file_lock',
  filePath: '/src/newFeature.ts',
  lockType: 'create'
}));

// Wait for file_lock_granted response
// Then create the file
// Finally unlock
ws.send(JSON.stringify({
  type: 'file_unlock',
  filePath: '/src/newFeature.ts'
}));`,
      },
      {
        title: "Query Recent History",
        description: "Get the last 20 messages from the room",
        code: `ws.send(JSON.stringify({
  type: 'query',
  query: {
    queryType: 'history',
    filters: { limit: 20 }
  }
}));`,
      },
      {
        title: "Check Active Locks",
        description: "See what files are currently locked",
        code: `ws.send(JSON.stringify({
  type: 'query',
  query: {
    queryType: 'locks'
  }
}));`,
      },
    ];

    const endpoints: EndpointInfo[] = [
      {
        path: "/ws/:roomId",
        method: "GET",
        description: "WebSocket connection endpoint (with Upgrade header)",
      },
      {
        path: "/api/room/:roomId/info",
        method: "GET",
        description: "Get room information",
      },
      {
        path: "/api/room/:roomId/history",
        method: "GET",
        description: "Get room message history",
      },
      {
        path: "/api/room/:roomId/locks",
        method: "GET",
        description: "Get active file locks",
      },
    ];

    const mcpInfo: MCPInfo = {
      description:
        "This service can be used as an MCP (Model Context Protocol) tool for agent coordination",
      setupInstructions: [
        "1. Deploy this worker to Cloudflare",
        "2. Note your worker URL (e.g., https://your-worker.your-subdomain.workers.dev)",
        "3. Create an MCP server configuration that connects to the WebSocket endpoint",
        "4. Configure your agents to use the MCP tool for coordination",
        "5. See the README for detailed MCP integration examples",
      ],
      exampleConfig: JSON.stringify(
        {
          mcpServers: {
            "agent-coordination": {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-websocket"],
              env: {
                WEBSOCKET_URL:
                  "wss://your-worker.your-subdomain.workers.dev/ws/default",
              },
            },
          },
        },
        null,
        2,
      ),
    };

    return { commands, examples, endpoints, mcpInfo };
  }

  /**
   * Handles the disconnection of an agent.
   * This is a critical cleanup routine. It removes the agent from the
   * in-memory state and, most importantly, releases any file locks
   * held by that agent to prevent deadlocks.
   * @param {string} agentId - The ID of the agent who disconnected.
   * @private
   */
  private async handleAgentDisconnect(agentId: string): Promise<void> {
    const agent = this.roomState.agents.get(agentId);
    if (!agent) return; // Already cleaned up

    // 1. Remove agent from in-memory state
    this.roomState.agents.delete(agentId);

    // 2. Release all locks held by this agent
    const locksToRelease: string[] = [];
    for (const [filePath, lock] of this.roomState.fileLocks.entries()) {
      if (lock.agentId === agentId) {
        locksToRelease.push(filePath);
      }
    }

    for (const filePath of locksToRelease) {
      const lock = this.roomState.fileLocks.get(filePath);
      if (lock) {
        // 2a. Remove from in-memory state
        this.roomState.fileLocks.delete(filePath);
        // 2b. Log release to D1 history
        await this.logFileLock(lock, "released");

        // 2c. Notify all *other* agents of the automatic unlock
        await this.broadcast({
          type: "file_unlocked",
          data: {
            filePath,
            agentId,
            agentName: agent.agentName,
            reason: "Agent disconnected",
          },
          timestamp: Date.now(),
        });
      }
    }

    // 3. Persist the new (lock-released) state to DO storage
    await this.saveState();

    // 4. Notify remaining agents
    await this.broadcast({
      type: "agent_left",
      data: {
        agentId,
        agentName: agent.agentName,
        totalAgents: this.roomState.agents.size,
      },
      timestamp: Date.now(),
    });

    // 5. Log leave event to D1 history
    await this.logMessage({
      type: "leave",
      agentId,
      agentName: agent.agentName,
      projectId: this.roomState.projectId,
      content: `${agent.agentName} left the room`,
      timestamp: Date.now(),
    });

    // 6. Update D1 presence table
    await this.updateAgentPresence(agentId, agent.agentName, "offline");
  }

  /**
   * Broadcasts a WebSocket message to all connected agents,
   * optionally excluding one.
   * @param {WebSocketMessage} message - The message to send.
   * @param {string} [excludeAgentId] - An optional agent ID to exclude.
   * @private
   */
  private async broadcast(
    message: WebSocketMessage,
    excludeAgentId?: string,
  ): Promise<void> {
    const messageStr = JSON.stringify(message);

    for (const [agentId, agent] of this.roomState.agents.entries()) {
      if (agentId !== excludeAgentId) {
        try {
          agent.webSocket.send(messageStr);
        } catch (error) {
          console.error(`Failed to send message to agent ${agentId}:`, error);
          // Connection is likely broken; will be cleaned up by its 'close' handler
        }
      }
    }
  }

  /**
   * Sends a WebSocket message to a single, specific agent.
   * @param {string} agentId - The recipient's agent ID.
   * @param {WebSocketMessage} message - The message to send.
   * @private
   */
  private sendToAgent(agentId: string, message: WebSocketMessage): void {
    const agent = this.roomState.agents.get(agentId);
    if (agent) {
      try {
        agent.webSocket.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Failed to send message to agent ${agentId}:`, error);
      }
    }
  }

  /**
   * Logs a message event to the D1 `messages` table.
   * @param {AgentMessage} message - The message to log.
   * @private
   */
  private async logMessage(message: AgentMessage, options?: {
    threadId?: string;
    replyToMessageId?: string;
    epicId?: string;
    taskId?: string;
    messageType?: MessageType;
    senderType?: SenderType;
  }): Promise<string> {
    try {
      const messageId = await logMessage(this.env, {
        projectId: message.projectId,
        threadId: options?.threadId || null,
        replyToMessageId: options?.replyToMessageId || null,
        messageType: options?.messageType || mapLegacyMessageType(message.type),
        senderType: options?.senderType || "agent",
        senderName: message.agentName || "Unknown",
        senderId: message.agentId,
        epicId: options?.epicId || null,
        taskId: options?.taskId || null,
        content: message.content || "",
        metadata: message.metadata || null,
      });

      // Update thread activity if this message is part of a thread
      if (options?.threadId) {
        await updateThreadActivity(this.env, message.projectId, options.threadId);
      }

      // Update in-memory counters and persist room activity summary
      this.roomState.messageCount++;
      await this.updateRoomActivity();

      return messageId;
    } catch (error) {
      console.error("Failed to log message:", error);
      return "";
    }
  }

  /**
   * Handles thread creation via WebSocket.
   */
  private async handleCreateThread(agentId: string, message: any): Promise<void> {
    const agent = this.roomState.agents.get(agentId);
    if (!agent) return;

    try {
      const threadId = await createThread(
        this.env,
        this.roomState.projectId,
        message.subject,
        agent.agentName
      );

      // Broadcast thread creation
      await this.broadcast({
        type: "thread_created",
        data: {
          threadId,
          subject: message.subject,
          createdBy: agent.agentName,
        },
        timestamp: Date.now(),
      });

    } catch (error) {
      console.error("Failed to create thread:", error);
      // Send error back to the agent
      const ws = this.roomState.agents.get(agentId)?.webSocket;
      if (ws) {
        ws.send(JSON.stringify({
          type: "error",
          data: { message: "Failed to create thread" },
          timestamp: Date.now(),
        }));
      }
    }
  }

  /**
   * Handles thread reply via WebSocket.
   */
  private async handleThreadReply(agentId: string, message: any): Promise<void> {
    const agent = this.roomState.agents.get(agentId);
    if (!agent) return;

    const agentMessage: AgentMessage = {
      type: "chat",
      agentId,
      agentName: agent.agentName,
      projectId: this.roomState.projectId,
      content: message.content,
      metadata: {
        ...message.metadata,
        threadId: message.threadId,
        replyToMessageId: message.replyToMessageId,
      },
      timestamp: Date.now(),
    };

    // Broadcast to all agents
    await this.broadcast({
      type: "thread_reply",
      data: {
        agentId,
        agentName: agent.agentName,
        threadId: message.threadId,
        replyToMessageId: message.replyToMessageId,
        content: message.content,
        metadata: message.metadata,
      },
      timestamp: agentMessage.timestamp,
    });

    // Log the message with thread information
    await this.logMessage(agentMessage, {
      threadId: message.threadId,
      replyToMessageId: message.replyToMessageId,
      messageType: "chat",
      senderType: "agent",
    });
  }

  /**
   * Logs a file lock event (either 'locked' or 'released') to the
   * D1 `file_locks` table.
   * @param {FileLock} lock - The lock object.
   * @param {'locked' | 'released'} status - The new status of the lock.
   * @private
   */
  private async logFileLock(
    lock: FileLock,
    status: "locked" | "released",
  ): Promise<void> {
    try {
      if (status === "locked") {
        // Insert a new record for the lock
        const stmt = this.env.DB.prepare(`
          INSERT INTO file_locks (room_id, file_path, agent_id, agent_name, lock_type, status, locked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        await stmt
          .bind(
            this.roomState.projectId,
            lock.filePath,
            lock.agentId,
            lock.agentName || null,
            lock.lockType,
            status,
            lock.timestamp,
          )
          .run();
      } else {
        // Update an existing lock record to mark it as 'released'
        const stmt = this.env.DB.prepare(`
          UPDATE file_locks
          SET status = ?, released_at = ?
          WHERE room_id = ? AND file_path = ? AND agent_id = ? AND status = 'locked' AND released_at IS NULL
        `);

        await stmt
          .bind(
            status,
            Date.now(),
            this.roomState.projectId,
            lock.filePath,
            lock.agentId,
          )
          .run();
      }
    } catch (error) {
      console.error("Failed to log file lock to D1:", error);
    }
  }

  /**
   * Updates the `agent_presence` table in D1 (UPSERT).
   * This provides a snapshot of agent status.
   * @param {string} agentId - The agent's ID.
   * @param {string} agentName - The agent's name.
   * @param {'online' | 'offline'} status - The new presence status.
   * @private
   */
  private async updateAgentPresence(
    agentId: string,
    agentName: string,
    status: "online" | "offline",
  ): Promise<void> {
    try {
      const stmt = this.env.DB.prepare(`
        INSERT INTO agent_presence (room_id, agent_id, agent_name, status, joined_at, last_seen)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(room_id, agent_id) DO UPDATE SET
          status = excluded.status,
          last_seen = excluded.last_seen,
          agent_name = excluded.agent_name
      `);

      const now = Date.now();
      await stmt
        .bind(
          this.roomState.projectId,
          agentId,
          agentName,
          status,
          status === "online" ? now : undefined, // Only set joined_at on new 'online'
          now,
        )
        .run();
    } catch (error) {
      console.error("Failed to update agent presence:", error);
    }
  }

  /**
   * Updates the `rooms` table in D1 (UPSERT).
   * This provides a high-level summary of all rooms.
   * @private
   */
  private async updateRoomActivity(): Promise<void> {
    try {
      const stmt = this.env.DB.prepare(`
        INSERT INTO rooms (id, name, description, active_agents, total_messages, last_activity)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          active_agents = excluded.active_agents,
          total_messages = excluded.total_messages,
          last_activity = datetime('now')
      `);

      await stmt
        .bind(
          this.roomState.projectId,
          this.roomState.name,
          this.roomState.description || null,
          this.roomState.agents.size, // Current active agents
          this.roomState.messageCount, // Total historical messages
        )
        .run();
    } catch (error) {
      console.error("Failed to update room activity:", error);
    }
  }

  /**
   * HTTP Handler for GET /info.
   * Returns a JSON snapshot of the room's current *in-memory* state.
   * @private
   * @returns {Promise<Response>} JSON response.
   */
  private async handleInfo(): Promise<Response> {
    const info = {
      projectId: this.roomState.projectId,
      name: this.roomState.name,
      description: this.roomState.description,
      activeAgents: this.roomState.agents.size,
      agents: Array.from(this.roomState.agents.values()).map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        joinedAt: a.joinedAt,
        lastSeen: a.lastSeen,
      })),
      activeLocks: Array.from(this.roomState.fileLocks.values()),
      messageCount: this.roomState.messageCount,
      createdAt: this.roomState.createdAt,
    };

    return new Response(JSON.stringify(info, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * HTTP Handler for GET /history.
   * Returns a paginated list of messages from the *D1 database*.
   * @param {URL} url - The request URL to parse query params from.
   * @private
   * @returns {Promise<Response>} JSON response.
   */
  private async handleHistory(url: URL): Promise<Response> {
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const result = await this.env.DB.prepare(
      `
      SELECT * FROM messages
      WHERE room_id = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `,
    )
      .bind(this.roomState.projectId, limit, offset)
      .all();

    return new Response(JSON.stringify(result.results || [], null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * HTTP Handler for GET /locks.
   * Returns a JSON list of the current *in-memory* file locks.
   * @private
   * @returns {Promise<Response>} JSON response.
   */
  private async handleLocks(): Promise<Response> {
    const locks = Array.from(this.roomState.fileLocks.values());
    return new Response(JSON.stringify(locks, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }
}