/**
 * MCP Client for Agents
 * 
 * This provides an MCP client that our agents can use to connect to external MCP servers
 * and use their tools. This is for INBOUND MCP - our agents using external tools.
 * 
 * Currently includes Cloudflare Docs tools, but can be extended to connect to
 * other MCP servers.
 */

import type { Env } from "../../types";
import {
  getCloudflareDocsTools,
  executeCloudflareDocsTool,
} from "../../agents/tools/mcp/cloudflareDocs";

/**
 * MCP Client Manager for our agents
 * Manages connections to external MCP servers and provides tool access
 */
export class AgentMcpClient {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Get all available tools from connected MCP servers
   */
  getAvailableTools() {
    return {
      "cloudflare-docs": getCloudflareDocsTools(),
    };
  }

  /**
   * Execute a tool from a connected MCP server
   */
  async executeTool(serverId: string, toolName: string, params: unknown) {
    if (serverId === "cloudflare-docs") {
      return await executeCloudflareDocsTool(this.env, toolName, params);
    }

    throw new Error(`Unknown MCP server: ${serverId}`);
  }

  /**
   * List all tools from all connected servers
   */
  listAllTools() {
    const tools: Array<{
      server: string;
      name: string;
      description: string;
    }> = [];

    const available = this.getAvailableTools();
    for (const [serverId, serverTools] of Object.entries(available)) {
      for (const tool of serverTools) {
        tools.push({
          server: serverId,
          name: tool.name,
          description: tool.description,
        });
      }
    }

    return tools;
  }
}

