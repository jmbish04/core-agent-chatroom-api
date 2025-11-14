/**
 * @file MCP Server Entry Point
 * 
 * @description
 * This module exposes our chatroom API as MCP tools for external agents to use.
 * This is for OUTBOUND MCP - making our capabilities available to external MCP clients.
 * 
 * For agent MCP tools (our agents using external tools), see src/agents/mcp/
 * 
 * @deprecated This file is kept for backward compatibility.
 * New code should use src/endpoints/mcp/server.ts directly.
 * 
 * @module mcp
 * @see {@link ./endpoints/mcp/server.ts} for the actual MCP server implementation
 * @see {@link ./agents/mcp/} for agent MCP client tools
 */

import { handleMcpServer } from "./endpoints/mcp/server";

/**
 * Legacy MCP handler - delegates to the new handler
 * Kept for backward compatibility
 */
export const handleMcp = handleMcpServer;