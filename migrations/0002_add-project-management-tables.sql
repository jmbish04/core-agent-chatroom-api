-- Migration to add room_id columns and additional fields to existing tables
-- All core tables are now created in 0001_init.sql, this migration adds extensions

-- Add room_id column to epics table if it doesn't exist
ALTER TABLE epics ADD COLUMN room_id TEXT DEFAULT 'default';
UPDATE epics SET room_id = 'default' WHERE room_id IS NULL;

-- Add room_id to task_dependencies if it doesn't exist
ALTER TABLE task_dependencies ADD COLUMN room_id TEXT DEFAULT 'default';
UPDATE task_dependencies SET room_id = 'default' WHERE room_id IS NULL;

-- Add room_id to task_blockers if it doesn't exist
ALTER TABLE task_blockers ADD COLUMN room_id TEXT DEFAULT 'default';
UPDATE task_blockers SET room_id = 'default' WHERE room_id IS NULL;

-- Add room_id and id columns to agent_status if they don't exist
ALTER TABLE agent_status ADD COLUMN room_id TEXT DEFAULT 'default';
UPDATE agent_status SET room_id = 'default' WHERE room_id IS NULL;
ALTER TABLE agent_status ADD COLUMN id TEXT;
-- Generate IDs for existing rows
UPDATE agent_status SET id = agent_name WHERE id IS NULL;
-- Create unique index for room_id + agent_name combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_status_room_agent ON agent_status(room_id, agent_name);

-- Add missing columns to tasks table (parent_task_id, etc.)
-- The tasks table in 0001 was created with a simple schema, we need to add the extended columns
-- Note: epic_id already exists from 0001, so we skip it
ALTER TABLE tasks ADD COLUMN room_id TEXT DEFAULT 'default';
UPDATE tasks SET room_id = 'default' WHERE room_id IS NULL;
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT;
ALTER TABLE tasks ADD COLUMN estimated_hours REAL;
ALTER TABLE tasks ADD COLUMN actual_hours REAL;
ALTER TABLE tasks ADD COLUMN requires_human_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN human_review_reason TEXT;
ALTER TABLE tasks ADD COLUMN human_review_response TEXT;

-- Create indexes for room_id columns
CREATE INDEX IF NOT EXISTS idx_epics_room ON epics(room_id);
CREATE INDEX IF NOT EXISTS idx_tasks_room ON tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_room ON task_dependencies(room_id);
CREATE INDEX IF NOT EXISTS idx_blockers_room ON task_blockers(room_id);
CREATE INDEX IF NOT EXISTS idx_agent_status_room ON agent_status(room_id);

-- Additional indexes that may not exist yet
CREATE INDEX IF NOT EXISTS idx_epics_status ON epics(status);
CREATE INDEX IF NOT EXISTS idx_epics_assigned_agent ON epics(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_epics_priority ON epics(priority);

CREATE INDEX IF NOT EXISTS idx_tasks_epic ON tasks(epic_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_human_review ON tasks(requires_human_review);

CREATE INDEX IF NOT EXISTS idx_dependencies_dependent ON task_dependencies(dependent_task_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_dependency ON task_dependencies(dependency_task_id);

CREATE INDEX IF NOT EXISTS idx_blockers_task ON task_blockers(task_id);
CREATE INDEX IF NOT EXISTS idx_blockers_agent ON task_blockers(blocked_agent);
CREATE INDEX IF NOT EXISTS idx_blockers_severity ON task_blockers(severity);
CREATE INDEX IF NOT EXISTS idx_blockers_human ON task_blockers(requires_human_intervention);

CREATE INDEX IF NOT EXISTS idx_agent_status_status ON agent_status(status);
CREATE INDEX IF NOT EXISTS idx_agent_status_task ON agent_status(current_task_id);
CREATE INDEX IF NOT EXISTS idx_agent_status_attention ON agent_status(requires_attention);
