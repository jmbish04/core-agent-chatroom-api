import axios from 'axios'

// API Base URL - will be configured based on environment
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:8787' : window.location.origin)

// Type declaration for Vite env
declare global {
  interface ImportMetaEnv {
    readonly DEV: boolean
    readonly VITE_API_BASE_URL?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Types based on backend schemas
export interface Task {
  id: string
  projectId: string
  epicId?: string
  parentTaskId?: string
  title: string
  description?: string
  status: 'pending' | 'backlog' | 'todo' | 'in_progress' | 'review' | 'blocked' | 'done' | 'cancelled' | 'on_hold'
  priority: 'low' | 'medium' | 'high' | 'critical'
  assignedAgent?: string
  estimatedHours?: number
  actualHours?: number
  requiresHumanReview?: boolean
  humanReviewReason?: string
  humanReviewResponse?: string
  createdAt: string
  updatedAt: string
}

export interface AgentActivity {
  agentName: string
  status: 'offline' | 'available' | 'busy' | 'in_progress' | 'blocked' | 'awaiting_human' | 'done' | 'error'
  taskId?: string
  note?: string
  lastCheckIn: string
  updatedAt: string
}

export interface TaskBlocker {
  id: string
  projectId: string
  taskId: string
  blockedAgent: string
  blockingOwner?: string
  reason?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  requiresHumanIntervention: boolean
  humanInterventionReason?: string
  resolvedAt?: string
  resolvedBy?: string
  resolutionNote?: string
  acked: boolean
  lastNotified?: string
  createdAt: string
  updatedAt: string
}

export interface TaskCounts {
  pending: number
  in_progress: number
  blocked: number
  done: number
  backlog: number
  todo: number
  review: number
  cancelled: number
  on_hold: number
  total: number
}

export interface TaskStatsResponse {
  counts: TaskCounts
  agentActivity: AgentActivity[]
  blocked: TaskBlocker[]
}

export interface CreateTaskRequest {
  projectId: string
  epicId?: string
  parentTaskId?: string
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high' | 'critical'
  assignedAgent?: string
  status?: Task['status']
  estimatedHours?: number
  requiresHumanReview?: boolean
  humanReviewReason?: string
}

export interface AgentCheckInRequest {
  agentName: string
  status: AgentActivity['status']
  taskId?: string
  note?: string
}

export interface BlockTaskRequest {
  projectId: string
  blockedAgent: string
  blockingOwner?: string
  reason: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  requiresHumanIntervention?: boolean
  humanInterventionReason?: string
}

export interface DocsQueryRequest {
  query: string
  topic?: 'workers' | 'durable-objects' | 'd1' | 'r2' | 'ai' | 'agents' | 'general' | 'cloudflare agents sdk' | 'cloudflare actors'
  maxResults?: number
}

export interface DocsSource {
  title: string
  url: string
  snippet: string
}

export interface DocsQueryResponse {
  answer: string
  sources: DocsSource[]
  confidence: number
}

export interface TestDefinition {
  id: string
  name: string
  description: string
  category?: string | null
  severity?: string | null
  isActive: boolean
  errorMap: Record<string, { meaning: string; fix: string }>
  createdAt: string
}

export interface TestRunResult {
  definition: TestDefinition
  status: 'pass' | 'fail'
  durationMs: number
  errorCode?: string
  raw?: any
  aiDescription?: string
  aiFixPrompt?: string
}

export interface TestSession {
  sessionUuid: string
  startedAt: string
  finishedAt?: string
  durationMs: number
  total: number
  passed: number
  failed: number
  results: TestRunResult[]
}

export interface RunTestsResponse {
  sessionUuid: string
  startedAt: string
}

// API Methods
export const tasksApi = {
  // Get all tasks
  getAll: () => api.get<{ tasks: Task[] }>('/api/tasks'),

  // Create a new task
  create: (task: CreateTaskRequest) => api.post<{ task: Task }>('/api/tasks', task),

  // Update task status
  updateStatus: (taskId: string, status: Task['status']) =>
    api.post(`/api/tasks/${taskId}/status`, { status }),

  // Bulk update task statuses
  bulkUpdateStatus: (updates: { taskId: string; status: Task['status'] }[]) =>
    api.post('/api/tasks/status', { updates }),

  // Reassign tasks
  bulkReassign: (taskIds: string[], agent: string) =>
    api.post('/api/tasks/reassign', { taskIds, agent }),

  // Search tasks
  search: (query: string) => api.get<{ query: string; tasks: Task[] }>(`/api/tasks/search?q=${encodeURIComponent(query)}`),

  // Get tasks by agent
  getByAgent: (agentName: string) => api.get<{ agent: string; tasks: Task[] }>(`/api/tasks/agent/${encodeURIComponent(agentName)}`),
}

export const agentsApi = {
  // Check in agent
  checkIn: (checkIn: AgentCheckInRequest) => api.post<{ activity: AgentActivity }>('/api/agents/check-in', checkIn),
}

export const blockersApi = {
  // Block a task
  block: (taskId: string, block: BlockTaskRequest) => api.post<{ blocker: TaskBlocker }>(`/api/tasks/${taskId}/block`, block),

  // Unblock a task
  unblock: (taskId: string, blockedAgent: string, resolvedBy?: string, note?: string) =>
    api.post<{ blocker: TaskBlocker }>(`/api/tasks/${taskId}/unblock`, { blockedAgent, resolvedBy, note }),
}

export const statsApi = {
  // Get task statistics
  getStats: () => api.get<TaskStatsResponse>('/api/tasks/stats'),
}

export const healthApi = {
  // Get system health
  getHealth: () => api.get('/api/health'),
}

export const analysisApi = {
  // Run analysis
  analyze: (target: string, depth: 'shallow' | 'normal' | 'deep' = 'normal', includeAi = true) =>
    api.post('/api/analyze', { target, depth, includeAi }),
}

export const docsApi = {
  // Query Cloudflare docs via MCP
  query: (request: DocsQueryRequest) => api.post<DocsQueryResponse>('/rpc', {
    method: 'docs.query',
    params: request,
  }),
}

export const testsApi = {
  // Get all test definitions
  getDefinitions: () => api.get<{ tests: TestDefinition[] }>('/api/tests/defs'),

  // Run all tests
  runAll: (reason?: string) => api.post<RunTestsResponse>('/api/tests/run', { reason }),

  // Get latest test session
  getLatest: () => api.get<{ session: TestSession }>('/api/tests/latest'),
}

// WebSocket connection
export class WebSocketClient {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private handlers: Map<string, Function[]> = new Map()

  constructor(private roomId = 'default') {}

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(this.roomId)}`

    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
      this.emit('connected')
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        this.emit(message.type, message)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    this.ws.onclose = () => {
      console.log('WebSocket disconnected')
      this.emit('disconnected')
      this.scheduleReconnect()
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      this.emit('error', error)
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
        this.connect()
      }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts))
    }
  }

  send(type: string, payload: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = {
        type,
        payload,
        requestId: crypto.randomUUID(),
      }
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket is not connected')
    }
  }

  on(event: string, handler: Function) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, [])
    }
    this.handlers.get(event)!.push(handler)
  }

  off(event: string, handler: Function) {
    const handlers = this.handlers.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  private emit(event: string, data?: any) {
    const handlers = this.handlers.get(event)
    if (handlers) {
      handlers.forEach(handler => handler(data))
    }

    // Also emit to wildcard handlers
    const wildcardHandlers = this.handlers.get('*')
    if (wildcardHandlers) {
      wildcardHandlers.forEach(handler => handler(event, data))
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}
