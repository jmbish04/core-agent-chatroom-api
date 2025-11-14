import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

import { nowPST, isoToPST } from "./time";

import type {
  AgentActivity,
  AgentCheckInInput,
  AgentStatusRecord,
  AgentStatusType,
  Env,
  NormalizedTestDefinition,
  SessionSummary,
  TaskCounts,
  TaskBlockInput,
  TaskBlocker,
  TaskUnblockInput,
  TestDefinitionRecord,
  TestResultRecord,
  TestRunResult,
  TestStatus,
  TaskRecord,
  TaskStatus,
  TaskFilterOptions,
  TaskSummary,
  TaskStatusUpdateInput,
  CreateTaskInput,
} from "../types";
export const testDefsTable = sqliteTable("test_defs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category"),
  severity: text("severity"),
  isActive: integer("is_active").notNull().default(1),
  errorMap: text("error_map"), // Legacy field, kept for backward compatibility
  errorMeaningsJson: text("error_meanings_json"), // Mapping of error codes to their meanings
  errorSolutionsJson: text("error_solutions_json"), // Mapping of error codes to solution paths
  metadata: text("metadata"), // Additional context for AI models
  createdAt: text("created_at").notNull(),
});

export const testResultsTable = sqliteTable("test_results", {
  id: text("id").primaryKey(),
  sessionUuid: text("session_uuid").notNull(),
  testFk: text("test_fk").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  durationMs: integer("duration_ms"),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  raw: text("raw"),
  aiDescription: text("ai_human_readable_error_description"),
  aiFixPrompt: text("ai_prompt_to_fix_error"),
  createdAt: text("created_at").notNull(),
});

export const epicsTable = sqliteTable("epics", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  assignedAgent: text("assigned_agent"),
  targetCompletion: text("target_completion"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tasksTable = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().default("default"),
  epicId: text("epic_id").references(() => epicsTable.id),
  parentTaskId: text("parent_task_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  assignedAgent: text("assigned_agent"),
  estimatedHours: real("estimated_hours"),
  actualHours: real("actual_hours"),
  requiresHumanReview: integer("requires_human_review").notNull().default(0),
  humanReviewReason: text("human_review_reason"),
  humanReviewResponse: text("human_review_response"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const taskDependenciesTable = sqliteTable("task_dependencies", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  dependentTaskId: text("dependent_task_id").notNull().references(() => tasksTable.id),
  dependencyTaskId: text("dependency_task_id").notNull().references(() => tasksTable.id),
  dependencyType: text("dependency_type").notNull(),
  createdAt: text("created_at").notNull(),
});

export const taskBlockagesTable = sqliteTable("task_blockages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  taskId: text("task_id").notNull().references(() => tasksTable.id),
  blockedAgent: text("blocked_agent").notNull(),
  blockingOwner: text("blocking_owner"),
  reason: text("reason").notNull(),
  severity: text("severity").notNull(),
  requiresHumanIntervention: integer("requires_human_intervention").notNull().default(0),
  humanInterventionReason: text("human_intervention_reason"),
  resolvedAt: text("resolved_at"),
  resolvedBy: text("resolved_by"),
  resolutionNote: text("resolution_note"),
  acked: integer("acked").notNull().default(0),
  lastNotified: text("last_notified"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentStatusTable = sqliteTable("agent_status", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  agentName: text("agent_name").notNull(),
  status: text("status").notNull(),
  currentTaskId: text("current_task_id").references(() => tasksTable.id),
  lastActivity: text("last_activity").notNull(),
  statusMessage: text("status_message"),
  requiresAttention: integer("requires_attention").notNull().default(0),
  attentionReason: text("attention_reason"),
  updatedAt: text("updated_at").notNull(),
});

export const threadsTable = sqliteTable("threads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id").notNull(),
  threadId: text("thread_id").notNull(),
  subject: text("subject").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const messageLogsTable = sqliteTable("message_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: text("message_id").notNull(),
  projectId: text("project_id").notNull(),
  threadId: text("thread_id"),
  replyToMessageId: text("reply_to_message_id"),
  messageType: text("message_type").notNull(),
  senderType: text("sender_type").notNull(),
  senderName: text("sender_name").notNull(),
  senderId: text("sender_id"),
  epicId: text("epic_id"),
  taskId: text("task_id"),
  content: text("content").notNull(),
  metadata: text("metadata"),
  timestamp: text("timestamp").notNull(),
  createdAt: text("created_at").notNull(),
});

// Projects table: Main project container
export const projectsTable = sqliteTable("projects", {
  pk: integer("pk").primaryKey({ autoIncrement: true }),
  projectId: text("project_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  githubRepo: text("github_repo"),
  githubOwner: text("github_owner"),
  githubBranch: text("github_branch").default("main"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Chat rooms table: Linked to projects
export const chatRoomsTable = sqliteTable("chat_rooms", {
  pk: integer("pk").primaryKey({ autoIncrement: true }),
  id: text("id").notNull().unique(),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.projectId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Chat threads table: Linked to chat rooms
export const chatThreadsTable = sqliteTable("chat_threads", {
  pk: integer("pk").primaryKey({ autoIncrement: true }),
  id: text("id").notNull().unique(),
  chatRoomId: text("chat_room_id")
    .notNull()
    .references(() => chatRoomsTable.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Chat messages table: Linked to threads
export const chatMessagesTable = sqliteTable("chat_messages", {
  pk: integer("pk").primaryKey({ autoIncrement: true }),
  id: text("id").notNull().unique(),
  threadId: text("thread_id")
    .notNull()
    .references(() => chatThreadsTable.id, { onDelete: "cascade" }),
  senderType: text("sender_type").notNull(),
  senderName: text("sender_name").notNull(),
  senderId: text("sender_id"),
  content: text("content").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Deserialization functions
export function deserializeEpic(row: any): import("../types").Epic {
  return {
    id: row.id,
    projectId: row.project_id, // This will be undefined since the column doesn't exist
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignedAgent: row.assigned_agent,
    targetCompletion: row.target_completion,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function deserializeTask(row: any): import("../types").Task {
  return {
    id: row.id,
    projectId: row.projectId,
    epicId: row.epicId,
    parentTaskId: row.parentTaskId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignedAgent: row.assignedAgent,
    estimatedHours: row.estimatedHours,
    actualHours: row.actualHours,
    requiresHumanReview: row.requiresHumanReview === 1,
    humanReviewReason: row.humanReviewReason,
    humanReviewResponse: row.humanReviewResponse,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function deserializeTaskBlockage(row: any): import("../types").TaskBlockage {
  return {
    id: row.id,
    projectId: row.projectId,
    taskId: row.taskId,
    blockedAgent: row.blockedAgent,
    blockingOwner: row.blockingOwner,
    reason: row.reason,
    severity: row.severity,
    requiresHumanIntervention: row.requiresHumanIntervention === 1,
    humanInterventionReason: row.humanInterventionReason,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
    resolutionNote: row.resolutionNote,
    acked: row.acked === 1,
    lastNotified: row.lastNotified,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function deserializeProject(row: any): import("../types").Project {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignedAgent: row.assigned_agent,
    targetCompletion: row.target_completion,
    createdAt: row.created_at,
    updatedAt: row.updatedAt,
  };
}

export function deserializeChatRoom(row: any): import("../types").ChatRoom {
  return {
    pk: row.pk,
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function deserializeChatThread(row: any): import("../types").ChatThread {
  return {
    pk: row.pk,
    id: row.id,
    chatRoomId: row.chatRoomId,
    subject: row.subject,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function deserializeChatMessage(row: any): import("../types").ChatMessage {
  return {
    pk: row.pk,
    id: row.id,
    threadId: row.threadId,
    senderType: row.senderType,
    senderName: row.senderName,
    senderId: row.senderId,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function deserializeAgentStatus(row: any): import("../types").AgentStatus {
  return {
    id: row.id,
    projectId: row.projectId,
    agentName: row.agentName,
    status: row.status as AgentStatusType,
    currentTaskId: row.currentTaskId,
    lastActivity: row.lastActivity,
    statusMessage: row.statusMessage,
    requiresAttention: row.requiresAttention === 1,
    attentionReason: row.attentionReason,
    updatedAt: row.updatedAt,
  };
}

export const agentActivityTable = sqliteTable("agent_activity", {
  agentName: text("agent_name").primaryKey(),
  status: text("status").notNull(),
  taskId: text("task_id"),
  note: text("note"),
  lastCheckIn: text("last_check_in").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const taskBlockersTable = sqliteTable("task_blockers", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  projectId: text("project_id"),
  blockedAgent: text("blocked_agent").notNull(),
  blockingOwner: text("blocking_owner"),
  reason: text("reason").notNull(),
  severity: text("severity").notNull(),
  requiresHumanIntervention: integer("requires_human_intervention").notNull().default(0),
  humanInterventionReason: text("human_intervention_reason"),
  resolvedAt: text("resolved_at"),
  resolvedBy: text("resolved_by"),
  resolutionNote: text("resolution_note"),
  acked: integer("acked").notNull().default(0),
  lastNotified: text("last_notified"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export interface AgentActivityRecord {
  agent_name: string;
  status: string;
  task_id: string | null;
  note: string | null;
  last_check_in: string;
  updated_at: string;
}

export interface TaskBlockerRecord {
  id: string;
  task_id: string | null;
  blocked_agent: string;
  blocking_owner: string | null;
  reason: string | null;
  acked: number;
  last_notified: string | null;
  created_at: string;
  updated_at: string;
}

interface Database {
  test_defs: TestDefinitionRecord;
  test_results: TestResultRecord;
  tasks: TaskRecord;
  agent_activity: AgentActivityRecord;
  agent_status: AgentStatusRecord;
  task_blockers: TaskBlockerRecord;
}

const schema = {
  testDefsTable,
  testResultsTable,
  tasksTable,
  agentActivityTable,
  taskBlockersTable,
  epicsTable,
  taskDependenciesTable,
  taskBlockagesTable,
  agentStatusTable,
  threadsTable,
  messageLogsTable,
};

let cachedKysely: Kysely<Database> | undefined;
let cachedDrizzle: DrizzleD1Database<typeof schema> | undefined;
export const getKysely = (env: Env): Kysely<Database> => {
  if (!cachedKysely) {
    cachedKysely = new Kysely<Database>({
      dialect: new D1Dialect({ database: env.DB }),
    });
  }
  return cachedKysely;
};

export const getDrizzle = (env: Env): DrizzleD1Database<typeof schema> => {
  if (!cachedDrizzle) {
    cachedDrizzle = drizzle(env.DB, { schema });
  }
  return cachedDrizzle;
};
const deserializeErrorMap = (
  raw: string | null | undefined,
): Record<string, { meaning: string; fix: string }> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, { meaning: string; fix: string }>;
    }
  } catch (error) {
    console.warn("Failed to parse error_map", error);
  }
  return {};
};

const normalizeDefinition = (row: TestDefinitionRecord): NormalizedTestDefinition => {
  // Parse new schema fields
  const errorMeaningsJson = row.error_meanings_json
    ? (JSON.parse(row.error_meanings_json) as Record<string, { meaning: string }>)
    : undefined;
  const errorSolutionsJson = row.error_solutions_json
    ? (JSON.parse(row.error_solutions_json) as Record<string, { fix: string }>)
    : undefined;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category ?? null,
    severity: row.severity ?? null,
    createdAt: isoToPST(row.created_at),
    isActive: row.is_active === 1,
    errorMap: deserializeErrorMap(row.error_map), // Legacy field
    errorMeaningsJson, // New field
    errorSolutionsJson, // New field
    metadata: row.metadata ?? undefined,
  };
};
export const listActiveTests = async (env: Env): Promise<NormalizedTestDefinition[]> => {
  const db = getKysely(env);
  const rows = await db
    .selectFrom("test_defs")
    .selectAll()
    .where("is_active", "=", 1)
    .orderBy("created_at", "asc")
    .execute();

  return rows.map(normalizeDefinition);
};

/**
 * Load all test definitions from D1 and return them as UpsertTestDefinitionParams.
 * This is used to get default test definitions from the database instead of hardcoded values.
 */
export const loadDefaultTestDefinitionsFromD1 = async (
  env: Env,
): Promise<UpsertTestDefinitionParams[]> => {
  const db = getKysely(env);
  const rows = await db
    .selectFrom("test_defs")
    .selectAll()
    .orderBy("created_at", "asc")
    .execute();

  return rows.map((row) => {
    // Parse new schema fields
    const errorMeaningsJson = row.error_meanings_json
      ? (JSON.parse(row.error_meanings_json) as Record<string, { meaning: string }>)
      : undefined;
    const errorSolutionsJson = row.error_solutions_json
      ? (JSON.parse(row.error_solutions_json) as Record<string, { fix: string }>)
      : undefined;

    // Legacy errorMap for backward compatibility
    const errorMap = row.error_map
      ? (JSON.parse(row.error_map) as Record<string, { meaning: string; fix: string }>)
      : undefined;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category ?? undefined,
      severity: row.severity ?? undefined,
      isActive: row.is_active === 1,
      errorMap, // Legacy field
      errorMeaningsJson, // New field
      errorSolutionsJson, // New field
      metadata: row.metadata ?? undefined,
    };
  });
};
const mapResultRow = (
  row: TestResultRecord,
  definitionLookup: Map<string, NormalizedTestDefinition>,
): TestRunResult => {
  const definition = definitionLookup.get(row.test_fk);
  return {
    definition: definition ?? {
      id: row.test_fk,
      name: "Unknown Test",
      description: "Definition missing",
      category: null,
      severity: null,
      createdAt: row.created_at,
      isActive: true,
      errorMap: {},
    },
    status: row.status,
    durationMs: row.duration_ms ?? 0,
    errorCode: row.error_code ?? undefined,
    raw: row.raw ? safeJsonParse(row.raw) : undefined,
    aiDescription: row.ai_human_readable_error_description ?? undefined,
    aiFixPrompt: row.ai_prompt_to_fix_error ?? undefined,
  };
};

const safeJsonParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to parse JSON payload", error);
    return raw;
  }
};

type AgentActivityRow = AgentActivityRecord | typeof agentActivityTable.$inferSelect;
type TaskBlockerRow = TaskBlockerRecord | typeof taskBlockersTable.$inferSelect;

const toTaskSummary = (row: TaskRecord): TaskSummary => ({
  id: row.id,
  projectId: row.project_id,
  epicId: row.epic_id,
  parentTaskId: row.parent_task_id,
  title: row.title,
  description: row.description,
  status: row.status as TaskStatus,
  priority: row.priority,
  assignedAgent: row.assigned_agent,
  estimatedHours: row.estimated_hours ?? null,
  actualHours: row.actual_hours ?? null,
  requiresHumanReview: row.requires_human_review === 1,
  humanReviewReason: row.human_review_reason,
  humanReviewResponse: row.human_review_response,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toAgentActivity = (row: AgentActivityRow): AgentActivity => ({
  agentName: "agent_name" in row ? row.agent_name : row.agentName,
  status: row.status as AgentStatusType,
  taskId: "task_id" in row ? row.task_id : row.taskId,
  note: row.note,
  lastCheckIn: "last_check_in" in row ? row.last_check_in : row.lastCheckIn,
  updatedAt: "updated_at" in row ? row.updated_at : row.updatedAt,
});

const toTaskBlocker = (row: TaskBlockerRow): TaskBlocker => ({
  id: row.id,
  taskId: "task_id" in row ? (row.task_id || "") : (row.taskId || ""),
  blockedAgent: "blocked_agent" in row ? row.blocked_agent : row.blockedAgent,
  blockingOwner: "blocking_owner" in row ? row.blocking_owner : row.blockingOwner,
  reason: row.reason,
  acked: row.acked === 1,
  lastNotified: "last_notified" in row ? row.last_notified : row.lastNotified,
  createdAt: "created_at" in row ? row.created_at : row.createdAt,
  updatedAt: "updated_at" in row ? row.updated_at : row.updatedAt,
});
export const getSessionSummary = async (
  env: Env,
  sessionUuid: string,
): Promise<SessionSummary | null> => {
  const db = getKysely(env);
  const rows = await db
    .selectFrom("test_results")
    .selectAll()
    .where("session_uuid", "=", sessionUuid)
    .orderBy("started_at", "asc")
    .execute();

  if (rows.length === 0) {
    return null;
  }

  const testIds = [...new Set(rows.map((row) => row.test_fk))];
  const defs = await db
    .selectFrom("test_defs")
    .selectAll()
    .where("id", "in", testIds)
    .execute();
  const lookup = new Map<string, NormalizedTestDefinition>();
  defs.forEach((def) => lookup.set(def.id, normalizeDefinition(def)));

  const results = rows.map((row) => mapResultRow(row, lookup));
  const startedAt = isoToPST(rows[0].started_at);
  const lastFinishedAt = rows[rows.length - 1].finished_at;
  const durationMs = rows.reduce((acc, row) => acc + (row.duration_ms ?? 0), 0);
  const passed = rows.filter((row) => row.status === "pass").length;
  const failed = rows.length - passed;

  const session: any = {
    sessionUuid,
    startedAt,
    durationMs,
    total: rows.length,
    passed,
    failed,
    results,
  };

  // Only include finishedAt if it has a value
  if (lastFinishedAt) {
    session.finishedAt = isoToPST(lastFinishedAt);
  }

  return session;
};
export const getLatestSession = async (env: Env): Promise<SessionSummary | null> => {
  const db = getKysely(env);
  const latest = await db
    .selectFrom("test_results")
    .select("session_uuid")
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();

  if (!latest) {
    return null;
  }

  return getSessionSummary(env, latest.session_uuid);
};
export interface InsertTestResultParams {
  id: string;
  sessionUuid: string;
  testFk: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status: TestStatus;
  errorCode?: string;
  raw?: unknown;
  aiDescription?: string;
  aiFixPrompt?: string;
}

export const insertTestResult = async (env: Env, params: InsertTestResultParams) => {
  const db = getDrizzle(env);
  await db.insert(testResultsTable).values({
    id: params.id,
    sessionUuid: params.sessionUuid,
    testFk: params.testFk,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt ?? null,
    durationMs: params.durationMs ?? null,
    status: params.status,
    errorCode: params.errorCode ?? null,
    raw: params.raw ? JSON.stringify(params.raw) : null,
    aiDescription: params.aiDescription ?? null,
    aiFixPrompt: params.aiFixPrompt ?? null,
    createdAt: nowPST(),
  });
};
export const countActiveTests = async (env: Env): Promise<number> => {
  const db = getKysely(env);
  const result = await db
    .selectFrom("test_defs")
    .select(({ fn }) => fn.count<string>("id").as("count"))
    .where("is_active", "=", 1)
    .executeTakeFirst();

  return result ? Number(result.count) : 0;
};
export interface UpsertTestDefinitionParams {
  id: string;
  name: string;
  description: string;
  category?: string | null;
  severity?: string | null;
  isActive?: boolean;
  errorMap?: Record<string, { meaning: string; fix: string }>; // Legacy field
  errorMeaningsJson?: Record<string, { meaning: string }>; // New: mapping of error codes to meanings
  errorSolutionsJson?: Record<string, { fix: string }>; // New: mapping of error codes to solution paths
  metadata?: string | null; // New: additional context for AI models
}

export const upsertTestDefinition = async (
  env: Env,
  params: UpsertTestDefinitionParams,
) => {
  const db = getDrizzle(env);
  const payload = {
    id: params.id,
    name: params.name,
    description: params.description,
    category: params.category ?? null,
    severity: params.severity ?? null,
    isActive: params.isActive === false ? 0 : 1,
    errorMap: params.errorMap ? JSON.stringify(params.errorMap) : null, // Legacy field
    errorMeaningsJson: params.errorMeaningsJson ? JSON.stringify(params.errorMeaningsJson) : null,
    errorSolutionsJson: params.errorSolutionsJson ? JSON.stringify(params.errorSolutionsJson) : null,
    metadata: params.metadata ?? null,
    createdAt: nowPST(),
  };

  await db
    .insert(testDefsTable)
    .values(payload)
    .onConflictDoUpdate({
      target: testDefsTable.id,
      set: {
        name: payload.name,
        description: payload.description,
        category: payload.category,
        severity: payload.severity,
        isActive: payload.isActive,
        errorMap: payload.errorMap, // Legacy field
        errorMeaningsJson: payload.errorMeaningsJson,
        errorSolutionsJson: payload.errorSolutionsJson,
        metadata: payload.metadata,
      },
    });
};
export const listTasks = async (
  env: Env,
  filters: TaskFilterOptions = {},
): Promise<TaskSummary[]> => {
  const db = getKysely(env);
  let query = db.selectFrom("tasks").selectAll();

  if (filters.projectId) {
    query = query.where("project_id", "=", filters.projectId);
  }

  if (filters.epicId) {
    query = query.where("epic_id", "=", filters.epicId);
  }

  if (filters.parentTaskId) {
    query = query.where("parent_task_id", "=", filters.parentTaskId);
  }

  if (filters.agent) {
    query = query.where("assigned_agent", "=", filters.agent);
  }

  if (filters.status) {
    query = query.where("status", "=", filters.status);
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.where((eb) =>
      eb.or([
        eb("title", "like", term),
        eb("description", "like", term),
        eb("assigned_agent", "like", term),
      ]),
    );
  }

  if (filters.taskIds?.length) {
    query = query.where("id", "in", filters.taskIds);
  }

  const rows = await query.orderBy("updated_at", "desc").execute();
  return rows.map(toTaskSummary);
};

export const getTaskById = async (env: Env, id: string): Promise<TaskSummary | null> => {
  const db = getKysely(env);
  const row = await db
    .selectFrom("tasks")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  return row ? toTaskSummary(row) : null;
};

export const listOpenTasks = async (env: Env): Promise<TaskSummary[]> => {
  const db = getKysely(env);
  const rows = await db
    .selectFrom("tasks")
    .selectAll()
    .where("status", "!=", "done")
    .orderBy("priority", "desc")
    .orderBy("updated_at", "desc")
    .execute();
  return rows.map(toTaskSummary);
};

export const bulkReassignTasks = async (
  env: Env,
  taskIds: string[],
  agent: string,
): Promise<TaskSummary[]> => {
  if (taskIds.length === 0) {
    return [];
  }
  const db = getDrizzle(env);
  const now = nowPST();
  await db
    .update(tasksTable)
    .set({ assignedAgent: agent, updatedAt: now })
    .where(inArray(tasksTable.id, taskIds));

  return listTasks(env, { taskIds });
};

export const bulkUpdateTaskStatuses = async (
  env: Env,
  updates: TaskStatusUpdateInput[],
): Promise<TaskSummary[]> => {
  if (updates.length === 0) {
    return [];
  }
  const db = getDrizzle(env);
  const now = nowPST();
  await Promise.all(
    updates.map((item) =>
      db
        .update(tasksTable)
        .set({ status: item.status, updatedAt: now })
        .where(eq(tasksTable.id, item.taskId)),
    ),
  );

  const ids = Array.from(new Set(updates.map((item) => item.taskId)));
  return listTasks(env, { taskIds: ids });
};

export const updateTaskStatus = async (
  env: Env,
  taskId: string,
  status: TaskStatus,
): Promise<TaskSummary | null> => {
  const [result] = await bulkUpdateTaskStatuses(env, [
    { taskId, status },
  ]);
  return result ?? null;
};

export const createTask = async (
  env: Env,
  input: CreateTaskInput,
): Promise<TaskSummary> => {
  const db = getDrizzle(env);
  const id = crypto.randomUUID();
  const now = nowPST();
  await db.insert(tasksTable).values({
    id,
    projectId: input.projectId,
    epicId: input.epicId ?? null,
    parentTaskId: input.parentTaskId ?? null,
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? "todo",
    priority: input.priority ?? "medium",
    assignedAgent: input.assignedAgent ?? null,
    estimatedHours: input.estimatedHours ?? null,
    actualHours: input.actualHours ?? null,
    requiresHumanReview: input.requiresHumanReview ? 1 : 0,
    humanReviewReason: input.humanReviewReason ?? null,
    humanReviewResponse: null,
    createdAt: now,
    updatedAt: now,
  });
  const task = await getTaskById(env, id);
  if (!task) {
    throw new Error("Failed to create task");
  }
  return task;
};

export const getTaskCounts = async (env: Env): Promise<TaskCounts> => {
  const db = getKysely(env);
  const rows = await db
    .selectFrom("tasks")
    .select(["status", ({ fn }) => fn.count<string>("id").as("count")])
    .groupBy("status")
    .execute();

  const counts: TaskCounts = {
    pending: 0,
    in_progress: 0,
    blocked: 0,
    done: 0,
    backlog: 0,
    todo: 0,
    review: 0,
    cancelled: 0,
    on_hold: 0,
    total: 0,
  };

  for (const row of rows as Array<{ status: string; count: string }>) {
    const status = row.status as TaskStatus;
    if (status in counts) {
      counts[status] = Number(row.count);
    }
    counts.total += Number(row.count);
  }

  return counts;
};

export const listAgentActivity = async (env: Env): Promise<AgentActivity[]> => {
  const db = getKysely(env);
  const rows = await db
    .selectFrom("agent_activity")
    .selectAll()
    .orderBy("updated_at", "desc")
    .execute();
  return rows.map((row) => toAgentActivity(row));
};

export const upsertAgentActivity = async (
  env: Env,
  input: AgentCheckInInput,
): Promise<AgentActivity> => {
  const db = getDrizzle(env);
  const now = nowPST();
  await db
    .insert(agentActivityTable)
    .values({
      agentName: input.agentName,
      status: input.status,
      taskId: input.taskId ?? null,
      note: input.note ?? null,
      lastCheckIn: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agentActivityTable.agentName,
      set: {
        status: input.status,
        taskId: input.taskId ?? null,
        note: input.note ?? null,
        lastCheckIn: now,
        updatedAt: now,
      },
    });

  const record = await db
    .select()
    .from(agentActivityTable)
    .where(eq(agentActivityTable.agentName, input.agentName))
    .limit(1)
    .get();
  if (!record) {
    throw new Error("Failed to persist agent activity");
  }
  return toAgentActivity(record);
};

export const insertTaskBlock = async (
  env: Env,
  input: TaskBlockInput,
): Promise<TaskBlocker> => {
  const db = getDrizzle(env);
  const now = nowPST();

  const existing = await db
    .select()
    .from(taskBlockersTable)
    .where(
      and(
        eq(taskBlockersTable.taskId, input.taskId),
        eq(taskBlockersTable.blockedAgent, input.blockedAgent),
      ),
    )
    .limit(1)
    .get();

  if (existing) {
    await db
      .update(taskBlockersTable)
      .set({
        blockingOwner: input.blockingOwner ?? null,
        reason: input.reason || "Updated block reason",
        acked: 0,
        updatedAt: now,
      })
      .where(eq(taskBlockersTable.id, existing.id));
  } else {
    await db.insert(taskBlockersTable).values({
      id: crypto.randomUUID(),
      taskId: input.taskId,
      blockedAgent: input.blockedAgent,
      blockingOwner: input.blockingOwner ?? null,
      reason: input.reason || "Task blocked",
      severity: "medium",
      requiresHumanIntervention: 0,
      acked: 0,
      lastNotified: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const record = await db
    .select()
    .from(taskBlockersTable)
    .where(
      and(
        eq(taskBlockersTable.taskId, input.taskId),
        eq(taskBlockersTable.blockedAgent, input.blockedAgent),
      ),
    )
    .limit(1)
    .get();

  if (!record) {
    throw new Error("Failed to persist task block");
  }
  return toTaskBlocker(record);
};

export const resolveTaskBlock = async (
  env: Env,
  input: TaskUnblockInput,
): Promise<TaskBlocker | null> => {
  const db = getDrizzle(env);
  const now = nowPST();
  await db
    .update(taskBlockersTable)
    .set({
      resolvedAt: now,
      resolvedBy: input.resolvedBy || null,
      resolutionNote: input.note || null,
      updatedAt: now,
    })
    .where(
      and(
        eq(taskBlockersTable.taskId, input.taskId),
        eq(taskBlockersTable.blockedAgent, input.blockedAgent),
      ),
    );

  const record = await db
    .select()
    .from(taskBlockersTable)
    .where(
      and(
        eq(taskBlockersTable.taskId, input.taskId),
        eq(taskBlockersTable.blockedAgent, input.blockedAgent),
      ),
    )
    .limit(1)
    .get();

  return record ? toTaskBlocker(record) : null;
};

export const ackTaskBlock = async (
  env: Env,
  taskId: string,
  blockedAgent: string,
): Promise<TaskBlocker | null> => {
  const db = getDrizzle(env);
  const now = nowPST();
  await db
    .update(taskBlockersTable)
    .set({
      acked: 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(taskBlockersTable.taskId, taskId),
        eq(taskBlockersTable.blockedAgent, blockedAgent),
      ),
    );

  const record = await db
    .select()
    .from(taskBlockersTable)
    .where(
      and(
        eq(taskBlockersTable.taskId, taskId),
        eq(taskBlockersTable.blockedAgent, blockedAgent),
      ),
    )
    .limit(1)
    .get();

  return record ? toTaskBlocker(record) : null;
};

export const listBlockedTasks = async (
  env: Env,
  options: { includeAcked?: boolean } = {},
): Promise<TaskBlocker[]> => {
  const includeAcked = options.includeAcked ?? false;
  const db = getKysely(env);
  let query = db.selectFrom("task_blockers" as any).selectAll();
  if (!includeAcked) {
    query = query.where("acked", "=", 0);
  }
  const rows = await query.orderBy("updated_at", "desc").execute();
  return rows.map((row) => toTaskBlocker(row as TaskBlockerRow));
};

export const touchBlockLastNotified = async (env: Env, blockId: string) => {
  const db = getDrizzle(env);
  await db
    .update(taskBlockersTable)
    .set({ lastNotified: nowPST() })
    .where(eq(taskBlockersTable.id, blockId));
};

// ============================================================================
// Projects Database Functions
// ============================================================================

export const createProject = async (
  env: Env,
  input: {
    projectId: string;
    name: string;
    description?: string | null;
    githubRepo?: string | null;
    githubOwner?: string | null;
    githubBranch?: string | null;
  },
): Promise<import("../types").Project> => {
  const db = getDrizzle(env);
  const now = nowPST();
  await db.insert(projectsTable).values({
    projectId: input.projectId,
    name: input.name,
    description: input.description,
    githubRepo: input.githubRepo,
    githubOwner: input.githubOwner,
    githubBranch: input.githubBranch ?? "main",
    createdAt: now,
    updatedAt: now,
  });

  const record = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.projectId, input.projectId))
    .limit(1)
    .get();

  if (!record) {
    throw new Error("Failed to create project");
  }
  return deserializeProject(record);
};

export const listProjects = async (
  env: Env,
): Promise<import("../types").Project[]> => {
  const db = getDrizzle(env);
  const records = await db.select().from(projectsTable).all();
  return records.map(deserializeProject);
};

export const getProject = async (
  env: Env,
  projectId: string,
): Promise<import("../types").Project | null> => {
  const db = getDrizzle(env);
  const record = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.projectId, projectId))
    .limit(1)
    .get();
  return record ? deserializeProject(record) : null;
};

export const updateProject = async (
  env: Env,
  projectId: string,
  input: {
    name?: string;
    description?: string | null;
    githubRepo?: string | null;
    githubOwner?: string | null;
    githubBranch?: string | null;
  },
): Promise<import("../types").Project | null> => {
  const db = getDrizzle(env);
  const now = nowPST();
  const updates: any = { updatedAt: now };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.githubRepo !== undefined) updates.githubRepo = input.githubRepo;
  if (input.githubOwner !== undefined) updates.githubOwner = input.githubOwner;
  if (input.githubBranch !== undefined) updates.githubBranch = input.githubBranch;

  await db
    .update(projectsTable)
    .set(updates)
    .where(eq(projectsTable.projectId, projectId));

  return getProject(env, projectId);
};

export const deleteProject = async (
  env: Env,
  projectId: string,
): Promise<boolean> => {
  const db = getDrizzle(env);
  const result = await db
    .delete(projectsTable)
    .where(eq(projectsTable.projectId, projectId));
  return (result as any).meta?.changes > 0;
};

// ============================================================================
// Chat Rooms Database Functions
// ============================================================================

export const createChatRoom = async (
  env: Env,
  input: {
    id: string;
    projectId: string;
    name: string;
    description?: string | null;
  },
): Promise<import("../types").ChatRoom> => {
  const db = getDrizzle(env);
  const now = nowPST();
  await db.insert(chatRoomsTable).values({
    id: input.id,
    projectId: input.projectId,
    name: input.name,
    description: input.description,
    createdAt: now,
    updatedAt: now,
  });

  const record = await db
    .select()
    .from(chatRoomsTable)
    .where(eq(chatRoomsTable.id, input.id))
    .limit(1)
    .get();

  if (!record) {
    throw new Error("Failed to create chat room");
  }
  return deserializeChatRoom(record);
};

export const listChatRooms = async (
  env: Env,
  projectId: string,
): Promise<import("../types").ChatRoom[]> => {
  const db = getDrizzle(env);
  const records = await db
    .select()
    .from(chatRoomsTable)
    .where(eq(chatRoomsTable.projectId, projectId))
    .all();
  return records.map(deserializeChatRoom);
};

// ============================================================================
// Chat Threads Database Functions
// ============================================================================

export const createChatThread = async (
  env: Env,
  input: {
    id: string;
    chatRoomId: string;
    subject: string;
    createdBy: string;
  },
): Promise<import("../types").ChatThread> => {
  const db = getDrizzle(env);
  const now = nowPST();
  await db.insert(chatThreadsTable).values({
    id: input.id,
    chatRoomId: input.chatRoomId,
    subject: input.subject,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });

  const record = await db
    .select()
    .from(chatThreadsTable)
    .where(eq(chatThreadsTable.id, input.id))
    .limit(1)
    .get();

  if (!record) {
    throw new Error("Failed to create chat thread");
  }
  return deserializeChatThread(record);
};

export const listChatThreads = async (
  env: Env,
  chatRoomId: string,
): Promise<import("../types").ChatThread[]> => {
  const db = getDrizzle(env);
  const records = await db
    .select()
    .from(chatThreadsTable)
    .where(eq(chatThreadsTable.chatRoomId, chatRoomId))
    .all();
  return records.map(deserializeChatThread);
};

// ============================================================================
// Chat Messages Database Functions
// ============================================================================

export const createChatMessage = async (
  env: Env,
  input: {
    id: string;
    threadId: string;
    senderType: "user" | "ai" | "system";
    senderName: string;
    senderId?: string | null;
    content: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<import("../types").ChatMessage> => {
  const db = getDrizzle(env);
  const now = nowPST();
  await db.insert(chatMessagesTable).values({
    id: input.id,
    threadId: input.threadId,
    senderType: input.senderType,
    senderName: input.senderName,
    senderId: input.senderId,
    content: input.content,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: now,
    updatedAt: now,
  });

  const record = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.id, input.id))
    .limit(1)
    .get();

  if (!record) {
    throw new Error("Failed to create chat message");
  }
  return deserializeChatMessage(record);
};

export const listChatMessages = async (
  env: Env,
  threadId: string,
): Promise<import("../types").ChatMessage[]> => {
  const db = getDrizzle(env);
  const records = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.threadId, threadId))
    .all();
  return records.map(deserializeChatMessage);
};

export type { Database };
