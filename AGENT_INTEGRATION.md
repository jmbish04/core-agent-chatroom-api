# Cloudflare Agents SDK Integration

This document describes the integration of Cloudflare Agents SDK patterns and MCP tools for querying Cloudflare documentation.

## Overview

The application now includes:

1. **Stateful Agent Room** (`AgentRoomDO`) - A Durable Object with persistent state management
2. **Cloudflare Docs Query Tools** - MCP tools for querying Cloudflare documentation using Workers AI
3. **Enhanced State Persistence** - Agent preferences, query history, and coordination patterns

## Features

### 1. Stateful Agent Room (`AgentRoomDO`)

The `AgentRoomDO` extends the basic `RoomDO` with:

- **Persistent State**: Uses Durable Object storage to maintain:
  - Agent preferences (preferred topics, last queries)
  - Query history (last 100 queries)
  - Coordination patterns (successful interaction patterns)
  - Room metadata (creation time, last activity)

- **AI-Powered Docs Queries**: Agents can query Cloudflare documentation directly via WebSocket

- **Learning Capabilities**: Tracks successful coordination patterns to improve future interactions

### 2. Cloudflare Docs MCP Tools

Two new MCP tools are available:

#### `docs.query`
Query Cloudflare documentation with AI assistance.

**Parameters:**
- `query` (string, required): The question or topic to search for
- `topic` (enum, optional): Focus area - `workers`, `durable-objects`, `d1`, `r2`, `ai`, `agents`, or `general`
- `maxResults` (number, optional): Maximum number of sources to return (1-10, default: 5)

**Example:**
```bash
curl -X POST https://your-worker.workers.dev/mcp/execute \
  -H "content-type: application/json" \
  -d '{
    "tool": "docs.query",
    "params": {
      "query": "How do I use Durable Objects with WebSocket hibernation?",
      "topic": "durable-objects",
      "maxResults": 5
    }
  }'
```

#### `docs.search`
Search documentation for a specific Cloudflare service topic.

**Parameters:**
- `topic` (string, required): The Cloudflare service (e.g., "workers", "agents", "durable-objects")
- `question` (string, required): The question to ask about this topic

**Example:**
```bash
curl -X POST https://your-worker.workers.dev/mcp/execute \
  -H "content-type: application/json" \
  -d '{
    "tool": "docs.search",
    "params": {
      "topic": "agents",
      "question": "How do I create a stateful agent?"
    }
  }'
```

## Usage

### WebSocket Connection to Stateful Agent Room

Connect to the agent-enabled room:

```javascript
const ws = new WebSocket('wss://your-worker.workers.dev/ws?room=tasks&agent=true');

ws.addEventListener('open', () => {
  // Register agent
  ws.send(JSON.stringify({ 
    type: 'agents.register', 
    payload: { agentName: 'AI-Assistant' } 
  }));
  
  // Query Cloudflare docs
  ws.send(JSON.stringify({ 
    type: 'docs.query', 
    payload: { 
      query: 'How do I use Workers AI?',
      topic: 'ai'
    },
    requestId: crypto.randomUUID()
  }));
});

ws.addEventListener('message', (evt) => {
  const msg = JSON.parse(evt.data);
  if (msg.type === 'docs.queryResult') {
    console.log('Answer:', msg.payload.answer);
    console.log('Sources:', msg.payload.sources);
    console.log('Confidence:', msg.payload.confidence);
  }
});
```

### RPC Method

You can also use the RPC endpoint:

```bash
curl -X POST https://your-worker.workers.dev/rpc \
  -H "content-type: application/json" \
  -d '{
    "method": "docs.query",
    "params": {
      "query": "What is WebSocket hibernation?",
      "topic": "durable-objects"
    }
  }'
```

## Benefits

### 1. Persistent Agent Memory
- Agents remember their preferred topics and past queries
- Query history helps agents learn common patterns
- Coordination patterns improve task assignment

### 2. Intelligent Documentation Access
- AI-powered search through Cloudflare docs
- Context-aware answers based on service topics
- Direct links to official documentation

### 3. Enhanced Coordination
- Agents can query docs to resolve blockers
- Learn from successful coordination patterns
- Improve task assignment based on history

### 4. Cost Efficiency
- WebSocket hibernation reduces resource usage
- State persists across sessions
- Only active agents consume resources

## Configuration

### Wrangler Configuration

The `wrangler.jsonc` includes:

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "AGENT_ROOM_DO",
        "class_name": "AgentRoomDO"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v3",
      "new_classes": ["AgentRoomDO"]
    }
  ]
}
```

### Environment Variables

Ensure your `wrangler.jsonc` or environment includes:

- `AI` binding for Workers AI (required for docs queries)
- `DB` binding for D1 database (for task management)

## State Management

The `AgentRoomDO` maintains state in Durable Object storage:

```typescript
interface RoomState {
  roomId: string;
  initialized: boolean;
  createdAt: string;
  lastActivity: string;
  agentPreferences: Record<string, {
    preferredTopics: string[];
    lastQuery?: string;
  }>;
  queryHistory: Array<{
    query: string;
    topic?: string;
    timestamp: string;
  }>;
  coordinationPatterns: Array<{
    pattern: string;
    timestamp: string;
    success: boolean;
  }>;
}
```

## Future Enhancements

Potential improvements:

1. **Agent Learning**: Use query history to suggest better task assignments
2. **Predictive Coordination**: Analyze patterns to predict conflicts
3. **Auto-Documentation**: Generate docs from coordination patterns
4. **Multi-Agent Collaboration**: Enable agents to share learned patterns
5. **Advanced AI Features**: Use Workers AI for intelligent task routing

## Troubleshooting

### Docs queries fail
- Ensure `AI` binding is configured in `wrangler.jsonc`
- Check that Workers AI is enabled in your Cloudflare account
- Verify the AI model is available: `@cf/meta/llama-3-8b-instruct`

### State not persisting
- Check Durable Object storage limits
- Verify migrations are applied: `wrangler migrations apply`
- Check for storage errors in logs

### WebSocket connection fails
- Ensure `AGENT_ROOM_DO` binding is configured
- Check that migration v3 is applied
- Verify the `agent=true` query parameter is set

