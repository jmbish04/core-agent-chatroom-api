# Agent MCP Client Tools (Inbound)

This directory contains MCP client tools that **our agents** can use to access external tools and services.

## Purpose

**INBOUND MCP** - Giving our worker agents access to external MCP tools and services.

## Structure

```
src/agents/
├── mcp/
│   ├── client.ts      # MCP client manager for agents
│   └── README.md       # This file
└── tools/
    └── mcp/
        └── cloudflareDocs.ts  # Cloudflare documentation query tools
```

## Available Tools

### Cloudflare Docs Tools

- `mcp-cloudflare-docs` - Query Cloudflare documentation using AI
- `mcp-cloudflare-docs-search` - Search docs by specific topic

## Usage in Agents

```typescript
import { executeCloudflareDocsTool } from "../agents/tools/mcp/cloudflareDocs";

// In an agent handler
const result = await executeCloudflareDocsTool(env, "mcp-cloudflare-docs", {
  query: "How do I use Durable Objects?",
  topic: "durable-objects",
});
```

## Adding New Tools

To add a new external MCP tool:

1. Create a new file in `src/agents/mcp/` (e.g., `github.ts`)
2. Define the tool schema and handler
3. Export it from `client.ts`
4. Update `AgentMcpClient` to include the new server

## See Also

- `src/endpoints/mcp/` - For MCP server (exposing our tools to external agents)
- `src/durable-objects/CloudflareDocsMcpAgent.ts` - Durable Object using Agents SDK MCP pattern
- `src/agents/tools/mcp/` - Individual MCP tool implementations

