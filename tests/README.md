# Project Management API Tests

Comprehensive unit tests for the project management system, testing all CRUD operations against the local preview database.

## Prerequisites

1. **Start the development server first:**
   ```bash
   npm run dev
   ```
   This starts the server on `http://localhost:6528`

2. **Ensure migrations are applied:**
   ```bash
   npm run migrate:local
   ```

## Running Tests

### Run all tests once:
```bash
npm test
```

### Run tests in watch mode:
```bash
npm run test:watch
```

## Test Coverage

The test suite covers:

### 📁 Project Management
- ✅ Creating projects
- ✅ Listing projects
- ✅ Getting specific projects
- ✅ Project metadata (GitHub repo, owner, branch)

### 🎯 Epic Management
- ✅ Creating epics within projects
- ✅ Listing epics for projects
- ✅ Epic status and priority management

### ✅ Task Management
- ✅ Creating tasks within epics
- ✅ Creating subtasks (parent-child relationships)
- ✅ Updating task status
- ✅ Assigning agents to tasks
- ✅ Task search functionality

### 📦 Bulk Operations
- ✅ Bulk task assignment
- ✅ Bulk task reassignment
- ✅ Bulk status updates

### 🚫 Task Blocking
- ✅ Marking tasks as blocked
- ✅ Unblocking tasks
- ✅ Listing blocked tasks
- ✅ Block resolution tracking

### 🤖 Agent Operations
- ✅ Agent check-in/check-out
- ✅ Agent status management
- ✅ Listing agents
- ✅ Getting agent-specific tasks

### 💬 Messaging System
- ✅ Creating discussion threads
- ✅ Posting messages in threads
- ✅ Creating replies to messages
- ✅ Thread message retrieval
- ✅ Project thread listing

### 🔌 WebSocket & RPC
- ✅ WebSocket endpoint availability
- ✅ RPC method calls
- ✅ Real-time communication setup

## Test Data

Tests create temporary data with unique identifiers to avoid conflicts:

- Projects: `Test Project` with GitHub metadata
- Epics: `Test Epic` with target completion dates
- Tasks: Multiple tasks with various statuses and priorities
- Agents: Dynamic agent names with timestamps
- Threads: Discussion threads with message trees

## Test Output

Tests provide detailed console output with:
- 📡 Request URLs and methods
- 📊 HTTP status codes
- 📋 Full API responses
- ✅ Success confirmations
- ❌ Error details

## Database Cleanup

Tests create data but don't clean it up automatically. For repeated testing:

```bash
# Reset local database
npx wrangler d1 execute core-agent-chatroom-api --local --command="DELETE FROM tasks;"
npx wrangler d1 execute core-agent-chatroom-api --local --command="DELETE FROM epics;"
npx wrangler d1 execute core-agent-chatroom-api --local --command="DELETE FROM projects;"
npx wrangler d1 execute core-agent-chatroom-api --local --command="DELETE FROM threads;"
npx wrangler d1 execute core-agent-chatroom-api --local --command="DELETE FROM thread_messages;"
```

## API Endpoints Tested

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects` | GET | List all projects |
| `/api/projects` | POST | Create project |
| `/api/projects/:id` | GET | Get project details |
| `/api/epics` | POST | Create epic |
| `/api/projects/:id/epics` | GET | List project epics |
| `/api/tasks` | GET/POST | List/create tasks |
| `/api/tasks/:id` | GET/PATCH | Get/update task |
| `/api/tasks/search` | GET | Search tasks |
| `/api/tasks/assign` | POST | Bulk assign tasks |
| `/api/tasks/reassign` | POST | Bulk reassign tasks |
| `/api/tasks/status` | PATCH | Bulk status update |
| `/api/tasks/:id/block` | POST | Block task |
| `/api/tasks/:id/unblock` | POST | Unblock task |
| `/api/tasks/blocked` | GET | List blocked tasks |
| `/api/agents` | GET | List agents |
| `/api/agents/check-in` | POST | Agent check-in |
| `/api/agents/:name/tasks` | GET | Agent tasks |
| `/api/threads` | POST | Create thread |
| `/api/messages` | POST | Create message |
| `/api/threads/:id/messages` | GET | Thread messages |
| `/api/projects/:id/threads` | GET | Project threads |
| `/api/rpc` | POST | RPC calls |
| `/api/tasks/stats` | GET | Task statistics |

## Troubleshooting

### Server Not Running
```bash
# Start server in background
npm run dev &
sleep 5
npm test
```

### Migration Issues
```bash
# Apply migrations
npm run migrate:local
```

### Port Conflicts
```bash
# Kill wrangler processes
pkill -f wrangler
npm run dev
```

### Test Timeouts
Tests have reasonable timeouts, but slow networks may need:
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
npm test
```

