# Architecture Overview

This document explains the separation between MCP Server (outbound) and Agent MCP Tools (inbound).

## Directory Structure

```
src/
├── endpoints/                    # Worker surface area (REST, RPC, MCP)
│   ├── api/
│   │   └── router.ts             # Hono REST API
│   ├── rpc/
│   │   └── handler.ts            # JSON-RPC entrypoint
│   └── mcp/
│       └── server.ts             # MCP server exposing our tools
│
├── agents/                       # Agent MCP Client Tools (INBOUND)
│   ├── mcp/
│   │   ├── client.ts             # MCP client manager
│   │   └── README.md             # Agent MCP tools documentation
│   └── tools/
│       └── mcp/
│           └── cloudflareDocs.ts # Cloudflare docs tools for our agents
│
└── durable-objects/
    ├── AgentRoomDO.ts            # Durable Object for agent coordination
    ├── CloudflareDocsMcpAgent.ts # Durable Object using Agents SDK MCP pattern
    └── RoomDO.ts                 # Base chatroom Durable Object
```

## Two Separate Concerns

### 1. MCP Server (Outbound) - `src/endpoints/mcp/`

**Purpose**: Expose our chatroom API capabilities as MCP tools for **external agents** to use.

**Who uses it**: External MCP clients (ChatGPT, Claude, other AI assistants)

**Endpoints**:
- `GET /mcp/tools` - List available tools
- `POST /mcp/execute` - Execute a tool

**Tools exposed**: All tools from `rpcRegistry`:
- `tasks.list`, `tasks.open`, `tasks.reassign`
- `tests.run`, `tests.latest`
- `analysis.run`
- `docs.query`, `docs.search`

**File**: `src/endpoints/mcp/server.ts`

### 2. Agent MCP Tools (Inbound) - `src/agents/tools/mcp/`

**Purpose**: Give **our agents** access to external MCP tools and services.

**Who uses it**: Our own worker agents (like `AgentRoomDO`)

**Tools available**:
- `mcp-cloudflare-docs` - Query Cloudflare documentation
- `mcp-cloudflare-docs-search` - Search docs by topic

**Files**:
- `src/agents/tools/mcp/cloudflareDocs.ts` - Tool implementations
- `src/agents/mcp/client.ts` - Client manager

## Usage Examples

### External Agent Using Our MCP Server

```bash
# List available tools
curl https://your-worker.workers.dev/mcp/tools

# Execute a tool
curl -X POST https://your-worker.workers.dev/mcp/execute \
  -d '{"tool":"tasks.list","params":{"status":"open"}}'
```

### Our Agent Using External MCP Tools

```typescript
import { executeCloudflareDocsTool } from "../agents/tools/mcp/cloudflareDocs";

// In AgentRoomDO or other agent
const result = await executeCloudflareDocsTool(env, "mcp-cloudflare-docs", {
  query: "How do I use Durable Objects?",
  topic: "durable-objects",
});
```

## Key Differences

| Aspect | MCP Server (Outbound) | Agent MCP Tools (Inbound) |
|--------|----------------------|-------------------------|
| **Direction** | Our tools → External agents | External tools → Our agents |
| **Location** | `src/endpoints/mcp/` | `src/agents/tools/mcp/` |
| **Purpose** | Expose our API | Access external services |
| **Users** | ChatGPT, Claude, etc. | Our worker agents |
| **Protocol** | MCP Server (handles requests) | MCP Client (makes requests) |

## Benefits of Separation

1. **Clear boundaries**: Easy to understand what's exposed vs. what's consumed
2. **Modularity**: Can add new external tools without affecting our API
3. **Maintainability**: Changes to one don't affect the other
4. **Scalability**: Can add multiple external MCP servers independently

