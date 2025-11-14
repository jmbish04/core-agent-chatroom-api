-- Migration to populate error_meanings_json and error_solutions_json from existing error_map data
-- This converts the legacy error_map format to the new separated format

-- Update health-check
UPDATE test_defs SET
  error_meanings_json = '{"NO_RESPONSE": {"meaning": "Health endpoint not responding"}}',
  error_solutions_json = '{"NO_RESPONSE": {"fix": "Check server deployment and health endpoint implementation"}}',
  metadata = '{"context": "This is a critical system test that verifies basic availability"}'
WHERE id = 'health-check' AND (error_meanings_json IS NULL OR error_solutions_json IS NULL);

-- Update api-openapi
UPDATE test_defs SET
  error_meanings_json = '{"NO_MANIFEST": {"meaning": "OpenAPI manifest missing critical endpoints"}, "INVALID_VERSION": {"meaning": "OpenAPI version is incorrect"}}',
  error_solutions_json = '{"NO_MANIFEST": {"fix": "Verify registry path registration and runtime generator"}, "INVALID_VERSION": {"fix": "Ensure generator outputs openapi 3.1.0"}}',
  metadata = '{"context": "Validates API documentation completeness"}'
WHERE id = 'api-openapi' AND (error_meanings_json IS NULL OR error_solutions_json IS NULL);

-- Update websocket-basic
UPDATE test_defs SET
  error_meanings_json = '{"HANDSHAKE_FAILED": {"meaning": "WebSocket handshake failed"}, "NO_WELCOME": {"meaning": "Expected welcome message not received"}}',
  error_solutions_json = '{"HANDSHAKE_FAILED": {"fix": "Check Durable Object bindings and WebSocket upgrade handling"}, "NO_WELCOME": {"fix": "Ensure RoomDO sends system.welcome on connection"}}',
  metadata = '{"context": "Tests real-time communication capabilities"}'
WHERE id = 'websocket-basic' AND (error_meanings_json IS NULL OR error_solutions_json IS NULL);

-- Update database-connectivity
UPDATE test_defs SET
  error_meanings_json = '{"DB_ERROR": {"meaning": "Database connection or query failed"}}',
  error_solutions_json = '{"DB_ERROR": {"fix": "Check D1 binding configuration and database schema"}}',
  metadata = '{"context": "Critical test for data persistence"}'
WHERE id = 'database-connectivity' AND (error_meanings_json IS NULL OR error_solutions_json IS NULL);

-- Update durable-objects
UPDATE test_defs SET
  error_meanings_json = '{"DO_INIT_ERROR": {"meaning": "Durable Object instantiation failed"}}',
  error_solutions_json = '{"DO_INIT_ERROR": {"fix": "Check Durable Object class definitions and bindings"}}',
  metadata = '{"context": "Tests stateful object initialization"}'
WHERE id = 'durable-objects' AND (error_meanings_json IS NULL OR error_solutions_json IS NULL);

-- Update api-endpoints
UPDATE test_defs SET
  error_meanings_json = '{"ENDPOINT_ERROR": {"meaning": "API endpoint not responding"}}',
  error_solutions_json = '{"ENDPOINT_ERROR": {"fix": "Check route definitions and handler implementations"}}',
  metadata = '{"context": "Validates API route accessibility"}'
WHERE id = 'api-endpoints' AND (error_meanings_json IS NULL OR error_solutions_json IS NULL);

-- Update mcp-services
UPDATE test_defs SET
  error_meanings_json = '{"MCP_ERROR": {"meaning": "MCP service not responding"}}',
  error_solutions_json = '{"MCP_ERROR": {"fix": "Check AI binding and MCP agent implementation"}}',
  metadata = '{"context": "Tests AI/ML service integration"}'
WHERE id = 'mcp-services' AND (error_meanings_json IS NULL OR error_solutions_json IS NULL);

-- Update system-performance
UPDATE test_defs SET
  error_meanings_json = '{"PERF_ERROR": {"meaning": "Performance metrics collection failed"}}',
  error_solutions_json = '{"PERF_ERROR": {"fix": "Check system monitoring implementation"}}',
  metadata = '{"context": "Monitors system health metrics"}'
WHERE id = 'system-performance' AND (error_meanings_json IS NULL OR error_solutions_json IS NULL);

-- Update external-dependencies
UPDATE test_defs SET
  error_meanings_json = '{"DEPENDENCY_ERROR": {"meaning": "External dependency check failed"}}',
  error_solutions_json = '{"DEPENDENCY_ERROR": {"fix": "Check runtime environment and external service availability"}}',
  metadata = '{"context": "Validates external service connectivity"}'
WHERE id = 'external-dependencies' AND (error_meanings_json IS NULL OR error_solutions_json IS NULL);

