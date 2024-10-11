import { open } from "@raycast/api";
import { showFailureToast } from "./showFailureToast";
import { baseExecuteSQL, getSystemPreferencesInfo, isPermissionError } from "./sql-utils";

/**
 * Executes a SQL query on a local SQLite database and returns the query result in JSON format.
 *
 * @param databasePath - The path to the SQLite database file.
 * @param query - The SQL query to execute.
 * @returns A Promise that resolves to an array of objects representing the query results.
 *
 * @example
 * ```typescript
 * import { executeSQL } from "./executeSQL";
 *
 * type User = { id: number, name: string };
 *
 * const dbPath = "/path/to/database.sqlite";
 * const query = "SELECT id, name FROM users WHERE age > 18";
 *
 * try {
 *   const results = await executeSQL<User>(dbPath, query);
 *   console.log(results);
 * } catch (error) {
 *   console.error("Error executing SQL:", error);
 * }
 * ```
 */
export async function executeSQL<T = unknown>(databasePath: string, query: string) {
  try {
    return await baseExecuteSQL<T>(databasePath, query);
  } catch (error) {
    if (isPermissionError(error)) {
      const { preferencesName, action } = getSystemPreferencesInfo();
      await showFailureToast(error, {
        title: "Raycast needs full disk access",
        message: `You can revert this access in "${preferencesName}" whenever you want.`,
        primaryAction: {
          title: action.title,
          onAction() {
            open(action.target);
          },
        },
      });
    } else {
      await showFailureToast(error, { title: "Cannot execute SQL" });
    }
  }
}
