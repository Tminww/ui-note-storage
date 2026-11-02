import { createSQLiteRepository } from './sqlite.mjs';

/**
 * Storage adapter contract (all methods are sync for this tiny MVP):
 *  listProjects/createProject/updateProject/deleteProject/getProject
 *  listThoughts/getThought/createThought/updateThought/deleteThought
 *  getSettings/updateSettings/exportSnapshot/close
 *
 * Implement a second adapter here (PostgreSQL, Notion, Drive, etc.).
 * The HTTP layer and AI pipeline never issue raw SQL.
 */
export function createRepository({ driver = 'sqlite', databasePath } = {}) {
  switch (driver) {
    case 'sqlite': return createSQLiteRepository(databasePath);
    default: throw new Error(`Unknown STORAGE_DRIVER: ${driver}. Available: sqlite`);
  }
}
