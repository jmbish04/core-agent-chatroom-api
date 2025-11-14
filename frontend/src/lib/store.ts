import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// Types
export interface Agent {
  name: string
  avatar: string
  status: 'available' | 'busy' | 'offline'
  note?: string
}

export interface Project {
  id: string
  name: string
  description?: string
  taskCount: number
  completedTasks: number
  blockedTasks: number
  activeAgents: number
}

export interface Task {
  id: string
  projectId: string
  title: string
  description?: string
  status: 'pending' | 'backlog' | 'todo' | 'in_progress' | 'review' | 'blocked' | 'done' | 'cancelled' | 'on_hold'
  priority: 'low' | 'medium' | 'high' | 'critical'
  assignedAgent?: string
  estimatedHours?: number
  actualHours?: number
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  taskId?: string
  agentName: string
  content: string
  timestamp: string
  type: 'message' | 'system' | 'task_update'
}

export interface WebSocketState {
  connected: boolean
  reconnecting: boolean
  lastMessage?: Message
}

interface AppState {
  // Agent state
  agent: Agent | null
  isAuthenticated: boolean

  // Projects
  projects: Project[]
  selectedProjectId: string | null

  // Tasks
  tasks: Task[]
  selectedTaskId: string | null

  // Chat/Messages
  messages: Message[]
  selectedThreadId: string | null

  // WebSocket
  wsState: WebSocketState

  // UI state
  showCommandModal: boolean
  showWebSocketConsole: boolean
  showDocsInsight: boolean
  showAgentSetup: boolean

  // Actions
  setAgent: (agent: Agent | null) => void
  clearAgent: () => void
  setProjects: (projects: Project[]) => void
  selectProject: (projectId: string | null) => void
  setTasks: (tasks: Task[]) => void
  selectTask: (taskId: string | null) => void
  addMessage: (message: Message) => void
  setMessages: (messages: Message[]) => void
  selectThread: (threadId: string | null) => void
  setWebSocketState: (state: Partial<WebSocketState>) => void
  toggleCommandModal: () => void
  toggleWebSocketConsole: () => void
  toggleDocsInsight: () => void
  toggleAgentSetup: () => void
}

export const useStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // Initial state
      agent: null,
      isAuthenticated: false,
      projects: [],
      selectedProjectId: null,
      tasks: [],
      selectedTaskId: null,
      messages: [],
      selectedThreadId: null,
      wsState: {
        connected: false,
        reconnecting: false,
      },
      showCommandModal: false,
      showWebSocketConsole: false,
      showDocsInsight: false,
      showAgentSetup: false,

      // Actions
      setAgent: (agent) =>
        set({ agent, isAuthenticated: !!agent }),

      clearAgent: () =>
        set({
          agent: null,
          isAuthenticated: false,
          projects: [],
          selectedProjectId: null,
          tasks: [],
          selectedTaskId: null,
          messages: [],
          selectedThreadId: null,
        }),

      setProjects: (projects) => set({ projects }),

      selectProject: (projectId) => set({ selectedProjectId: projectId }),

      setTasks: (tasks) => set({ tasks }),

      selectTask: (taskId) => set({ selectedTaskId: taskId }),

      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
          lastMessage: message,
        })),

      setMessages: (messages) => set({ messages }),

      selectThread: (threadId) => set({ selectedThreadId: threadId }),

      setWebSocketState: (wsState) =>
        set((state) => ({
          wsState: { ...state.wsState, ...wsState },
        })),

      toggleCommandModal: () =>
        set((state) => ({ showCommandModal: !state.showCommandModal })),

      toggleWebSocketConsole: () =>
        set((state) => ({ showWebSocketConsole: !state.showWebSocketConsole })),

      toggleDocsInsight: () =>
        set((state) => ({ showDocsInsight: !state.showDocsInsight })),

      toggleAgentSetup: () =>
        set((state) => ({ showAgentSetup: !state.showAgentSetup })),
    }),
    {
      name: 'vibe-systems-store',
    }
  )
)
