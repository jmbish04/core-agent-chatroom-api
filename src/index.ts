/**
 * @file This file serves as the main entry point for the Cloudflare Worker.
 * It handles incoming HTTP requests, routes them to different services (API, RPC, WebSocket, static assets),
 * manages scheduled tasks (cron triggers), and exports the Durable Object implementation.
 *
 * @description
 * The worker orchestrates various functionalities:
 * 1.  **API Routing**: Uses `itty-router` (via `./endpoints/api/router.ts`) for standard RESTful API routes under `/api/`.
 * 2.  **OpenAPI Spec**: Dynamically generates and serves `openapi.json` and `openapi.yaml` specifications.
 * 3.  **RPC Handling**: Routes POST requests to `/rpc` to a dedicated RPC handler (`./endpoints/rpc/handler.ts`).
 * 4.  **MCP Handling**: Routes requests starting with `/mcp` to the MCP (Multi-Agent Control Plane) handler (`./mcp.ts`).
 * 5.  **WebSocket/Durable Objects**: Upgrades WebSocket connections on `/ws` and routes them to a `RoomDO` (Durable Object) instance.
 * 6.  **Health Checks**: Serves a static health check page at `/health` and `/health.html`.
 * 7.  **Static Assets**: Serves static assets from the bound ASSETS service for all other routes.
 * 8.  **Scheduled Tasks**: Runs periodic tests via a `scheduled` event handler.
 *
 * @module worker
 * @see {@link ./types.ts} for the `Env` type definition.
 * @see {@link ./endpoints/api/router.ts} for API route definitions.
 * @see {@link ./endpoints/rpc/handler.ts} for JSON-RPC implementation.
 * @see {@link ./mcp.ts} for MCP implementation.
 * @see {@link ./durable-objects/RoomDO.ts} for the Durable Object implementation.
 */

// --- Imports ---

import type { Env } from "./types";
import { createRouter } from "./endpoints/api/router";
import { generateOpenApiDocument } from "./utils/openapi";
import { handleRpc } from "./endpoints/rpc/handler";
import { handleMcpServer } from "./endpoints/mcp/server";
import { runAllTests } from "./tests/runner";
import { getKysely } from "./utils/db";
import { RoomDO } from "./durable-objects/RoomDO";
import { AgentRoomDO } from "./durable-objects/AgentRoomDO";
import { CloudflareDocsMcpAgent } from "./durable-objects/CloudflareDocsMcpAgent";
import { ChatRoom } from "./chatroom";

/**
 * Performs agent activity monitoring and health checks.
 * This function is called by the cron scheduler every 15 minutes.
 *
 * @param env - The environment bindings
 */
async function performAgentMonitoring(env: Env): Promise<void> {
  console.log("Starting agent monitoring cron job");

  try {
    const db = getKysely(env);

    // First, send ping to all active chat rooms to discover active agents
    await pingActiveChatRooms(env);

    // Get all active agent status records (may have been updated by ping)
    const activeAgents = await db
      .selectFrom("agent_status")
      .selectAll()
      .where("status", "in", ["available", "busy", "in_progress", "blocked"])
      .execute();

    console.log(`Found ${activeAgents.length} active agents to monitor`);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    let agentsNotified = 0;
    let agentsOffline = 0;

    for (const agent of activeAgents) {
      // Check if agent has been working on the same task for over 1 hour
      if (agent.currentTaskId && agent.lastActivity) {
        const lastActivity = new Date(agent.lastActivity);

        if (lastActivity < oneHourAgo) {
          console.log(`Agent ${agent.agentName} has been working for over 1 hour, sending pause reminder`);

          // Send pause reminder via WebSocket to the agent's room
          if (env.ROOM_DO) {
            try {
              const roomId = env.ROOM_DO.idFromName("tasks");
              const roomStub = env.ROOM_DO.get(roomId);

              const reminderMessage = {
                type: "system.agent_pause_reminder",
                payload: {
                  agentName: agent.agentName,
                  taskId: agent.currentTaskId,
                  message: "You've been working on this task for over an hour. Consider taking a break or updating your status.",
                  timestamp: new Date().toISOString(),
                },
              };

              // Send the reminder message to the room
              await roomStub.fetch("https://do/broadcast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reminderMessage),
              });

              agentsNotified++;
            } catch (error) {
              console.error(`Failed to send pause reminder to agent ${agent.agentName}:`, error);
            }
          }
        }
      }

      // Check if agent has been inactive for extended period (no activity in last hour)
      // If so, mark them as offline to prevent showing them as "online" when they're not active
      if (agent.lastActivity) {
        const lastActivity = new Date(agent.lastActivity);
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

        if (lastActivity < twoHoursAgo) {
          console.log(`Agent ${agent.agentName} inactive for 2+ hours, marking as offline`);

          await db
            .updateTable("agent_status")
            .set({
              status: "offline",
              updatedAt: new Date().toISOString(),
            })
            .where("agentName", "=", agent.agentName)
            .execute();

          agentsOffline++;
        }
      }
    }

    console.log(`Agent monitoring complete: ${agentsNotified} pause reminders sent, ${agentsOffline} agents marked offline`);

  } catch (error) {
    console.error("Agent monitoring cron job failed:", error);
  }
}

/**
 * Sends ping messages to active chat rooms to discover and engage active agents.
 * This helps identify agents that may not have updated their status in the database.
 */
async function pingActiveChatRooms(env: Env): Promise<void> {
  console.log("Pinging active chat rooms to discover agents");

  try {
    // Get all active chat rooms (we'll ping the main "tasks" room)
    if (env.ROOM_DO) {
      const roomId = env.ROOM_DO.idFromName("tasks");
      const roomStub = env.ROOM_DO.get(roomId);

      // Send a ping message to the room asking for active agents
      const pingMessage = {
        type: "system.agent_ping",
        payload: {
          message: "Are there any active agents in this room? Please respond with your current status and what you're working on.",
          timestamp: new Date().toISOString(),
          pingId: crypto.randomUUID(),
        },
      };

      await roomStub.fetch("https://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pingMessage),
      });

      console.log("Sent agent ping to tasks room");
    }

    // Also check for any agents that haven't responded to recent pings
    // and mark them as potentially offline
    const db = getKysely(env);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

    const unresponsiveAgents = await db
      .selectFrom("agent_status")
      .selectAll()
      .where("status", "in", ["available", "busy", "in_progress", "blocked"])
      .where("lastActivity", "<", thirtyMinutesAgo.toISOString())
      .execute();

    if (unresponsiveAgents.length > 0) {
      console.log(`Found ${unresponsiveAgents.length} agents that haven't been active recently`);

      // Send a direct ping to these agents via their status updates
      for (const agent of unresponsiveAgents) {
        console.log(`Sending direct ping to unresponsive agent: ${agent.agentName}`);

        // Update their status to require attention
        await db
          .updateTable("agent_status")
          .set({
            requiresAttention: 1,
            attentionReason: "No recent activity detected - please check in",
            updatedAt: new Date().toISOString(),
          })
          .where("agentName", "=", agent.agentName)
          .execute();
      }
    }

  } catch (error) {
    console.error("Failed to ping active chat rooms:", error);
  }
}

// --- Constants ---

/**
 * The main router instance for handling API requests.
 * @see {@link ./endpoints/api/router.ts}
 */
const router = createRouter();

/**
 * The default room name to use for WebSocket connections if no 'room'
 * query parameter is specified.
 */
const defaultRoom = "tasks";

// --- Utility Functions ---

/**
 * Creates a standard JSON response with the correct content-type header.
 *
 * @param {unknown} body - The JavaScript object to be serialized into JSON.
 * @param {ResponseInit} [init={}] - Optional custom ResponseInit options (e.g., status, headers).
 * @returns {Response} A Response object with a JSON string body.
 */
const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
    status: init.status ?? 200,
  });

// --- Worker Handler ---

/**
 * The main Cloudflare Worker definition.
 * It contains the `fetch` handler for HTTP requests and the `scheduled` handler for cron triggers.
 */
export default {
  /**
   * Handles incoming HTTP requests for the worker.
   * This function acts as the primary request router, directing traffic
   * based on the request URL pathname and method.
   *
   * @param {Request} request - The incoming HTTP request object.
   * @param {Env} env - The environment bindings (secrets, KV, DOs, etc.).
   * @param {ExecutionContext} ctx - The execution context of the request.
   * @returns {Promise<Response>} A promise that resolves to the HTTP response.
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    /**
     * @description
     * Route: /openapi.json
     * Dynamically generates and serves the OpenAPI 3.0 specification as JSON.
     */
    if (url.pathname === "/openapi.json") {
      const document = generateOpenApiDocument({ request, env });
      return jsonResponse(document.json);
    }

    /**
     * @description
     * Route: /openapi.yaml
     * Dynamically generates and serves the OpenAPI 3.0 specification as YAML.
     */
    if (url.pathname === "/openapi.yaml") {
      const document = generateOpenApiDocument({ request, env });
      return new Response(document.yaml, {
        headers: { "content-type": "application/yaml" },
      });
    }

    /**
     * @description
     * Route: /rpc (Method: POST)
     * Forwards the request to the JSON-RPC handler.
     * @see {@link ./endpoints/rpc/handler.ts}
     */
    if (url.pathname === "/rpc" && request.method === "POST") {
      return handleRpc(request, env, ctx);
    }

    /**
     * @description
     * Route: /mcp/docs/*
     * Handles MCP protocol requests for Cloudflare Docs MCP Agent
     * Uses the Agents SDK MCP server pattern
     * 
     * Note: This is for our agents to use Cloudflare docs tools (INBOUND MCP).
     * The /mcp/* route below exposes our tools to external agents (OUTBOUND MCP).
     */
    if (url.pathname.startsWith("/mcp/docs") && env.CLOUDFLARE_DOCS_MCP) {
      // Route to the Durable Object using the Agents SDK pattern
      const id = env.CLOUDFLARE_DOCS_MCP.idFromName("default");
      const stub = env.CLOUDFLARE_DOCS_MCP.get(id);
      return stub.fetch(request);
    }

    /**
     * @description
     * Route: /mcp/*
     * MCP Server: Exposes our chatroom API as MCP tools for external agents.
     * This is for OUTBOUND MCP - making our capabilities available to external MCP clients.
     * @see {@link ./endpoints/mcp/server.ts}
     */
    if (url.pathname.startsWith("/mcp") && !url.pathname.startsWith("/mcp/docs")) {
      return handleMcpServer(request, env, ctx);
    }

    /**
     * @description
     * Route: /ws
     * Handles WebSocket upgrade requests. It gets or creates a Durable Object
     * stub based on the 'room' query parameter (or `defaultRoom`) and forwards
     * the request to it. The Durable Object (`RoomDO`) will handle the upgrade.
     * @see {@link ./durable-objects/RoomDO.ts}
     */
    if (url.pathname === "/ws") {
      const roomId = url.searchParams.get("room") ?? defaultRoom;
      const useAgent = url.searchParams.get("agent") === "true";
      
      // Use AgentRoomDO if agent=true, otherwise use RoomDO
      if (useAgent && env.AGENT_ROOM_DO) {
        const id = env.AGENT_ROOM_DO.idFromName(roomId);
        const stub = env.AGENT_ROOM_DO.get(id);
        return stub.fetch(request);
      }
      
      // Default to RoomDO
      const id = env.ROOM_DO.idFromName(roomId);
      const stub = env.ROOM_DO.get(id);
      return stub.fetch(request);
    }

    /**
     * @description
     * Route: /health or /health.html
     * Serves a static health check HTML page from the ASSETS binding.
     * This rewrites the URL to fetch /health.html explicitly.
     */
    if (url.pathname === "/health" || url.pathname === "/health.html") {
      const assetUrl = new URL("/health.html", request.url);
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }

    /**
     * @description
     * Route: /projects
     * Serves the projects list page from the ASSETS binding.
     */
    if (url.pathname === "/projects") {
      const assetUrl = new URL("/projects.html", request.url);
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }

    /**
     * @description
     * Route: /projects/:id
     * Serves the individual project view page from the ASSETS binding.
     */
    if (url.pathname.startsWith("/projects/") && url.pathname !== "/projects") {
      const assetUrl = new URL("/project.html", request.url);
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }

    /**
     * @description
     * Route: /api/*
     * Forwards all requests starting with /api/ to the `itty-router` instance
     * for standard RESTful API handling.
     * @see {@link ./endpoints/api/router.ts}
     */
    if (url.pathname.startsWith("/api/")) {
      return router.fetch(request, env, ctx);
    }

    /**
     * @description
     * Default Route (Fallback)
     * Serves static assets (e.g., frontend application) from the ASSETS
     * service binding for any request that doesn't match the routes above.
     */
    return env.ASSETS.fetch(request);
  },

  /**
   * Handles scheduled events (cron triggers).
   * This function is triggered by the cron schedule defined in `wrangler.toml`.
   * It runs health tests and performs agent activity monitoring.
   *
   * @param {ScheduledEvent} _event - The scheduled event object (unused).
   * @param {Env} env - The environment bindings.
   * @param {ExecutionContext} ctx - The execution context.
   * @returns {Promise<void>}
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    /**
     * @description
     * Runs all defined tests and waits for them to complete.
     * This is used for periodic health checks or integration tests.
     * @see {@link ./tests/runner.ts}
     */
    ctx.waitUntil(
      runAllTests(env, {
        reason: "scheduled-cron",
        concurrency: 3,
      }),
    );

    /**
     * @description
     * Performs agent activity monitoring and health checks.
     * This monitors active agents and ensures they're not overworking.
     */
    ctx.waitUntil(
      performAgentMonitoring(env),
    );
  },
};

// --- Exports ---

/**
 * Re-exports all Durable Object classes.
 * This makes them accessible to the Cloudflare runtime for instantiation.
 * @see {@link ./durable-objects/RoomDO.ts}
 * @see {@link ./durable-objects/AgentRoomDO.ts}
 * @see {@link ./durable-objects/CloudflareDocsMcpAgent.ts}
 * @see {@link ./chatroom.ts}
 */
export { RoomDO, AgentRoomDO, CloudflareDocsMcpAgent, ChatRoom };