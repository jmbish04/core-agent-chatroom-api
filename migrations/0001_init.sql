CREATE TABLE IF NOT EXISTS test_defs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  severity TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  error_map TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS test_results (
  id TEXT PRIMARY KEY,
  session_uuid TEXT NOT NULL,
  test_fk TEXT NOT NULL REFERENCES test_defs(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('pass','fail')),
  error_code TEXT,
  raw TEXT,
  ai_human_readable_error_description TEXT,
  ai_prompt_to_fix_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_results_session ON test_results(session_uuid);
CREATE INDEX IF NOT EXISTS idx_results_testfk ON test_results(test_fk);
CREATE INDEX IF NOT EXISTS idx_results_finished ON test_results(finished_at);

CREATE TABLE IF NOT EXISTS agent_activity (
  agent_name TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('available','in_progress','blocked','done')),
  task_id TEXT,
  note TEXT,
  last_check_in TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS epics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('planning','active','completed','cancelled')),
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  assigned_agent TEXT,
  target_completion TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','backlog','todo','in_progress','review','blocked','done','cancelled','on_hold')),
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  assigned_agent TEXT,
  project_id TEXT,
  epic_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE SET NULL
);

-- Task dependencies table
CREATE TABLE IF NOT EXISTS task_dependencies (
  id TEXT PRIMARY KEY,
  dependent_task_id TEXT NOT NULL REFERENCES tasks(id),
  dependency_task_id TEXT NOT NULL REFERENCES tasks(id),
  dependency_type TEXT NOT NULL CHECK (dependency_type IN ('blocks','requires','suggests')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(dependent_task_id, dependency_task_id)
);

-- Task blockers table
CREATE TABLE IF NOT EXISTS task_blockers (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  blocked_agent TEXT NOT NULL,
  blocking_owner TEXT,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  requires_human_intervention INTEGER NOT NULL DEFAULT 0,
  human_intervention_reason TEXT,
  resolved_at TEXT,
  resolved_by TEXT,
  resolution_note TEXT,
  acked INTEGER NOT NULL DEFAULT 0,
  last_notified TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(task_id, blocked_agent)
);

-- Agent status table
CREATE TABLE IF NOT EXISTS agent_status (
  agent_name TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('offline','available','busy','blocked','awaiting_human','error')),
  current_task_id TEXT REFERENCES tasks(id),
  last_activity TEXT NOT NULL,
  status_message TEXT,
  requires_attention INTEGER NOT NULL DEFAULT 0,
  attention_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Basic indexes for the tables we created
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

CREATE INDEX IF NOT EXISTS idx_dependencies_dependent ON task_dependencies(dependent_task_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_dependency ON task_dependencies(dependency_task_id);

CREATE INDEX IF NOT EXISTS idx_blockers_task ON task_blockers(task_id);
CREATE INDEX IF NOT EXISTS idx_blockers_agent ON task_blockers(blocked_agent);
CREATE INDEX IF NOT EXISTS idx_blockers_severity ON task_blockers(severity);
CREATE INDEX IF NOT EXISTS idx_blockers_human ON task_blockers(requires_human_intervention);

CREATE INDEX IF NOT EXISTS idx_agent_status_status ON agent_status(status);
CREATE INDEX IF NOT EXISTS idx_agent_status_task ON agent_status(current_task_id);
CREATE INDEX IF NOT EXISTS idx_agent_status_attention ON agent_status(requires_attention);

-- projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_agent TEXT,
  target_completion TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- epics
CREATE TABLE IF NOT EXISTS epics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  priority TEXT NOT NULL DEFAULT 'medium',
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- threads (for project chat)
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  author TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- thread_messages
CREATE TABLE IF NOT EXISTS thread_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  parent_id TEXT,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES thread_messages(id) ON DELETE CASCADE
);
