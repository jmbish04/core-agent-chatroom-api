// Type definitions for the Core Agent Chatroom API

export interface Env {
  CHATROOM: DurableObjectNamespace;
  DB: D1Database;
}

export interface AgentMessage {
  type: 'join' | 'leave' | 'chat' | 'file_lock' | 'file_unlock' | 'query' | 'help' | 'system';
  agentId: string;
  agentName?: string;
  roomId: string;
  content?: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
  messageId?: string;
}

export interface FileLock {
  filePath: string;
  lockType: 'read' | 'write' | 'create';
  agentId: string;
  agentName?: string;
  timestamp: number;
}

export interface QueryRequest {
  queryType: 'history' | 'locks' | 'agents' | 'rooms' | 'file_history';
  filters?: {
    roomId?: string;
    agentId?: string;
    filePath?: string;
    limit?: number;
    offset?: number;
    since?: number;
  };
}

export interface QueryResponse {
  success: boolean;
  data: any[];
  count: number;
  queryType: string;
}

export interface HelpResponse {
  commands: Command[];
  examples: Example[];
  endpoints: EndpointInfo[];
  mcpInfo: MCPInfo;
}

export interface Command {
  name: string;
  description: string;
  parameters?: Parameter[];
  example: string;
}

export interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface Example {
  title: string;
  description: string;
  code: string;
}

export interface EndpointInfo {
  path: string;
  method: string;
  description: string;
}

export interface MCPInfo {
  description: string;
  setupInstructions: string[];
  exampleConfig: string;
}

export interface RoomState {
  roomId: string;
  name: string;
  description?: string;
  agents: Map<string, AgentConnection>;
  fileLocks: Map<string, FileLock>;
  messageCount: number;
  createdAt: number;
}

export interface AgentConnection {
  agentId: string;
  agentName: string;
  webSocket: WebSocket;
  joinedAt: number;
  lastSeen: number;
}

export interface D1Message {
  id: number;
  room_id: string;
  agent_id: string;
  agent_name: string | null;
  message_type: string;
  content: string;
  metadata: string | null;
  timestamp: number;
  created_at: string;
}

export interface D1FileLock {
  id: number;
  room_id: string;
  file_path: string;
  agent_id: string;
  agent_name: string | null;
  lock_type: string;
  status: string;
  locked_at: number;
  released_at: number | null;
  created_at: string;
}

export interface D1Room {
  id: string;
  name: string;
  description: string | null;
  active_agents: number;
  total_messages: number;
  created_at: string;
  last_activity: string;
}

export interface D1AgentPresence {
  id: number;
  room_id: string;
  agent_id: string;
  agent_name: string | null;
  status: string;
  joined_at: number;
  last_seen: number;
  created_at: string;
}
