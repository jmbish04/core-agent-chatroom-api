-- Migration to update test_defs table to match reference schema
-- Add error_meanings_json, error_solutions_json, and metadata columns

-- Add new columns to test_defs table (if they don't already exist)
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we'll just add them
-- If they already exist, this will fail but that's okay - we can ignore the error
ALTER TABLE test_defs ADD COLUMN error_meanings_json TEXT;
ALTER TABLE test_defs ADD COLUMN error_solutions_json TEXT;
ALTER TABLE test_defs ADD COLUMN metadata TEXT;

-- Note: The migration of error_map data to the new columns will be handled by application code
-- error_map format: {"ERROR_CODE": {"meaning": "...", "fix": "..."}}
-- error_meanings_json format: {"ERROR_CODE": {"meaning": "..."}}
-- error_solutions_json format: {"ERROR_CODE": {"fix": "..."}}
-- The application code should read from error_map and populate the new columns when needed

