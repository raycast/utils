import { baseExecuteSQL } from "./sql-utils";

/**
 * Executes a SQL query on a local SQLite database and returns the query result in JSON format.
 *
 * @param databasePath - The path to the SQLite database file.
 * @param query - The SQL query to execute.
 * @returns A Promise that resolves to an array of objects representing the query results.
 *
 * @example
 * ```typescript
 * import { closeMainWindow, Clipboard } from "@raycast/api";
 * import { executeSQL } from "@raycast/utils";
 *
 * type Message = { body: string; code: string };
 *
 * const DB_PATH = "/path/to/chat.db";
 *
 * export default async function Command() {
 *   const query = `SELECT body, code FROM ...`
 *
 *   const messages = await executeSQL<Message>(DB_PATH, query);
 *
 *   if (messages.length > 0) {
 *     const latestCode = messages[0].code;
 *     await Clipboard.paste(latestCode);
 *     await closeMainWindow();
 *   }
 * }
 * ```
 */
export function executeSQL<T = unknown>(databasePath: string, query: string) {
  return baseExecuteSQL<T>(databasePath, query);
}
