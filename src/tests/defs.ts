import type { Env } from "../types";
import type { UpsertTestDefinitionParams } from "../utils/db";
import { loadDefaultTestDefinitionsFromD1 } from "../utils/db";

/**
 * Load default test definitions from D1 database.
 * These definitions are stored in the test_defs table and should be inserted via migrations.
 * This function replaces the previous hardcoded array to ensure all test definitions come from D1.
 */
export const getDefaultTestDefinitions = async (
  env: Env,
): Promise<UpsertTestDefinitionParams[]> => {
  return await loadDefaultTestDefinitionsFromD1(env);
};
