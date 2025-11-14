/**
 * @file This module is the central business logic layer for task management.
 *
 * @description
 * This file acts as a "service layer" or "orchestrator" for all task-related
 * operations. It sits between the API/router (`router.ts`) and the low-level
 * database access functions (`db.ts`).
 *
 * Its core responsibilities are:
 * 1.  **Read Operations**: Fetching data from the DB (`listTasks`, `getTaskById`)
 * and normalizing it from a `TaskSummary` (DB model) into a `Task`
 * (API model) using `toApiTask`.
 * 2.  **Write Operations**: Persisting changes to the DB (e.g., `createTaskInDb`,
 * `bulkUpdateTaskStatuses`).
 * 3.  **Real-time Notifications**: After every write operation, it builds a
 * WebSocket frame and calls `notifyTaskSubscribers` to broadcast the
 * state change to all agents connected to the `RoomDO`.
 *
 * This "write-through" pattern ensures that any part of the system (e.g., a
 * REST API call or an RPC call) that modifies a task automatically triggers a
 * real-time update for all subscribed agents.
 *
 * @module tasks
 */

import {
  // Low-level database functions
  bulkReassignTasks,
  bulkUpdateTaskStatuses,
  createTask as createTaskInDb,
  getTaskById,
  listOpenTasks,
  listTasks,
  upsertAgentActivity,
  listAgentActivity,
  insertTaskBlock,
  resolveTaskBlock,
  ackTaskBlock,
  listBlockedTasks,
  getTaskCounts,
} from "./db";
import { buildFrame } from "./ws";
import type {
  // Core types
  AgentActivity,
  AgentCheckInInput,
  CreateTaskInput,
  Env,
  TaskBlockInput,
  TaskBlocker,
  TaskFilterOptions,
  TaskStatsSnapshot,
  TaskStatus,
  TaskStatusUpdateInput,
  TaskSummary,
  TaskUnblockInput,
  WsMessage,
} from "../types";
import type {
  // API Schema types
  BulkReassignResponse,
  BulkStatusUpdateResponse,
  Task,
  TaskLookupByAgentResponse,
  TaskSearchResponse,
} from "../schemas/apiSchemas";

/**
 * @description The default Durable Object room ID to notify for task changes.
 */
const DEFAULT_TASK_ROOM = "tasks";

// --- Private Helpers ---

/**
 * Normalizes a database `TaskSummary` object into an API-facing `Task` object.
 * This acts as a mapping layer between the database schema and the public
 * API contract.
 *
 * @param {TaskSummary} task - The task object from the `db.ts` layer.
 * @returns {Task} A task object matching the API schema.
 * @private
 */
const toApiTask = (task: TaskSummary): Task => ({
  id: task.id,
  projectId: task.projectId,
  epicId: task.epicId ?? null,
  parentTaskId: task.parentTaskId ?? null,
  title: task.title,
  description: task.description,
  status: task.status,
  priority: task.priority,
  assignedAgent: task.assignedAgent,
  estimatedHours: task.estimatedHours ?? null,
  actualHours: task.actualHours ?? null,
  requiresHumanReview: task.requiresHumanReview ?? false,
  humanReviewReason: task.humanReviewReason ?? null,
  humanReviewResponse: task.humanReviewResponse ?? null,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

/**
 * Helper to wrap an array of `TaskSummary` objects into a `BulkStatusUpdateResponse`
 * envelope, normalizing each task in the process.
 *
 * @param {TaskSummary[]} tasks - An array of task summaries from the DB.
 * @returns {BulkStatusUpdateResponse} An API-response object.
 * @private
 */
const toBulkResponse = (tasks: TaskSummary[]): BulkStatusUpdateResponse => ({
  tasks: tasks.map(toApiTask),
});

/**
 * 📡 Forwards a WebSocket message to the central `RoomDO` for broadcasting.
 *
 * This function finds the `RoomDO` by its name (room ID), then makes an
 * HTTP request to its `/broadcast` endpoint. The DO will then send the
 * message to all connected WebSocket clients.
 *
 * This is a "fire-and-forget" operation. It logs a warning on failure
 * but does not throw an error, allowing the original API request to succeed
 * even if the broadcast fails.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {WsMessage} message - The WebSocket message frame to broadcast.
 * @param {string} [roomId=DEFAULT_TASK_ROOM] - The name of the DO room to notify.
 */
export const notifyTaskSubscribers = async (
  env: Env,
  message: WsMessage,
  roomId: string = DEFAULT_TASK_ROOM,
) => {
  try {
    const id = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(id);
    // Make an internal HTTP request to the DO's broadcast endpoint
    await stub.fetch(`https://do/${roomId}/broadcast`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch (error) {
    console.warn("Failed to notify room subscribers", error);
  }
};

// --- Read Operations (Queries) ---

/**
 * Fetches a list of tasks based on filters and normalizes them for the API.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {TaskFilterOptions} [filters={}] - Optional filters (agent, status, etc.).
 * @returns {Promise<Task[]>} A promise that resolves to an array of API-tasks.
 */
export const queryTasks = async (
  env: Env,
  filters: TaskFilterOptions = {},
): Promise<Task[]> => {
  const results = await listTasks(env, filters);
  return results.map(toApiTask);
};

/**
 * Fetches all tasks for a specific agent and formats the response.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {string} agent - The name of the agent to filter by.
 * @returns {Promise<TaskLookupByAgentResponse>} The API response object.
 */
export const queryTasksByAgent = async (
  env: Env,
  agent: string,
): Promise<TaskLookupByAgentResponse> => {
  const tasks = await listTasks(env, { agent });
  return {
    agent,
    tasks: tasks.map(toApiTask),
  };
};

/**
 * Performs a full-text search for tasks and formats the response.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {string} query - The search query.
 * @returns {Promise<TaskSearchResponse>} The API response object.
 */
export const searchTasksByQuery = async (
  env: Env,
  query: string,
): Promise<TaskSearchResponse> => {
  // For now, return all tasks as search results
  const tasks = await queryTasks(env, {});
  return {
    query,
    tasks,
  };
};

/**
 * Fetches all open (pending, in_progress) tasks and normalizes them.
 *
 * @param {Env} env - The worker environment bindings.
 * @returns {Promise<Task[]>} A promise that resolves to an array of open API-tasks.
 */
export const queryOpenTasks = async (env: Env): Promise<Task[]> => {
  const tasks = await listOpenTasks(env);
  return tasks.map(toApiTask);
};

/**
 * Fetches a single task by its ID and normalizes it.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {string} id - The UUID of the task to fetch.
 * @returns {Promise<Task | null>} The normalized API-task or null if not found.
 */
export const getTask = async (env: Env, id: string): Promise<Task | null> => {
  const task = await getTaskById(env, id);
  return task ? toApiTask(task) : null;
};

// --- Write Operations (Orchestration & Notification) ---

/**
 * 📝 Reassigns one or more tasks to a new agent.
 *
 * This function orchestrates the operation:
 * 1.  Calls `bulkReassignTasks` in the DB.
 * 2.  Builds a `tasks.reassigned` WebSocket frame.
 * 3.  Notifies all subscribers via `notifyTaskSubscribers`.
 * 4.  Returns the normalized API response.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {string[]} taskIds - An array of task UUIDs to reassign.
 * @param {string} agent - The name of the new agent.
 * @returns {Promise<BulkReassignResponse>} The API response with updated tasks.
 */
export const reassignTasks = async (
  env: Env,
  taskIds: string[],
  agent: string,
): Promise<BulkReassignResponse> => {
  // 1. Update DB
  const tasks = await bulkReassignTasks(env, taskIds, agent);
  const payload: BulkReassignResponse = {
    tasks: tasks.map(toApiTask),
  };

  // 2. Notify subscribers
  await notifyTaskSubscribers(
    env,
    buildFrame("tasks.reassigned", payload, {
      taskIds,
      agent,
    }),
  );

  // 3. Return API response
  return payload;
};

/**
 * 📝 Updates the status for one or more tasks in bulk.
 *
 * This function orchestrates the operation:
 * 1.  Calls `bulkUpdateTaskStatuses` in the DB.
 * 2.  Builds a `tasks.statusUpdated` WebSocket frame.
 * 3.  Notifies all subscribers via `notifyTaskSubscribers`.
 * 4.  Returns the normalized API response.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {TaskStatusUpdateInput[]} updates - An array of {taskId, status} objects.
 * @returns {Promise<BulkStatusUpdateResponse>} The API response with updated tasks.
 */
export const updateTasksStatus = async (
  env: Env,
  updates: TaskStatusUpdateInput[],
): Promise<BulkStatusUpdateResponse> => {
  // 1. Update DB
  const tasks = await bulkUpdateTaskStatuses(env, updates);
  const response = toBulkResponse(tasks);

  // 2. Notify subscribers
  await notifyTaskSubscribers(
    env,
    buildFrame("tasks.statusUpdated", response, {
      updates,
    }),
  );

  // 3. Return API response
  return response;
};

/**
 * 📝 A convenience wrapper for `updateTasksStatus` to update a single task.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {string} taskId - The UUID of the task to update.
 * @param {TaskStatus} status - The new status.
 * @returns {Promise<Task | null>} The updated API-task or null if not found.
 */
export const updateSingleTaskStatus = async (
  env: Env,
  taskId: string,
  status: TaskStatus,
): Promise<Task | null> => {
  const updates: TaskStatusUpdateInput[] = [{ taskId, status }];
  // This re-uses the bulk update logic, which includes notification
  const { tasks } = await updateTasksStatus(env, updates);
  return tasks[0] ?? null;
};

/**
 * 📝 Creates a new task in the database.
 *
 * This function orchestrates the operation:
 * 1.  Calls `createTaskInDb` in the DB.
 * 2.  Builds a `tasks.created` WebSocket frame.
 * 3.  Notifies all subscribers via `notifyTaskSubscribers`.
 * 4.  Returns the normalized API-task.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {CreateTaskInput} input - The new task data.
 * @returns {Promise<Task>} The created and normalized API-task.
 */
export const createTask = async (env: Env, input: CreateTaskInput): Promise<Task> => {
  // 1. Create in DB
  const task = await createTaskInDb(env, input);
  const apiTask = toApiTask(task);

  // 2. Notify subscribers
  await notifyTaskSubscribers(
    env,
    buildFrame("tasks.created", { task: apiTask }),
  );

  // 3. Return API response
  return apiTask;
};

/**
 * 📡 A private helper to fetch the current blocked list and broadcast it.
 * This is called after any operation that might change the blocked state.
 *
 * @param {Env} env - The worker environment bindings.
 * @private
 */
const broadcastBlockedSummary = async (env: Env) => {
  const blocked = await listBlockedTasks(env);
  await notifyTaskSubscribers(
    env,
    buildFrame("tasks.blockedSummary", { blocked }),
  );
};

/**
 * 📊 Gathers a complete snapshot of task statistics.
 *
 * Runs three database queries in parallel to get aggregate counts,
 * latest agent activity, and the current list of un-acknowledged
 * blocked tasks.
 *
 * @param {Env} env - The worker environment bindings.
 * @returns {Promise<TaskStatsSnapshot>} The complete stats snapshot.
 */
export const getTaskStats = async (env: Env): Promise<TaskStatsSnapshot> => {
  const [counts, agentActivity, blocked] = await Promise.all([
    getTaskCounts(env),
    listAgentActivity(env),
    listBlockedTasks(env, { includeAcked: false }),
  ]);
  return { counts, agentActivity, blocked };
};

/**
 * 📝 Upserts an agent's current activity/status.
 *
 * This function orchestrates the operation:
 * 1.  Calls `upsertAgentActivity` in the DB.
 * 2.  Builds an `agents.activity` WebSocket frame.
 * 3.  Notifies all subscribers via `notifyTaskSubscribers`.
 * 4.  Returns the updated activity record.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {AgentCheckInInput} input - The agent's status report.
 * @returns {Promise<AgentActivity>} The upserted agent activity record.
 */
export const checkInAgent = async (
  env: Env,
  input: AgentCheckInInput,
): Promise<AgentActivity> => {
  // 1. Update DB
  const activity = await upsertAgentActivity(env, input);

  // 2. Notify subscribers
  await notifyTaskSubscribers(
    env,
    buildFrame("agents.activity", { activity }),
  );

  // 3. Return API response
  return activity;
};

/**
 * 📝 Marks a task as blocked.
 *
 * This function orchestrates multiple state changes:
 * 1.  Inserts the `TaskBlocker` record in the DB.
 * 2.  **Side Effect**: Updates the blocked agent's status to "blocked".
 * 3.  **Side Effect**: Notifies subscribers of the `tasks.blocked` event.
 * 4.  **Side Effect**: Broadcasts the *new* blocked summary to all.
 * 5.  Returns the created blocker.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {TaskBlockInput} input - The details of the block.
 * @returns {Promise<TaskBlocker>} The created blocker record.
 */
export const blockTask = async (
  env: Env,
  input: TaskBlockInput,
): Promise<TaskBlocker> => {
  // 1. Create blocker in DB
  const blocker = await insertTaskBlock(env, input);

  // 2. Update agent status
  await upsertAgentActivity(env, {
    agentName: input.blockedAgent,
    status: "blocked",
    taskId: input.taskId,
    note: input.reason,
  });

  // 3. Notify of the specific "blocked" event
  await notifyTaskSubscribers(
    env,
    buildFrame(
      "tasks.blocked",
      { blocker },
      { blockedAgent: blocker.blockedAgent, taskId: blocker.taskId },
    ),
  );

  // 4. Broadcast the new global list of blocked tasks
  await broadcastBlockedSummary(env);
  return blocker;
};

/**
 * 📝 Resolves a task blocker.
 *
 * This function orchestrates the coordination pattern:
 * 1.  Updates the blocker record in the DB (sets `resolved_at`).
 * 2.  **Side Effect**: Updates the agent's status back to "in_progress".
 * 3.  **Side Effect**: Notifies subscribers of the `tasks.unblocked` event.
 * This message includes `notifyAgent` in its metadata, which the
 * `RoomDO` will use to start the acknowledgment-ping timer.
 * 4.  **Side Effect**: Broadcasts the new (smaller) blocked summary.
 * 5.  Returns the resolved blocker.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {TaskUnblockInput} input - The details of the resolution.
 * @returns {Promise<TaskBlocker | null>} The resolved blocker or null if not found.
 */
export const unblockTask = async (
  env: Env,
  input: TaskUnblockInput,
): Promise<TaskBlocker | null> => {
  // 1. Update DB
  const blocker = await resolveTaskBlock(env, input);
  if (!blocker) {
    return null;
  }

  // 1.5. Update task status back to todo
  await updateSingleTaskStatus(env, input.taskId, "todo");

  // 2. Update agent status
  await upsertAgentActivity(env, {
    agentName: input.blockedAgent,
    status: "available", // Set agent back to available
    taskId: input.taskId,
    note: input.note,
  });

  // 3. Notify of the "unblocked" event
  await notifyTaskSubscribers(
    env,
    buildFrame(
      "tasks.unblocked",
      { blocker },
      {
        notifyAgent: blocker.blockedAgent, // For `RoomDO` to start the ack ping
        taskId: blocker.taskId,
        resolvedBy: input.resolvedBy,
      },
    ),
  );

  // 4. Broadcast the new global list of blocked tasks
  await broadcastBlockedSummary(env);
  return blocker;
};

/**
 * 📝 Acknowledges that an agent has seen and accepted an unblocked task.
 *
 * This is the final step in the unblock coordination pattern.
 * 1.  Updates the blocker record in the DB (sets `acked` = true).
 * 2.  **Side Effect**: Notifies subscribers of the `agents.unblockAck` event.
 * The `RoomDO` will see this and stop the "nag" timer for this agent/task.
 * 3.  **Side Effect**: Broadcasts the blocked summary (which won't change,
 * but confirms state).
 * 4.  Returns the acknowledged blocker.
 *
 * @param {Env} env - The worker environment bindings.
 * @param {string} taskId - The UUID of the task.
 * @param {string} agentName - The name of the agent acknowledging the task.
 * @returns {Promise<TaskBlocker | null>} The acknowledged blocker or null.
 */
export const acknowledgeUnblock = async (
  env: Env,
  taskId: string,
  agentName: string,
): Promise<TaskBlocker | null> => {
  // 1. Update DB
  const blocker = await ackTaskBlock(env, taskId, agentName);

  if (blocker) {
    // 2. Notify subscribers (so `RoomDO` can stop the timer)
    await notifyTaskSubscribers(
      env,
      buildFrame("agents.unblockAck", { blocker }),
    );
    // 3. Broadcast summary
    await broadcastBlockedSummary(env);
  }
  return blocker;
};
