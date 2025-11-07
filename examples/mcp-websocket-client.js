#!/usr/bin/env node

/**
 * MCP WebSocket Client for Agent Coordination
 *
 * This script connects to the Core Agent Chatroom API via WebSocket
 * and can be used as an MCP (Model Context Protocol) tool.
 *
 * Usage:
 *   node mcp-websocket-client.js
 *
 * Environment Variables:
 *   WS_URL - WebSocket URL (e.g., wss://your-worker.workers.dev/ws/default)
 *   AGENT_ID - Unique agent identifier
 *   AGENT_NAME - Human-readable agent name
 *   ROOM_ID - Room to join (default: 'default')
 */

const WebSocket = require('ws');

// Configuration from environment variables
const wsBaseUrl = process.env.WS_URL || 'ws://localhost:8787/ws';
const roomId = process.env.ROOM_ID || 'default';
const agentId = process.env.AGENT_ID || `mcp-agent-${Date.now()}`;
const agentName = process.env.AGENT_NAME || 'MCP Agent';

// Build full WebSocket URL
const wsUrl = `${wsBaseUrl}/${roomId}?agentId=${agentId}&agentName=${encodeURIComponent(agentName)}`;

console.error(`[MCP Client] Connecting to ${wsUrl}`);

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000;

function connect() {
  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.error('[MCP Client] Connected successfully');
    reconnectAttempts = 0;

    // Send a welcome message
    send({
      type: 'chat',
      content: `${agentName} connected via MCP`
    });

    // Listen for commands from stdin (MCP protocol)
    process.stdin.on('data', (data) => {
      try {
        const input = data.toString().trim();
        if (!input) return;

        const command = JSON.parse(input);
        send(command);
      } catch (e) {
        console.error('[MCP Client] Invalid command:', e.message);
      }
    });
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Forward all messages to stdout (for MCP to consume)
      console.log(JSON.stringify(message));

      // Log to stderr for debugging (won't interfere with MCP)
      console.error(`[MCP Client] Received: ${message.type}`);
    } catch (e) {
      console.error('[MCP Client] Failed to parse message:', e.message);
    }
  });

  ws.on('error', (error) => {
    console.error('[MCP Client] WebSocket error:', error.message);
  });

  ws.on('close', (code, reason) => {
    console.error(`[MCP Client] Disconnected (${code}): ${reason || 'No reason provided'}`);

    // Attempt to reconnect
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.error(`[MCP Client] Reconnecting in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      setTimeout(connect, RECONNECT_DELAY);
    } else {
      console.error('[MCP Client] Max reconnection attempts reached. Exiting.');
      process.exit(1);
    }
  });
}

function send(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    console.error(`[MCP Client] Sent: ${message.type}`);
  } else {
    console.error('[MCP Client] Cannot send message: WebSocket not open');
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.error('[MCP Client] Received SIGINT, closing connection...');
  if (ws) {
    ws.close();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[MCP Client] Received SIGTERM, closing connection...');
  if (ws) {
    ws.close();
  }
  process.exit(0);
});

// Start the connection
connect();

// Keep the process alive
process.stdin.resume();
