import type { Env } from "../types";
import { nowPST } from "./time";

// Database interfaces for new tables (since they're not in the existing Kysely interface)
interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_agent: string | null;
  target_completion: string | null;
  created_at: string;
  updated_at: string;
}

interface EpicRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  project_id: string;
  created_at: string;
}


interface ThreadMessageRow {
  id: string;
  thread_id: string;
  content: string;
  author: string;
  timestamp: string;
  parent_id: string | null;
}

// Project management functions

export interface Project {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignedAgent?: string;
  targetCompletion?: string;
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
  epicCount?: number;
}

export interface Epic {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  projectId: string;
  createdAt: string;
}

export interface ProjectThread {
  id: string;
  subject: string;
  author: string;
  projectId: string;
  createdAt: string;
  messageCount?: number;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  content: string;
  author: string;
  timestamp: string;
  parentId?: string;
  replies?: ThreadMessage[];
}

export interface Agent {
  name: string;
  status?: string;
  lastSeen?: string;
}

// Project CRUD operations
export const listProjects = async (env: Env): Promise<{ data: Project[]; error?: Error }> => {
  try {
    const db = env.DB;

    // Get all projects
    const projectsResult = await db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
    const projects = (projectsResult.results as unknown) as ProjectRow[];

    // Get task counts for each project (epics don't have project_id in current schema)
    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        const taskCountResult = await db.prepare("SELECT COUNT(*) as count FROM tasks WHERE project_id = ?").bind(project.id).first();

        return {
          id: project.id,
          title: project.title,
          description: project.description || undefined,
          status: project.status,
          priority: project.priority,
          assignedAgent: project.assigned_agent || undefined,
          targetCompletion: project.target_completion || undefined,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
          taskCount: Number(taskCountResult?.count || 0),
          epicCount: 0, // Epics don't have project_id in current schema
        };
      })
    );

    return { data: projectsWithCounts };
  } catch (error) {
    return { data: [], error: error as Error };
  }
};

export const createProject = async (env: Env, projectData: {
  title: string;
  description?: string;
  priority?: string;
  targetCompletion?: string;
  assignedAgent?: string;
}): Promise<{ data: Project; error?: Error }> => {
  try {
    const db = env.DB;
    const projectId = crypto.randomUUID();
    const now = nowPST();

    await db.prepare(`
      INSERT INTO projects (id, title, description, status, priority, assigned_agent, target_completion, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      projectId,
      projectData.title,
      projectData.description || null,
      "planning",
      projectData.priority || "medium",
      projectData.assignedAgent || null,
      projectData.targetCompletion || null,
      now,
      now
    ).run();

    const project: Project = {
      id: projectId,
      title: projectData.title,
      description: projectData.description,
      status: "planning",
      priority: projectData.priority || "medium",
      assignedAgent: projectData.assignedAgent,
      targetCompletion: projectData.targetCompletion,
      createdAt: now,
      updatedAt: now,
      taskCount: 0,
      epicCount: 0,
    };

    return { data: project };
  } catch (error) {
    return { data: {} as Project, error: error as Error };
  }
};

export const getProject = async (env: Env, projectId: string): Promise<{ data: {
  project: Project;
  epics: Epic[];
  tasks: any[];
  agentActivity: any[];
}; error?: Error }> => {
  try {
    const db = env.DB;

    // Get project
    const projectResult = await db.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();
    if (!projectResult) {
      return { data: {} as any, error: new Error("Project not found") };
    }

    const projectRow = projectResult as unknown as ProjectRow;
    const project: Project = {
      id: projectRow.id,
      title: projectRow.title,
      description: projectRow.description || undefined,
      status: projectRow.status,
      priority: projectRow.priority,
      assignedAgent: projectRow.assigned_agent || undefined,
      targetCompletion: projectRow.target_completion || undefined,
      createdAt: projectRow.created_at,
      updatedAt: projectRow.updated_at,
    };

    // Get epics (note: epics don't have project_id in current schema, so returning empty array)
    // TODO: Link epics to projects in future schema update
    const epics: Epic[] = [];

    // Get tasks
    const tasksResult = await db.prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC").bind(projectId).all();
    const tasks = tasksResult.results || [];

    // Get recent agent activity (simplified - actions_log doesn't have agent_name column)
    // TODO: Implement proper agent activity tracking
    const agentActivity: any[] = [];

    return {
      data: {
        project,
        epics,
        tasks,
        agentActivity,
      }
    };
  } catch (error) {
    return { data: {} as any, error: error as Error };
  }
};

export const getProjectEpics = async (env: Env, projectId: string): Promise<{ data: Epic[]; error?: Error }> => {
  try {
    const db = env.DB;
    const epicsResult = await db.prepare("SELECT * FROM epics WHERE project_id = ? ORDER BY created_at ASC").bind(projectId).all();

    return {
      data: ((epicsResult.results as unknown) as EpicRow[]).map(epic => ({
        id: epic.id,
        title: epic.title,
        description: epic.description || undefined,
        status: epic.status,
        priority: epic.priority,
        projectId: epic.project_id,
        createdAt: epic.created_at,
      }))
    };
  } catch (error) {
    return { data: [], error: error as Error };
  }
};

export const reassignProjectTasks = async (env: Env, projectId: string): Promise<{ data: { reassigned: number }; error?: Error }> => {
  try {
    const db = env.DB;

    // Get all unassigned tasks in the project
    const unassignedTasksResult = await db.prepare(`
      SELECT id FROM tasks
      WHERE project_id = ? AND assigned_agent IS NULL AND status NOT IN ('completed', 'cancelled')
    `).bind(projectId).all();
    const unassignedTasks = unassignedTasksResult.results as { id: string }[];

    if (unassignedTasks.length === 0) {
      return { data: { reassigned: 0 } };
    }

    // Get available agents (simplified - just get all agents for now)
    const agents = await listAgents(env);
    if (agents.error || agents.data.length === 0) {
      return { data: { reassigned: 0 } };
    }

    // Simple round-robin assignment
    let reassigned = 0;
    for (let i = 0; i < unassignedTasks.length; i++) {
      const agentIndex = i % agents.data.length;
      const agent = agents.data[agentIndex];

      await db.prepare("UPDATE tasks SET assigned_agent = ? WHERE id = ?")
        .bind(agent.name, unassignedTasks[i].id)
        .run();

      reassigned++;
    }

    return { data: { reassigned } };
  } catch (error) {
    return { data: { reassigned: 0 }, error: error as Error };
  }
};

// Thread and chat functionality
export const getProjectThreads = async (env: Env, projectId: string): Promise<{ data: ProjectThread[]; error?: Error }> => {
  try {
    const db = env.DB;

    // Get threads with message counts
    const threadsResult = await db.prepare(`
      SELECT t.id, t.subject, t.author, t.created_at, COUNT(tm.id) as message_count
      FROM threads t
      LEFT JOIN thread_messages tm ON t.id = tm.thread_id
      WHERE t.project_id = ?
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `).bind(projectId).all();

    return {
      data: (threadsResult.results as { id: string; subject: string; author: string; created_at: string; message_count: number }[]).map(thread => ({
        id: thread.id,
        subject: thread.subject,
        author: thread.author,
        projectId,
        createdAt: thread.created_at,
        messageCount: Number(thread.message_count),
      }))
    };
  } catch (error) {
    return { data: [], error: error as Error };
  }
};

export const createProjectThread = async (env: Env, projectId: string, threadData: {
  subject: string;
  message: string;
  projectId: string;
}): Promise<{ data: { thread: ProjectThread; message: ThreadMessage }; error?: Error }> => {
  try {
    const db = env.DB;
    const threadId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const now = nowPST();

    // Create thread
    await db.prepare(`
      INSERT INTO threads (id, subject, author, project_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(threadId, threadData.subject, "system", projectId, now).run();

    // Create initial message
    await db.prepare(`
      INSERT INTO thread_messages (id, thread_id, content, author, timestamp, parent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(messageId, threadId, threadData.message, "system", now, null).run();

    const thread: ProjectThread = {
      id: threadId,
      subject: threadData.subject,
      author: "system",
      projectId,
      createdAt: now,
      messageCount: 1,
    };

    const message: ThreadMessage = {
      id: messageId,
      threadId,
      content: threadData.message,
      author: "system",
      timestamp: now,
    };

    return { data: { thread, message } };
  } catch (error) {
    return { data: {} as any, error: error as Error };
  }
};

export const getProjectThreadMessages = async (env: Env, threadId: string): Promise<{ data: ThreadMessage[]; error?: Error }> => {
  try {
    const db = env.DB;

    const messagesResult = await db.prepare(`
      SELECT * FROM thread_messages
      WHERE thread_id = ?
      ORDER BY timestamp ASC
    `).bind(threadId).all();

    const messages = (messagesResult.results as unknown) as ThreadMessageRow[];

    // Build message tree (replies nested under parent messages)
    const messageMap = new Map<string, ThreadMessage>();
    const rootMessages: ThreadMessage[] = [];

    messages.forEach(msg => {
      const message: ThreadMessage = {
        id: msg.id,
        threadId: msg.thread_id,
        content: msg.content,
        author: msg.author,
        timestamp: msg.timestamp,
        parentId: msg.parent_id || undefined,
        replies: [],
      };

      messageMap.set(msg.id, message);

      if (msg.parent_id) {
        const parent = messageMap.get(msg.parent_id);
        if (parent) {
          parent.replies = parent.replies || [];
          parent.replies.push(message);
        }
      } else {
        rootMessages.push(message);
      }
    });

    return { data: rootMessages };
  } catch (error) {
    return { data: [], error: error as Error };
  }
};

export const createThreadMessage = async (env: Env, threadId: string, messageData: {
  content: string;
  author: string;
  parentId?: string;
}): Promise<{ data: ThreadMessage; error?: Error }> => {
  try {
    const db = env.DB;
    const messageId = crypto.randomUUID();
    const now = nowPST();

    await db.prepare(`
      INSERT INTO thread_messages (id, thread_id, content, author, timestamp, parent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      messageId,
      threadId,
      messageData.content,
      messageData.author,
      now,
      messageData.parentId || null
    ).run();

    const message: ThreadMessage = {
      id: messageId,
      threadId,
      content: messageData.content,
      author: messageData.author,
      timestamp: now,
      parentId: messageData.parentId,
    };

    return { data: message };
  } catch (error) {
    return { data: {} as ThreadMessage, error: error as Error };
  }
};

// Agent management
export const listAgents = async (env: Env): Promise<{ data: Agent[]; error?: Error }> => {
  try {
    const db = env.DB;

    // Get agents from recent activity (simplified approach)
    const agentsResult = await db.prepare(`
      SELECT DISTINCT agent_name
      FROM actions_log
      WHERE agent_name IS NOT NULL
      ORDER BY agent_name
    `).all();

    return {
      data: (agentsResult.results as { agent_name: string }[]).map(agent => ({
        name: agent.agent_name,
        status: "active", // Simplified
      }))
    };
  } catch (error) {
    return { data: [], error: error as Error };
  }
};
