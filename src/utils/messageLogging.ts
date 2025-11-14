import { and, asc, desc, eq } from "drizzle-orm";
import { getDrizzle } from "./db";
import { messageLogsTable, threadsTable } from "./db";
import type { Env } from "../types";
import type {
  LogMessageInput,
  MessageLog,
  MessageSearchFilters,
  MessageSearchResults,
  Thread,
  MessageType,
  SenderType
} from "../types";

/**
 * Logs a message to the database.
 */
export async function logMessage(
  env: Env,
  input: LogMessageInput
): Promise<string> {
  const db = getDrizzle(env);
  const messageId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await db.insert(messageLogsTable).values({
    messageId,
    projectId: input.projectId,
    threadId: input.threadId || null,
    replyToMessageId: input.replyToMessageId || null,
    messageType: input.messageType,
    senderType: input.senderType,
    senderName: input.senderName,
    senderId: input.senderId || null,
    epicId: input.epicId || null,
    taskId: input.taskId || null,
    content: input.content,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    timestamp,
    createdAt: timestamp,
  });

  if (input.threadId) {
    await updateThreadActivity(env, input.projectId, input.threadId);
  }

  return messageId;
}

/**
 * Searches message logs based on filters.
 */
export async function searchMessages(
  env: Env,
  filters: MessageSearchFilters
): Promise<MessageSearchResults> {
  // For simplicity, let's use a basic query approach
  let whereClause = "project_id = ?";
  let params: any[] = [filters.projectId];

  if (filters.threadId) {
    whereClause += " AND thread_id = ?";
    params.push(filters.threadId);
  }

  if (filters.epicId) {
    whereClause += " AND epic_id = ?";
    params.push(filters.epicId);
  }

  if (filters.taskId) {
    whereClause += " AND task_id = ?";
    params.push(filters.taskId);
  }

  if (filters.senderName) {
    whereClause += " AND sender_name LIKE ?";
    params.push(`%${filters.senderName}%`);
  }

  if (filters.senderType) {
    whereClause += " AND sender_type = ?";
    params.push(filters.senderType);
  }

  if (filters.messageType) {
    whereClause += " AND message_type = ?";
    params.push(filters.messageType);
  }

  if (filters.content) {
    whereClause += " AND content LIKE ?";
    params.push(`%${filters.content}%`);
  }

  if (filters.fromDate) {
    whereClause += " AND timestamp >= ?";
    params.push(filters.fromDate);
  }

  if (filters.toDate) {
    whereClause += " AND timestamp <= ?";
    params.push(filters.toDate);
  }

  // Get total count
  const countQuery = `SELECT COUNT(*) as count FROM message_logs WHERE ${whereClause}`;
  const countResult = await env.DB.prepare(countQuery).bind(...params).first();
  const total = countResult?.count || 0;

  // Get messages with pagination
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  const messagesQuery = `
    SELECT * FROM message_logs
    WHERE ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `;
  const messagesResult = await env.DB.prepare(messagesQuery).bind(...params, limit, offset).all();

  return {
    messages: (messagesResult.results || []).map(deserializeMessageLog),
    total: Number(total),
    hasMore: offset + limit < Number(total),
  };
}

/**
 * Creates a new thread.
 */
export async function createThread(
  env: Env,
  projectId: string,
  subject: string,
  createdBy: string
): Promise<string> {
  const db = getDrizzle(env);
  const threadId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await db.insert(threadsTable).values({
    projectId,
    threadId,
    subject,
    createdBy,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return threadId;
}

/**
 * Gets all threads for a project/room.
 */
export async function getThreads(env: Env, projectId: string): Promise<Thread[]> {
  const db = getDrizzle(env);

  const threads = await db
    .select()
    .from(threadsTable)
    .where(eq(threadsTable.projectId, projectId))
    .orderBy(desc(threadsTable.updatedAt));

  return threads.map(deserializeThread);
}

/**
 * Gets a specific thread by ID.
 */
export async function getThread(env: Env, projectId: string, threadId: string): Promise<Thread | null> {
  const db = getDrizzle(env);

  const thread = await db
    .select()
    .from(threadsTable)
    .where(and(eq(threadsTable.projectId, projectId), eq(threadsTable.threadId, threadId)))
    .limit(1);

  return thread.length > 0 ? deserializeThread(thread[0]) : null;
}

/**
 * Updates a thread's last activity timestamp.
 */
export async function updateThreadActivity(env: Env, projectId: string, threadId: string): Promise<void> {
  const db = getDrizzle(env);

  await db
    .update(threadsTable)
    .set({ updatedAt: new Date().toISOString() })
    .where(and(eq(threadsTable.projectId, projectId), eq(threadsTable.threadId, threadId)));
}

/**
 * Gets messages in a specific thread.
 */
export async function getThreadMessages(
  env: Env,
  projectId: string,
  threadId: string,
  limit = 100,
  offset = 0,
): Promise<MessageLog[]> {
  const db = getDrizzle(env);

  const messages = await db
    .select()
    .from(messageLogsTable)
    .where(
      and(
        eq(messageLogsTable.projectId, projectId),
        eq(messageLogsTable.threadId, threadId),
      ),
    )
    .orderBy(asc(messageLogsTable.timestamp))
    .limit(limit)
    .offset(offset);

  return messages.map(deserializeMessageLog);
}

/**
 * Gets recent messages for a room.
 */
export async function getRecentMessages(
  env: Env,
  projectId: string,
  limit = 50,
): Promise<MessageLog[]> {
  const db = getDrizzle(env);

  const messages = await db
    .select()
    .from(messageLogsTable)
    .where(eq(messageLogsTable.projectId, projectId))
    .orderBy(desc(messageLogsTable.timestamp))
    .limit(limit);

  return messages.map(deserializeMessageLog).reverse();
}

/**
 * Creates a new thread ID for message threading.
 */
export function createThreadId(): string {
  return crypto.randomUUID();
}

/**
 * Deserializes a thread from the database format.
 */
function deserializeThread(row: any): Thread {
  return {
    id: row.id,
    projectId: row.projectId,
    threadId: row.threadId,
    subject: row.subject,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Deserializes a message log from the database format.
 */
function deserializeMessageLog(row: any): MessageLog {
  return {
    id: row.id,
    messageId: row.messageId,
    projectId: row.projectId,
    threadId: row.threadId,
    replyToMessageId: row.replyToMessageId,
    messageType: row.messageType as MessageType,
    senderType: row.senderType as SenderType,
    senderName: row.senderName,
    senderId: row.senderId,
    epicId: row.epicId,
    taskId: row.taskId,
    content: row.content,
    metadata: row.metadata,
    timestamp: row.timestamp,
    createdAt: row.createdAt,
  };
}
