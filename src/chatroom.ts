import type {
  Env,
  AgentMessage,
  WebSocketMessage,
  FileLock,
  QueryRequest,
  QueryResponse,
  HelpResponse,
  RoomState,
  AgentConnection,
  Command,
  Example,
  EndpointInfo,
  MCPInfo
} from './types';

export class ChatRoom implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private roomState: RoomState;
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;

    // Initialize room state
    this.roomState = {
      roomId: state.id.toString(),
      name: 'Default Room',
      agents: new Map(),
      fileLocks: new Map(),
      messageCount: 0,
      createdAt: Date.now()
    };

    // Block concurrent input until initialization completes
    this.state.blockConcurrencyWhile(async () => {
      await this.loadState();
    });
  }

  private async loadState(): Promise<void> {
    // Load persisted state from Durable Object storage
    const savedState = await this.storage.get<Partial<RoomState>>('roomState');
    if (savedState) {
      this.roomState = {
        ...this.roomState,
        ...savedState,
        agents: new Map(), // Agents don't persist across instances
        fileLocks: savedState.fileLocks ? new Map(Object.entries(savedState.fileLocks)) : new Map()
      };
    }
  }

  private async saveState(): Promise<void> {
    // Persist room state
    const stateToSave = {
      roomId: this.roomState.roomId,
      name: this.roomState.name,
      description: this.roomState.description,
      messageCount: this.roomState.messageCount,
      createdAt: this.roomState.createdAt,
      fileLocks: Object.fromEntries(this.roomState.fileLocks)
    };
    await this.storage.put('roomState', stateToSave);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // HTTP API endpoints
    if (url.pathname === '/info') {
      return this.handleInfo();
    }

    if (url.pathname === '/history') {
      return this.handleHistory(url);
    }

    if (url.pathname === '/locks') {
      return this.handleLocks();
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection
    server.accept();

    // Parse agent info from URL or headers
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agentId') || crypto.randomUUID();
    const agentName = url.searchParams.get('agentName') || agentId;
    const roomId = this.roomState.roomId;

    // Register the agent
    const connection: AgentConnection = {
      agentId,
      agentName,
      webSocket: server,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    };

    this.roomState.agents.set(agentId, connection);

    // Send welcome message with help info
    this.sendToAgent(agentId, {
      type: 'welcome',
      data: {
        message: `Welcome to room ${this.roomState.name}!`,
        agentId,
        roomId,
        help: await this.getHelpInfo()
      },
      timestamp: Date.now()
    });

    // Notify all agents about the new joiner
    await this.broadcast({
      type: 'agent_joined',
      data: { agentId, agentName, totalAgents: this.roomState.agents.size },
      timestamp: Date.now()
    }, agentId);

    // Log to D1
    await this.logMessage({
      type: 'join',
      agentId,
      agentName,
      roomId,
      content: `${agentName} joined the room`,
      timestamp: Date.now()
    });

    // Update agent presence in D1
    await this.updateAgentPresence(agentId, agentName, 'online');

    // Set up message handler
    server.addEventListener('message', async (event: MessageEvent) => {
      await this.handleAgentMessage(agentId, event.data);
    });

    // Set up close handler
    server.addEventListener('close', async () => {
      await this.handleAgentDisconnect(agentId);
    });

    server.addEventListener('error', async (event: ErrorEvent) => {
      console.error(`WebSocket error for agent ${agentId}:`, event);
      await this.handleAgentDisconnect(agentId);
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  private async handleAgentMessage(agentId: string, data: string | ArrayBuffer): Promise<void> {
    try {
      const message = typeof data === 'string' ? JSON.parse(data) : JSON.parse(new TextDecoder().decode(data));
      const agent = this.roomState.agents.get(agentId);

      if (!agent) return;

      agent.lastSeen = Date.now();

      switch (message.type) {
        case 'chat':
          await this.handleChatMessage(agentId, message);
          break;
        case 'file_lock':
          await this.handleFileLock(agentId, message);
          break;
        case 'file_unlock':
          await this.handleFileUnlock(agentId, message);
          break;
        case 'query':
          await this.handleQuery(agentId, message);
          break;
        case 'help':
          await this.handleHelp(agentId);
          break;
        case 'ping':
          this.sendToAgent(agentId, { type: 'pong', data: {}, timestamp: Date.now() });
          break;
        default:
          this.sendToAgent(agentId, {
            type: 'error',
            data: { error: `Unknown message type: ${message.type}` },
            timestamp: Date.now()
          });
      }
    } catch (error) {
      console.error(`Error handling message from agent ${agentId}:`, error);
      this.sendToAgent(agentId, {
        type: 'error',
        data: { error: 'Invalid message format' },
        timestamp: Date.now()
      });
    }
  }

  private async handleChatMessage(agentId: string, message: any): Promise<void> {
    const agent = this.roomState.agents.get(agentId);
    if (!agent) return;

    const agentMessage: AgentMessage = {
      type: 'chat',
      agentId,
      agentName: agent.agentName,
      roomId: this.roomState.roomId,
      content: message.content,
      metadata: message.metadata,
      timestamp: Date.now()
    };

    // Broadcast to all agents
    await this.broadcast({
      type: 'chat',
      data: {
        agentId,
        agentName: agent.agentName,
        content: message.content,
        metadata: message.metadata
      },
      timestamp: agentMessage.timestamp
    });

    // Log to D1
    await this.logMessage(agentMessage);
  }

  private async handleFileLock(agentId: string, message: any): Promise<void> {
    const agent = this.roomState.agents.get(agentId);
    if (!agent) return;

    const filePath = message.filePath;
    const lockType = message.lockType || 'write';

    // Check if file is already locked
    const existingLock = this.roomState.fileLocks.get(filePath);

    if (existingLock && existingLock.agentId !== agentId) {
      // File is locked by another agent
      this.sendToAgent(agentId, {
        type: 'file_lock_denied',
        data: {
          filePath,
          reason: `File is already locked by ${existingLock.agentName || existingLock.agentId}`,
          existingLock
        },
        timestamp: Date.now()
      });
      return;
    }

    // Grant lock
    const lock: FileLock = {
      filePath,
      lockType,
      agentId,
      agentName: agent.agentName,
      timestamp: Date.now()
    };

    this.roomState.fileLocks.set(filePath, lock);
    await this.saveState();

    // Log to D1
    await this.logFileLock(lock, 'locked');

    // Notify all agents
    await this.broadcast({
      type: 'file_locked',
      data: {
        filePath,
        lockType,
        agentId,
        agentName: agent.agentName
      },
      timestamp: lock.timestamp
    });

    this.sendToAgent(agentId, {
      type: 'file_lock_granted',
      data: { filePath, lockType },
      timestamp: lock.timestamp
    });

    // Log chat message
    await this.logMessage({
      type: 'file_lock',
      agentId,
      agentName: agent.agentName,
      roomId: this.roomState.roomId,
      content: `Locked file: ${filePath} (${lockType})`,
      metadata: { filePath, lockType },
      timestamp: lock.timestamp
    });
  }

  private async handleFileUnlock(agentId: string, message: any): Promise<void> {
    const agent = this.roomState.agents.get(agentId);
    if (!agent) return;

    const filePath = message.filePath;
    const existingLock = this.roomState.fileLocks.get(filePath);

    if (!existingLock) {
      this.sendToAgent(agentId, {
        type: 'error',
        data: { error: `No lock found for file: ${filePath}` },
        timestamp: Date.now()
      });
      return;
    }

    if (existingLock.agentId !== agentId) {
      this.sendToAgent(agentId, {
        type: 'error',
        data: { error: `File is locked by another agent: ${existingLock.agentName || existingLock.agentId}` },
        timestamp: Date.now()
      });
      return;
    }

    // Release lock
    this.roomState.fileLocks.delete(filePath);
    await this.saveState();

    // Log to D1
    await this.logFileLock(existingLock, 'released');

    // Notify all agents
    await this.broadcast({
      type: 'file_unlocked',
      data: {
        filePath,
        agentId,
        agentName: agent.agentName
      },
      timestamp: Date.now()
    });

    this.sendToAgent(agentId, {
      type: 'file_unlock_confirmed',
      data: { filePath },
      timestamp: Date.now()
    });

    // Log chat message
    await this.logMessage({
      type: 'file_unlock',
      agentId,
      agentName: agent.agentName,
      roomId: this.roomState.roomId,
      content: `Unlocked file: ${filePath}`,
      metadata: { filePath },
      timestamp: Date.now()
    });
  }

  private async handleQuery(agentId: string, message: any): Promise<void> {
    const queryRequest: QueryRequest = message.query;

    try {
      const response = await this.executeQuery(queryRequest);
      this.sendToAgent(agentId, {
        type: 'query_response',
        data: response,
        timestamp: Date.now()
      });
    } catch (error) {
      this.sendToAgent(agentId, {
        type: 'error',
        data: { error: `Query failed: ${error}` },
        timestamp: Date.now()
      });
    }
  }

  private async handleHelp(agentId: string): Promise<void> {
    const helpInfo = await this.getHelpInfo();
    this.sendToAgent(agentId, {
      type: 'help_response',
      data: helpInfo,
      timestamp: Date.now()
    });
  }

  private async executeQuery(query: QueryRequest): Promise<QueryResponse> {
    const { queryType, filters = {} } = query;
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    let sql = '';
    let params: any[] = [];

    switch (queryType) {
      case 'history':
        sql = `
          SELECT * FROM messages
          WHERE room_id = ?
          ${filters.agentId ? 'AND agent_id = ?' : ''}
          ${filters.since ? 'AND timestamp > ?' : ''}
          ORDER BY timestamp DESC
          LIMIT ? OFFSET ?
        `;
        params = [this.roomState.roomId];
        if (filters.agentId) params.push(filters.agentId);
        if (filters.since) params.push(filters.since);
        params.push(limit, offset);
        break;

      case 'locks':
        sql = `
          SELECT * FROM file_locks
          WHERE room_id = ? AND status = 'locked'
          ${filters.filePath ? 'AND file_path = ?' : ''}
          ${filters.agentId ? 'AND agent_id = ?' : ''}
          ORDER BY locked_at DESC
          LIMIT ? OFFSET ?
        `;
        params = [this.roomState.roomId];
        if (filters.filePath) params.push(filters.filePath);
        if (filters.agentId) params.push(filters.agentId);
        params.push(limit, offset);
        break;

      case 'agents':
        sql = `
          SELECT * FROM agent_presence
          WHERE room_id = ? AND status = 'online'
          ORDER BY last_seen DESC
          LIMIT ? OFFSET ?
        `;
        params = [this.roomState.roomId, limit, offset];
        break;

      case 'file_history':
        if (!filters.filePath) {
          throw new Error('`filePath` filter is required for `file_history` query type.');
        }
        sql = `
          SELECT * FROM file_locks
          WHERE room_id = ? AND file_path = ?
          ORDER BY locked_at DESC
          LIMIT ? OFFSET ?
        `;
        params = [this.roomState.roomId, filters.filePath, limit, offset];
        break;

      case 'rooms':
        sql = `SELECT * FROM rooms ORDER BY last_activity DESC LIMIT ? OFFSET ?`;
        params = [limit, offset];
        break;

      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }

    const result = await this.env.DB.prepare(sql).bind(...params).all();

    return {
      success: true,
      data: result.results || [],
      count: result.results?.length || 0,
      queryType
    };
  }

  private async getHelpInfo(): Promise<HelpResponse> {
    const commands: Command[] = [
      {
        name: 'chat',
        description: 'Send a chat message to all agents in the room',
        parameters: [
          { name: 'content', type: 'string', required: true, description: 'The message content' },
          { name: 'metadata', type: 'object', required: false, description: 'Optional metadata' }
        ],
        example: JSON.stringify({ type: 'chat', content: 'Hello everyone!', metadata: { priority: 'high' } }, null, 2)
      },
      {
        name: 'file_lock',
        description: 'Request a lock on a file to prevent other agents from modifying it',
        parameters: [
          { name: 'filePath', type: 'string', required: true, description: 'The file path to lock' },
          { name: 'lockType', type: 'string', required: false, description: 'Lock type: read, write, or create (default: write)' }
        ],
        example: JSON.stringify({ type: 'file_lock', filePath: '/src/index.ts', lockType: 'write' }, null, 2)
      },
      {
        name: 'file_unlock',
        description: 'Release a file lock',
        parameters: [
          { name: 'filePath', type: 'string', required: true, description: 'The file path to unlock' }
        ],
        example: JSON.stringify({ type: 'file_unlock', filePath: '/src/index.ts' }, null, 2)
      },
      {
        name: 'query',
        description: 'Query the D1 database for history, locks, agents, or file history',
        parameters: [
          { name: 'query.queryType', type: 'string', required: true, description: 'Query type: history, locks, agents, file_history, or rooms' },
          { name: 'query.filters', type: 'object', required: false, description: 'Optional filters (agentId, filePath, limit, offset, since)' }
        ],
        example: JSON.stringify({ type: 'query', query: { queryType: 'history', filters: { limit: 50 } } }, null, 2)
      },
      {
        name: 'help',
        description: 'Get help information and available commands',
        example: JSON.stringify({ type: 'help' }, null, 2)
      },
      {
        name: 'ping',
        description: 'Ping the server to keep connection alive',
        example: JSON.stringify({ type: 'ping' }, null, 2)
      }
    ];

    const examples: Example[] = [
      {
        title: 'Coordinate File Creation',
        description: 'Lock a file before creating it to prevent duplicate creation',
        code: `// Agent 1 requests lock
ws.send(JSON.stringify({
  type: 'file_lock',
  filePath: '/src/newFeature.ts',
  lockType: 'create'
}));

// Wait for file_lock_granted response
// Then create the file
// Finally unlock
ws.send(JSON.stringify({
  type: 'file_unlock',
  filePath: '/src/newFeature.ts'
}));`
      },
      {
        title: 'Query Recent History',
        description: 'Get the last 20 messages from the room',
        code: `ws.send(JSON.stringify({
  type: 'query',
  query: {
    queryType: 'history',
    filters: { limit: 20 }
  }
}));`
      },
      {
        title: 'Check Active Locks',
        description: 'See what files are currently locked',
        code: `ws.send(JSON.stringify({
  type: 'query',
  query: {
    queryType: 'locks'
  }
}));`
      }
    ];

    const endpoints: EndpointInfo[] = [
      { path: '/ws/:roomId', method: 'GET', description: 'WebSocket connection endpoint (with Upgrade header)' },
      { path: '/api/room/:roomId/info', method: 'GET', description: 'Get room information' },
      { path: '/api/room/:roomId/history', method: 'GET', description: 'Get room message history' },
      { path: '/api/room/:roomId/locks', method: 'GET', description: 'Get active file locks' }
    ];

    const mcpInfo: MCPInfo = {
      description: 'This service can be used as an MCP (Model Context Protocol) tool for agent coordination',
      setupInstructions: [
        '1. Deploy this worker to Cloudflare',
        '2. Note your worker URL (e.g., https://your-worker.your-subdomain.workers.dev)',
        '3. Create an MCP server configuration that connects to the WebSocket endpoint',
        '4. Configure your agents to use the MCP tool for coordination',
        '5. See the README for detailed MCP integration examples'
      ],
      exampleConfig: JSON.stringify({
        mcpServers: {
          "agent-coordination": {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-websocket"],
            env: {
              WEBSOCKET_URL: "wss://your-worker.your-subdomain.workers.dev/ws/default"
            }
          }
        }
      }, null, 2)
    };

    return { commands, examples, endpoints, mcpInfo };
  }

  private async handleAgentDisconnect(agentId: string): Promise<void> {
    const agent = this.roomState.agents.get(agentId);
    if (!agent) return;

    // Remove agent
    this.roomState.agents.delete(agentId);

    // Release all locks held by this agent
    const locksToRelease: string[] = [];
    for (const [filePath, lock] of this.roomState.fileLocks.entries()) {
      if (lock.agentId === agentId) {
        locksToRelease.push(filePath);
      }
    }

    for (const filePath of locksToRelease) {
      const lock = this.roomState.fileLocks.get(filePath);
      if (lock) {
        this.roomState.fileLocks.delete(filePath);
        await this.logFileLock(lock, 'released');

        await this.broadcast({
          type: 'file_unlocked',
          data: {
            filePath,
            agentId,
            agentName: agent.agentName,
            reason: 'Agent disconnected'
          },
          timestamp: Date.now()
        });
      }
    }

    await this.saveState();

    // Notify others
    await this.broadcast({
      type: 'agent_left',
      data: { agentId, agentName: agent.agentName, totalAgents: this.roomState.agents.size },
      timestamp: Date.now()
    });

    // Log to D1
    await this.logMessage({
      type: 'leave',
      agentId,
      agentName: agent.agentName,
      roomId: this.roomState.roomId,
      content: `${agent.agentName} left the room`,
      timestamp: Date.now()
    });

    // Update agent presence
    await this.updateAgentPresence(agentId, agent.agentName, 'offline');
  }

  private async broadcast(message: WebSocketMessage, excludeAgentId?: string): Promise<void> {
    const messageStr = JSON.stringify(message);

    for (const [agentId, agent] of this.roomState.agents.entries()) {
      if (agentId !== excludeAgentId) {
        try {
          agent.webSocket.send(messageStr);
        } catch (error) {
          console.error(`Failed to send message to agent ${agentId}:`, error);
          // Agent connection might be broken, will be cleaned up on next message or timeout
        }
      }
    }
  }

  private sendToAgent(agentId: string, message: WebSocketMessage): void {
    const agent = this.roomState.agents.get(agentId);
    if (agent) {
      try {
        agent.webSocket.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Failed to send message to agent ${agentId}:`, error);
      }
    }
  }

  private async logMessage(message: AgentMessage): Promise<void> {
    try {
      const stmt = this.env.DB.prepare(`
        INSERT INTO messages (room_id, agent_id, agent_name, message_type, content, metadata, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      await stmt
        .bind(
          message.roomId,
          message.agentId,
          message.agentName || null,
          message.type,
          message.content || '',
          message.metadata ? JSON.stringify(message.metadata) : null,
          message.timestamp
        )
        .run();

      this.roomState.messageCount++;
      await this.updateRoomActivity();
    } catch (error) {
      console.error('Failed to log message to D1:', error);
    }
  }

  private async logFileLock(lock: FileLock, status: 'locked' | 'released'): Promise<void> {
    try {
      if (status === 'locked') {
        const stmt = this.env.DB.prepare(`
          INSERT INTO file_locks (room_id, file_path, agent_id, agent_name, lock_type, status, locked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        await stmt
          .bind(
            this.roomState.roomId,
            lock.filePath,
            lock.agentId,
            lock.agentName || null,
            lock.lockType,
            status,
            lock.timestamp
          )
          .run();
      } else {
        const stmt = this.env.DB.prepare(`
          UPDATE file_locks
          SET status = ?, released_at = ?
          WHERE room_id = ? AND file_path = ? AND agent_id = ? AND status = 'locked' AND released_at IS NULL
        `);

        await stmt
          .bind(
            status,
            Date.now(),
            this.roomState.roomId,
            lock.filePath,
            lock.agentId
          )
          .run();
      }
    } catch (error) {
      console.error('Failed to log file lock to D1:', error);
    }
  }

  private async updateAgentPresence(agentId: string, agentName: string, status: 'online' | 'offline'): Promise<void> {
    try {
      const stmt = this.env.DB.prepare(`
        INSERT INTO agent_presence (room_id, agent_id, agent_name, status, joined_at, last_seen)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(room_id, agent_id) DO UPDATE SET
          status = excluded.status,
          last_seen = excluded.last_seen,
          agent_name = excluded.agent_name
      `);

      await stmt
        .bind(
          this.roomState.roomId,
          agentId,
          agentName,
          status,
          Date.now(),
          Date.now()
        )
        .run();
    } catch (error) {
      console.error('Failed to update agent presence:', error);
    }
  }

  private async updateRoomActivity(): Promise<void> {
    try {
      const stmt = this.env.DB.prepare(`
        INSERT INTO rooms (id, name, description, active_agents, total_messages, last_activity)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          active_agents = excluded.active_agents,
          total_messages = excluded.total_messages,
          last_activity = datetime('now')
      `);

      await stmt
        .bind(
          this.roomState.roomId,
          this.roomState.name,
          this.roomState.description || null,
          this.roomState.agents.size,
          this.roomState.messageCount
        )
        .run();
    } catch (error) {
      console.error('Failed to update room activity:', error);
    }
  }

  private async handleInfo(): Promise<Response> {
    const info = {
      roomId: this.roomState.roomId,
      name: this.roomState.name,
      description: this.roomState.description,
      activeAgents: this.roomState.agents.size,
      agents: Array.from(this.roomState.agents.values()).map(a => ({
        agentId: a.agentId,
        agentName: a.agentName,
        joinedAt: a.joinedAt,
        lastSeen: a.lastSeen
      })),
      activeLocks: Array.from(this.roomState.fileLocks.values()),
      messageCount: this.roomState.messageCount,
      createdAt: this.roomState.createdAt
    };

    return new Response(JSON.stringify(info, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleHistory(url: URL): Promise<Response> {
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const result = await this.env.DB.prepare(`
      SELECT * FROM messages
      WHERE room_id = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).bind(this.roomState.roomId, limit, offset).all();

    return new Response(JSON.stringify(result.results || [], null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleLocks(): Promise<Response> {
    const locks = Array.from(this.roomState.fileLocks.values());
    return new Response(JSON.stringify(locks, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
