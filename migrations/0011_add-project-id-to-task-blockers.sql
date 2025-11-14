-- Migration to add project_id column to task_blockers table
ALTER TABLE task_blockers ADD COLUMN project_id TEXT;

