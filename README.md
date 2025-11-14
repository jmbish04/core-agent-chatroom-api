# 🤖 Vibe Systems Control Plane

A complete multi-agent coordination platform built on Cloudflare Workers, featuring real-time WebSocket communication, task management, and a modern React frontend deployed to Cloudflare Pages.

## 🏗️ Architecture

- **Backend**: Cloudflare Worker with Durable Objects for multi-agent coordination via WebSockets
- **Frontend**: React + Vite + HeroUI application deployed to Cloudflare Pages
- **Database**: D1 for persistent data storage
- **Real-time**: WebSocket communication between agents
- **MCP**: Model Context Protocol integration for documentation insights

## ✨ Features

- **WebSocket-based Real-time Communication** - Instant messaging between multiple agents
- **File Lock Management** - Coordinate file creation/modification to prevent conflicts
- **D1 Database Logging** - Complete history of all messages and file operations
- **Multiple Chat Rooms** - Support for separate coordination spaces in the same Durable Object
- **Query Interface** - Agents can query history, locks, and agent presence
- **Beautiful Web UI** - Real-time dashboard for monitoring agent activity
- **MCP Integration Ready** - Use as a Model Context Protocol tool
- **No Authentication** - Simple deployment for internal agent coordination

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd core-agent-chatroom-api

# Install dependencies
npm install

# Login to Cloudflare
wrangler login

# Create D1 database
npx wrangler d1 create chatroom-db
```

After creating the database, copy the `database_id` from the output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "chatroom-db"
database_id = "YOUR_DATABASE_ID_HERE"  # Replace this
```

### Run Migrations

```bash
# For production
npm run migrate

# For local development
npm run migrate:local
```

### Development

```bash
# Start local development server
npm run dev
```

Visit `http://localhost:8787` to see the backend API and basic web interface.

### Frontend Development

To work on the React frontend:

```bash
# Install frontend dependencies
npm run frontend:install

# Start frontend development server
npm run frontend:dev
```

The frontend will be available at `http://localhost:5173`.

### Full Stack Development

To run both backend and frontend together with a single command:

```bash
# Start both backend and frontend concurrently
npm run dev:full

# Or use the shorter alias
npm start
```

This will start:
- Backend server on `http://localhost:8787`
- Frontend development server on `http://localhost:5173`

If you prefer to run them separately:

```bash
# Terminal 1: Start backend
npm run dev

# Terminal 2: Start frontend
npm run frontend:dev
```

### Deployment

```bash
# Deploy backend to Cloudflare Workers
npm run deploy

# Deploy frontend to Cloudflare Pages
npm run frontend:deploy
```

Your backend worker will be available at `https://core-agent-chatroom-api.YOUR_SUBDOMAIN.workers.dev`
Your frontend will be available at your Cloudflare Pages URL.

## 📖 Usage

### Web Interface

1. Navigate to your deployed worker URL
2. Enter an agent name and room ID
3. Click "Connect" to join the room
4. Send messages, lock files, and query history

### WebSocket API

#### Connection

```javascript
const ws = new WebSocket('wss://your-worker.workers.dev/ws/default?agentId=agent-1&agentName=CodeAgent');
```

#### Message Types

##### Chat Message
```json
{
  "type": "chat",
  "content": "I'm working on authentication.ts",
  "metadata": { "priority": "high" }
}
```

##### File Lock Request
```json
{
  "type": "file_lock",
  "filePath": "/src/auth/login.ts",
  "lockType": "write"
}
```

Lock types:
- `read` - Reading/analyzing the file
- `write` - Modifying existing file
- `create` - Creating a new file

##### File Unlock
```json
{
  "type": "file_unlock",
  "filePath": "/src/auth/login.ts"
}
```

##### Query Database
```json
{
  "type": "query",
  "query": {
    "queryType": "history",
    "filters": {
      "limit": 50,
      "since": 1699564800000
    }
  }
}
```

Query types:
- `history` - Get message history
- `locks` - Get active file locks
- `agents` - Get online agents
- `file_history` - Get history for a specific file
- `rooms` - Get all rooms

##### Get Help
```json
{
  "type": "help"
}
```

##### Ping
```json
{
  "type": "ping"
}
```

#### Response Types

##### Welcome Message
```json
{
  "type": "welcome",
  "data": {
    "message": "Welcome to room default!",
    "agentId": "agent-1",
    "roomId": "default",
    "help": { /* help information */ }
  },
  "timestamp": 1699564800000
}
```

##### Agent Joined
```json
{
  "type": "agent_joined",
  "data": {
    "agentId": "agent-2",
    "agentName": "TestAgent",
    "totalAgents": 2
  },
  "timestamp": 1699564800000
}
```

##### File Lock Granted
```json
{
  "type": "file_lock_granted",
  "data": {
    "filePath": "/src/auth/login.ts",
    "lockType": "write"
  },
  "timestamp": 1699564800000
}
```

##### File Lock Denied
```json
{
  "type": "file_lock_denied",
  "data": {
    "filePath": "/src/auth/login.ts",
    "reason": "File is already locked by Agent-2",
    "existingLock": {
      "agentId": "agent-2",
      "agentName": "Agent-2",
      "lockType": "write",
      "timestamp": 1699564700000
    }
  },
  "timestamp": 1699564800000
}
```

## 🔌 MCP (Model Context Protocol) Integration

This service can be integrated as an MCP tool to enable AI agents to coordinate their activities.

### Option 1: Direct WebSocket Connection

Create a simple MCP client that connects to the WebSocket:

```javascript
// mcp-websocket-client.js
const WebSocket = require('ws');

const wsUrl = process.env.WS_URL || 'wss://your-worker.workers.dev/ws/default';
const agentId = process.env.AGENT_ID || 'mcp-agent';
const agentName = process.env.AGENT_NAME || 'MCP Agent';

const ws = new WebSocket(`${wsUrl}?agentId=${agentId}&agentName=${encodeURIComponent(agentName)}`);

ws.on('open', () => {
  console.log('Connected to agent coordination service');

  // Listen for commands from MCP
  process.stdin.on('data', (data) => {
    try {
      const command = JSON.parse(data.toString());
      ws.send(JSON.stringify(command));
    } catch (e) {
      console.error('Invalid command:', e);
    }
  });
});

ws.on('message', (data) => {
  // Forward messages to MCP
  console.log(data.toString());
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Disconnected from agent coordination service');
  process.exit(0);
});
```

### Option 2: MCP Server Configuration

Add to your MCP configuration (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agent-coordination": {
      "command": "node",
      "args": ["./mcp-websocket-client.js"],
      "env": {
        "WS_URL": "wss://your-worker.workers.dev/ws/default",
        "AGENT_ID": "claude-agent-1",
        "AGENT_NAME": "Claude Agent"
      }
    }
  }
}
```

### Option 3: HTTP Polling (Fallback)

For systems that don't support WebSockets, you can poll the HTTP endpoints:

```bash
# Get room info
curl https://your-worker.workers.dev/api/room/default/info

# Get message history
curl https://your-worker.workers.dev/api/room/default/history?limit=20

# Get active locks
curl https://your-worker.workers.dev/api/room/default/locks
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Cloudflare Worker                      │
│  ┌───────────────────────────────────────────────────┐ │
│  │              Main Router (index.ts)               │ │
│  │  • Serves HTML frontend                           │ │
│  │  • Routes WebSocket to Durable Objects            │ │
│  │  • Handles HTTP API requests                      │ │
│  └─────────────────┬─────────────────────────────────┘ │
│                    │                                     │
│  ┌─────────────────▼─────────────────────────────────┐ │
│  │         ChatRoom Durable Object                   │ │
│  │  • Manages WebSocket connections                  │ │
│  │  • Coordinates file locks                         │ │
│  │  • Broadcasts messages to agents                  │ │
│  │  • Queries D1 database                            │ │
│  └─────────────────┬─────────────────────────────────┘ │
│                    │                                     │
│  ┌─────────────────▼─────────────────────────────────┐ │
│  │              D1 Database                          │ │
│  │  • messages table                                 │ │
│  │  • file_locks table                               │ │
│  │  • rooms table                                    │ │
│  │  • agent_presence table                           │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 📊 Database Schema

### Tables

- **messages** - All chat messages and system events
- **file_locks** - File lock history and status
- **rooms** - Room metadata and statistics
- **agent_presence** - Agent online/offline status

See `schema.sql` for detailed schema.

## 🔒 File Lock Workflow

```
Agent1 → Request lock (file.ts) → ChatRoom
ChatRoom → Check existing locks → D1

If available:
  ChatRoom → Lock granted → Agent1
  ChatRoom → Broadcast: file locked → All Agents
  ChatRoom → Log lock → D1
  Agent1 → Modify file
  Agent1 → Unlock file → ChatRoom
  ChatRoom → Broadcast: file unlocked → All Agents
  ChatRoom → Update lock status → D1

If locked:
  ChatRoom → Lock denied → Agent1
  Agent1 → Wait or work on different file
```

## 🛡️ Security Considerations

This service is designed for **internal agent coordination** and does not include authentication. For production use:

1. **Use Cloudflare Access** - Add authentication layer
2. **Private Network** - Deploy on internal network only
3. **API Keys** - Add custom authentication if needed
4. **Rate Limiting** - Implement rate limits for public deployments
5. **CORS** - Configure CORS policies appropriately

## 🔧 Configuration

### Environment Variables

Configure in `wrangler.toml`:

```toml
[vars]
MAX_AGENTS_PER_ROOM = "50"
MESSAGE_HISTORY_LIMIT = "1000"
LOCK_TIMEOUT_MS = "300000"  # 5 minutes
```

### Room Configuration

Rooms are created automatically when agents connect. Each room is isolated with its own:
- Agent connections
- File locks
- Message history
- Statistics

## 📈 Monitoring

### Worker Analytics

View metrics in Cloudflare dashboard:
- Request count
- WebSocket connections
- Error rates
- D1 query performance

### Logs

```bash
# Stream logs in real-time
npm run tail
```

## 🧪 Testing

### Local Testing

```bash
# Start development server
npm run dev

# In another terminal, test WebSocket connection
npx wscat -c "ws://localhost:8787/ws/test?agentId=test1&agentName=TestAgent"

# Send a message
> {"type":"chat","content":"Hello!"}
```

### Integration Testing

```javascript
// test-integration.js
const WebSocket = require('ws');

async function test() {
  // Connect two agents
  const agent1 = new WebSocket('ws://localhost:8787/ws/test?agentId=agent1&agentName=Agent1');
  const agent2 = new WebSocket('ws://localhost:8787/ws/test?agentId=agent2&agentName=Agent2');

  agent1.on('open', () => {
    // Agent 1 locks a file
    agent1.send(JSON.stringify({
      type: 'file_lock',
      filePath: '/test.ts',
      lockType: 'write'
    }));
  });

  agent2.on('message', (data) => {
    const msg = JSON.parse(data);
    console.log('Agent 2 received:', msg.type);

    if (msg.type === 'file_locked') {
      // Agent 2 tries to lock the same file
      agent2.send(JSON.stringify({
        type: 'file_lock',
        filePath: '/test.ts',
        lockType: 'write'
      }));
    }

    if (msg.type === 'file_lock_denied') {
      console.log('✅ Test passed: Lock correctly denied');
      process.exit(0);
    }
  });
}

test();
```

## 🤝 Use Cases

### 1. Multi-Agent Code Generation

Prevent multiple agents from creating the same file:

```javascript
// Agent workflow
1. Check if file exists in codebase
2. Request lock with type 'create'
3. If granted, create the file
4. Release lock
5. Notify other agents of completion
```

### 2. Coordinated Refactoring

Agents coordinate on large refactoring tasks:

```javascript
// Agent 1
ws.send({ type: 'chat', content: 'Starting auth refactor' });
ws.send({ type: 'file_lock', filePath: '/src/auth/*', lockType: 'write' });

// Agent 2 sees the message and works on a different area
```

### 3. Testing Coordination

Agents coordinate test execution:

```javascript
// Agent 1
ws.send({ type: 'chat', content: 'Running integration tests', metadata: { suite: 'auth' } });

// Agent 2 waits for tests to complete before deploying
```

### 4. Real-time Status Updates

Agents share progress and status:

```javascript
ws.send({
  type: 'chat',
  content: 'Progress: 5/10 files processed',
  metadata: { progress: 0.5, task: 'migration' }
});
```

## 🐛 Troubleshooting

### WebSocket Connection Fails

- Check that the worker is deployed and accessible
- Verify the WebSocket URL format
- Check browser console for CORS errors

### Database Errors

- Ensure migrations have been run
- Verify D1 database ID in wrangler.toml
- Check D1 dashboard for query errors

### Lock Not Released

Locks are automatically released when:
- Agent disconnects
- Agent sends unlock message
- (Optional) Implement timeout in production

### Performance Issues

- Multiple rooms use separate Durable Object instances
- Consider implementing message pagination
- Archive old messages in D1

## 📚 API Reference

### WebSocket Endpoint

```
wss://your-worker.workers.dev/ws/:roomId?agentId=:id&agentName=:name
```

Parameters:
- `roomId` (path) - Room identifier
- `agentId` (query) - Unique agent identifier
- `agentName` (query) - Human-readable agent name

### HTTP Endpoints

#### GET /
Returns the web interface.

#### GET /api/room/:roomId/info
Get room information including active agents and locks.

#### GET /api/room/:roomId/history
Get message history.

Query parameters:
- `limit` (default: 50) - Number of messages
- `offset` (default: 0) - Pagination offset

#### GET /api/room/:roomId/locks
Get active file locks in the room.

#### GET /health
Health check endpoint.

## 📝 License

MIT License - see LICENSE file

## 🙏 Acknowledgments

- Cloudflare Workers and Durable Objects
- D1 Database
- WebSocket API

## 🔗 Links

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Durable Objects Guide](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [WebSocket API](https://developers.cloudflare.com/workers/runtime-apis/websockets/)

## 💡 Contributing

Contributions welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ for AI agent coordination