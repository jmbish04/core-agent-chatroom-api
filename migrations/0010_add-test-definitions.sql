-- Add unique constraint to prevent duplicate test definition IDs
-- Note: SQLite doesn't support adding UNIQUE constraints to existing tables,
-- but the PRIMARY KEY constraint on 'id' already ensures uniqueness

-- Insert default test definitions (only if they don't already exist)
-- These are the default test definitions that should be stored in D1, not hardcoded in the application
-- Using the new schema with error_meanings_json and error_solutions_json
INSERT OR IGNORE INTO test_defs (id, name, description, category, severity, is_active, error_meanings_json, error_solutions_json, metadata) VALUES
('health-check', 'Health Check', 'Basic health check test - verifies system is responding', 'system', 'critical', 1,
  '{"NO_RESPONSE": {"meaning": "Health endpoint not responding"}}',
  '{"NO_RESPONSE": {"fix": "Check server deployment and health endpoint implementation"}}',
  '{"context": "This is a critical system test that verifies basic availability"}'),
('api-openapi', 'OpenAPI Spec', 'Validate OpenAPI specification completeness and correctness', 'api', 'high', 1,
  '{"NO_MANIFEST": {"meaning": "OpenAPI manifest missing critical endpoints"}, "INVALID_VERSION": {"meaning": "OpenAPI version is incorrect"}}',
  '{"NO_MANIFEST": {"fix": "Verify registry path registration and runtime generator"}, "INVALID_VERSION": {"fix": "Ensure generator outputs openapi 3.1.0"}}',
  '{"context": "Validates API documentation completeness"}'),
('websocket-basic', 'WebSocket Basic', 'Test basic WebSocket functionality and handshake', 'realtime', 'high', 1,
  '{"HANDSHAKE_FAILED": {"meaning": "WebSocket handshake failed"}, "NO_WELCOME": {"meaning": "Expected welcome message not received"}}',
  '{"HANDSHAKE_FAILED": {"fix": "Check Durable Object bindings and WebSocket upgrade handling"}, "NO_WELCOME": {"fix": "Ensure RoomDO sends system.welcome on connection"}}',
  '{"context": "Tests real-time communication capabilities"}'),
('database-connectivity', 'Database Connectivity', 'Verify D1 database connectivity and basic operations', 'database', 'critical', 1,
  '{"DB_ERROR": {"meaning": "Database connection or query failed"}}',
  '{"DB_ERROR": {"fix": "Check D1 binding configuration and database schema"}}',
  '{"context": "Critical test for data persistence"}'),
('durable-objects', 'Durable Objects', 'Verify all Durable Objects can be instantiated', 'infrastructure', 'high', 1,
  '{"DO_INIT_ERROR": {"meaning": "Durable Object instantiation failed"}}',
  '{"DO_INIT_ERROR": {"fix": "Check Durable Object class definitions and bindings"}}',
  '{"context": "Tests stateful object initialization"}'),
('api-endpoints', 'API Endpoints', 'Verify core API endpoints are accessible', 'api', 'high', 1,
  '{"ENDPOINT_ERROR": {"meaning": "API endpoint not responding"}}',
  '{"ENDPOINT_ERROR": {"fix": "Check route definitions and handler implementations"}}',
  '{"context": "Validates API route accessibility"}'),
('mcp-services', 'MCP Services', 'Verify Model Context Protocol services are operational', 'ai', 'medium', 1,
  '{"MCP_ERROR": {"meaning": "MCP service not responding"}}',
  '{"MCP_ERROR": {"fix": "Check AI binding and MCP agent implementation"}}',
  '{"context": "Tests AI/ML service integration"}'),
('system-performance', 'System Performance', 'Monitor system performance metrics', 'monitoring', 'low', 1,
  '{"PERF_ERROR": {"meaning": "Performance metrics collection failed"}}',
  '{"PERF_ERROR": {"fix": "Check system monitoring implementation"}}',
  '{"context": "Monitors system health metrics"}'),
('external-dependencies', 'External Dependencies', 'Verify external services and runtime environment', 'infrastructure', 'medium', 1,
  '{"DEPENDENCY_ERROR": {"meaning": "External dependency check failed"}}',
  '{"DEPENDENCY_ERROR": {"fix": "Check runtime environment and external service availability"}}',
  '{"context": "Validates external service connectivity"}');
