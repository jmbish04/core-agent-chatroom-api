-- Migration to add sessions and actions_log tables

-- sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  request_type TEXT NOT NULL,
  request_method TEXT,
  request_path TEXT,
  request_headers TEXT,
  request_body TEXT,
  user_agent TEXT,
  client_ip TEXT,
  account_id TEXT,
  user_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  status_code INTEGER,
  response_size INTEGER,
  error_message TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sessions_session_id_idx ON sessions(session_id);
CREATE INDEX IF NOT EXISTS sessions_request_type_idx ON sessions(request_type);
CREATE INDEX IF NOT EXISTS sessions_started_at_idx ON sessions(started_at);
CREATE INDEX IF NOT EXISTS sessions_account_id_idx ON sessions(account_id);

-- actions_log table
-- All actions in the app should be logged: websocket messages, pings, tasks, projects, AI agent actions, etc.
CREATE TABLE IF NOT EXISTS actions_log (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_name TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  duration_ms INTEGER,
  status TEXT NOT NULL,
  input_data TEXT,
  output_data TEXT,
  error_message TEXT,
  metadata TEXT,
  sequence_number INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS actions_log_session_id_idx ON actions_log(session_id);
CREATE INDEX IF NOT EXISTS actions_log_action_type_idx ON actions_log(action_type);
CREATE INDEX IF NOT EXISTS actions_log_timestamp_idx ON actions_log(timestamp);
CREATE INDEX IF NOT EXISTS actions_log_sequence_number_idx ON actions_log(sequence_number);

