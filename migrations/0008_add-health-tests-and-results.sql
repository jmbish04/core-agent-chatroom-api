-- Migration to add health_tests, health_test_results, self_healing_attempts, and self_healing_steps tables

-- health_tests table (aligned with test_defs but with additional fields)
CREATE TABLE IF NOT EXISTS health_tests (
  id TEXT PRIMARY KEY,
  test_key TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'internal',
  endpoint_path TEXT NOT NULL,
  http_method TEXT NOT NULL DEFAULT 'GET',
  category TEXT NOT NULL,
  description TEXT,
  executor_key TEXT NOT NULL DEFAULT 'http',
  error_meanings_json TEXT,
  error_solutions_json TEXT,
  metadata TEXT,
  request_body TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS health_tests_test_key_unique ON health_tests(test_key);
CREATE INDEX IF NOT EXISTS health_tests_scope_idx ON health_tests(scope);
CREATE INDEX IF NOT EXISTS health_tests_executor_key_idx ON health_tests(executor_key);

-- health_test_results table
CREATE TABLE IF NOT EXISTS health_test_results (
  id TEXT PRIMARY KEY,
  health_test_id TEXT NOT NULL,
  run_group_id TEXT NOT NULL,
  status INTEGER NOT NULL,
  status_text TEXT NOT NULL,
  response_time_ms INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  error_message TEXT,
  response_body TEXT,
  run_at TEXT NOT NULL,
  endpoint TEXT,
  overall_status TEXT,
  FOREIGN KEY (health_test_id) REFERENCES health_tests(id)
);

CREATE INDEX IF NOT EXISTS health_test_results_health_test_id_idx ON health_test_results(health_test_id);
CREATE INDEX IF NOT EXISTS health_test_results_run_group_id_idx ON health_test_results(run_group_id);
CREATE INDEX IF NOT EXISTS health_test_results_run_at_idx ON health_test_results(run_at);

-- self_healing_attempts table
-- AI analyzes errors and attempts to come up with fixes
-- If no fix is possible and human is needed, AI provides instructions for the human
CREATE TABLE IF NOT EXISTS self_healing_attempts (
  id TEXT PRIMARY KEY,
  health_check_group_id TEXT NOT NULL,
  health_test_result_id TEXT,
  health_test_id TEXT,
  ai_analysis TEXT NOT NULL,
  ai_recommendation TEXT NOT NULL,
  healing_action TEXT NOT NULL,
  action_details TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  verification_result TEXT,
  effectiveness_analysis TEXT,
  manual_steps_required TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS self_healing_attempts_health_check_group_id_idx ON self_healing_attempts(health_check_group_id);
CREATE INDEX IF NOT EXISTS self_healing_attempts_health_test_result_id_idx ON self_healing_attempts(health_test_result_id);
CREATE INDEX IF NOT EXISTS self_healing_attempts_health_test_id_idx ON self_healing_attempts(health_test_id);
CREATE INDEX IF NOT EXISTS self_healing_attempts_status_idx ON self_healing_attempts(status);

-- self_healing_steps table
CREATE TABLE IF NOT EXISTS self_healing_steps (
  id TEXT PRIMARY KEY,
  healing_attempt_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  ai_thoughts TEXT,
  decision TEXT,
  status TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (healing_attempt_id) REFERENCES self_healing_attempts(id)
);

CREATE INDEX IF NOT EXISTS self_healing_steps_healing_attempt_id_idx ON self_healing_steps(healing_attempt_id);
CREATE INDEX IF NOT EXISTS self_healing_steps_step_number_idx ON self_healing_steps(step_number);

