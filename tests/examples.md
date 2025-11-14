# Usage Examples

## REST

```bash
# Health snapshot
curl -s https://core-agent-chatroom-api.hacolby.workers.dev/api/health | jq

# Trigger tests and poll session
SESSION=$(curl -s -X POST https://core-agent-chatroom-api.hacolby.workers.dev/api/tests/run \
  -H "content-type: application/json" \
  -d '{"reason":"docs"}' | jq -r '.data.sessionUuid')

curl -s https://core-agent-chatroom-api.hacolby.workers.dev/api/tests/session/$SESSION | jq

# Task search
curl -s "https://core-agent-chatroom-api.hacolby.workers.dev/api/tasks/search?q=websocket" | jq

# Bulk reassign tasks
curl -s -X POST https://core-agent-chatroom-api.hacolby.workers.dev/api/tasks/reassign \
  -H "content-type: application/json" \
  -d '{"taskIds":["task-id-1","task-id-2"],"agent":"Agent Phoenix"}' | jq

# Agent check-in (blocked example)
curl -s -X POST https://core-agent-chatroom-api.hacolby.workers.dev/api/agents/check-in \
  -H "content-type: application/json" \
  -d '{"agentName":"Agent Nova","status":"blocked","taskId":"11111111-2222-3333-4444-555555555555","note":"Waiting on review"}' | jq

# Block / Unblock workflow
curl -s -X POST https://core-agent-chatroom-api.hacolby.workers.dev/api/tasks/11111111-2222-3333-4444-555555555555/block \
  -H "content-type: application/json" \
  -d '{"blockedAgent":"Agent Nova","blockingOwner":"Reviewer","reason":"Stuck on security questions"}' | jq

curl -s -X POST https://core-agent-chatroom-api.hacolby.workers.dev/api/tasks/11111111-2222-3333-4444-555555555555/unblock \
  -H "content-type: application/json" \
  -d '{"blockedAgent":"Agent Nova","resolvedBy":"Reviewer","note":"PR approved"}' | jq
```

## WebSocket

```js
const ws = new WebSocket('wss://core-agent-chatroom-api.hacolby.workers.dev/ws?room=tasks');
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'agents.register', payload: { agentName: 'Human-Orchestrator' }}));
  ws.send(JSON.stringify({ type: 'tasks.fetchOpen', requestId: crypto.randomUUID() }));
});
ws.addEventListener('message', (evt) => console.log(JSON.parse(evt.data)));

// Confirm an unblock from the reminder stream
ws.send(JSON.stringify({ type: 'agents.ackUnblock', payload: { taskId: '11111111-2222-3333-4444-555555555555', agentName: 'Human-Orchestrator' }}));
```

## RPC

```bash
curl -s -X POST https://core-agent-chatroom-api.hacolby.workers.dev/rpc \
  -H "content-type: application/json" \
  -d '{"method":"tasks.list","params":{"status":"in_progress"}}' | jq
```

## MCP

```bash
# List all available tools (including new Cloudflare docs tools)
curl -s https://core-agent-chatroom-api.hacolby.workers.dev/mcp/tools | jq

# Query Cloudflare documentation
curl -s -X POST https://core-agent-chatroom-api.hacolby.workers.dev/mcp/execute \
  -H "content-type: application/json" \
  -d '{"tool":"docs.query","params":{"query":"How do I use Durable Objects with WebSocket hibernation?","topic":"durable-objects"}}' | jq

# Search docs by topic
curl -s -X POST https://core-agent-chatroom-api.hacolby.workers.dev/mcp/execute \
  -H "content-type: application/json" \
  -d '{"tool":"docs.search","params":{"topic":"agents","question":"How do I create a stateful agent?"}}' | jq

# Run analysis
curl -s -X POST https://core-agent-chatroom-api.hacolby.workers.dev/mcp/execute \
  -H "content-type: application/json" \
  -d '{"tool":"analysis.run","params":{"target":"ws-room","depth":"deep"}}' | jq
```

## Stateful Agent Room (WebSocket)

Connect to the stateful agent room with AI capabilities:

```js
// Connect to agent-enabled room
const ws = new WebSocket('wss://core-agent-chatroom-api.hacolby.workers.dev/ws?room=tasks&agent=true');
ws.addEventListener('open', () => {
  // Register agent
  ws.send(JSON.stringify({ 
    type: 'agents.register', 
    payload: { agentName: 'AI-Assistant' } 
  }));
  
  // Query Cloudflare docs via WebSocket
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
  }
});
```

