import {
  showToast,
  Toast,
  List,
  ActionPanel,
  Action,
  environment,
  MenuBarExtra,
  Icon,
  open,
  LaunchType,
} from "@raycast/api";
import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import childProcess from "node:child_process";
import path from "node:path";
import hash from "object-hash";
import { useRef, useState, useCallback, useMemo } from "react";
import { usePromise, PromiseOptions } from "./usePromise";
import { useLatest } from "./useLatest";
import { getSpawnedPromise, getSpawnedResult } from "./exec-utils";
import { handleErrorToastAction } from "./handle-error-toast-action";

/**
 * Executes a query on a local SQL database and returns the {@link AsyncState} corresponding to the query of the command. The last value will be kept between command runs.
 *
 * @example
 * ```
 * import { useSQL } from "@raycast/utils";
 * import { resolve } from "path";
 * import { homedir } from "os";
 *
 * const NOTES_DB = resolve(homedir(), "Library/Group Containers/group.com.apple.notes/NoteStore.sqlite");
 * const notesQuery = `SELECT id, title FROM ...`;
 * type NoteItem = {
 *   id: string;
 *   title: string;
 * };
 *
 * const Demo = () => {
 *   const { isLoading, data, permissionView } = useSQL<NoteItem>(NOTES_DB, notesQuery);
 *
 *   if (permissionView) {
 *     return permissionView;
 *   }
 *
 *   return (
 *     <List isLoading={isLoading}>
 *       {(data || []).map((item) => (
 *         <List.Item key={item.id} title={item.title} />
 *       ))}
 *     </List>
 *  );
 * };
 * ```
 */
export function useSQL<T = unknown>(
  databasePath: string,
  query: string,
  options?: {
    /** A string explaining why the extension needs full disk access. For example, the Apple Notes extension uses `"This is required to search your Apple Notes."`. While it is optional, we recommend setting it to help users understand. */
    permissionPriming?: string;
  } & Omit<PromiseOptions<(database: string, query: string) => Promise<T[]>>, "abortable">
) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { permissionPriming, ...usePromiseOptions } = options || {};

  const [permissionView, setPermissionView] = useState<JSX.Element>();
  const latestOptions = useLatest(options || {});
  const abortable = useRef<AbortController>();

  const handleError = useCallback(
    (_error: Error) => {
      console.error(_error);
      const error =
        _error instanceof Error && _error.message.includes("authorization denied")
          ? new PermissionError("You do not have permission to access the database.")
          : (_error as Error);

      if (isPermissionError(error)) {
        setPermissionView(<PermissionErrorScreen priming={latestOptions.current.permissionPriming} />);
      } else {
        if (latestOptions.current.onError) {
          latestOptions.current.onError(error);
        } else {
          console.error(error);
          if (environment.launchType !== LaunchType.Background) {
            showToast({
              style: Toast.Style.Failure,
              title: "Cannot query the data",
              message: error.message,
              primaryAction: handleErrorToastAction(error),
            });
          }
        }
      }
    },
    [latestOptions]
  );

  const fn = useMemo(() => {
    if (!existsSync(databasePath)) {
      throw new Error("The database does not exist");
    }
    let workaroundCopiedDb: string | undefined = undefined;

    return async (databasePath: string, query: string) => {
      const abortSignal = abortable.current?.signal;
      const spawned = childProcess.spawn("sqlite3", ["--json", "--readonly", databasePath, query], {
        signal: abortSignal,
      });
      const spawnedPromise = getSpawnedPromise(spawned);
      let [{ error, exitCode, signal }, stdoutResult, stderrResult] = await getSpawnedResult<string>(
        spawned,
        { encoding: "utf-8" },
        spawnedPromise
      );

      checkAborted(abortSignal);

      if (stderrResult.match("(5)") || stderrResult.match("(14)")) {
        // That means that the DB is busy because of another app is locking it
        // This happens when Chrome or Arc is opened: they lock the History db.
        // As an ugly workaround, we duplicate the file and read that instead
        // (with vfs unix - none to just not care about locks)
        if (!workaroundCopiedDb) {
          const tempFolder = path.join(os.tmpdir(), "useSQL", hash(databasePath));
          await mkdir(tempFolder, { recursive: true });
          checkAborted(abortSignal);

          workaroundCopiedDb = path.join(tempFolder, "db.db");
          await copyFile(databasePath, workaroundCopiedDb);

          // needed for certain db
          await writeFile(workaroundCopiedDb + "-shm", "");
          await writeFile(workaroundCopiedDb + "-wal", "");

          checkAborted(abortSignal);
        }
        const spawned = childProcess.spawn(
          "sqlite3",
          ["--json", "--readonly", "--vfs", "unix-none", workaroundCopiedDb, query],
          {
            signal: abortSignal,
          }
        );
        const spawnedPromise = getSpawnedPromise(spawned);
        [{ error, exitCode, signal }, stdoutResult, stderrResult] = await getSpawnedResult<string>(
          spawned,
          { encoding: "utf-8" },
          spawnedPromise
        );
        checkAborted(abortSignal);
      }

      if (error || exitCode !== 0 || signal !== null) {
        throw new Error(stderrResult);
      }

      return JSON.parse(stdoutResult.trim() || "[]") as T[];
    };
  }, [databasePath]);

  return {
    ...usePromise(fn, [databasePath, query], { ...usePromiseOptions, onError: handleError }),
    permissionView,
  };
}

class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

function isPermissionError(error: unknown) {
  return error instanceof Error && error.name === "PermissionError";
}

const macosVenturaAndLater = parseInt(os.release().split(".")[0]) >= 22;
const preferencesString = macosVenturaAndLater ? "Settings" : "Preferences";

function PermissionErrorScreen(props: { priming?: string }) {
  const action = macosVenturaAndLater
    ? {
        title: "Open System Settings -> Privacy",
        target: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
      }
    : {
        title: "Open System Preferences -> Security",
        target: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
      };

  if (environment.commandMode === "menu-bar") {
    return (
      <MenuBarExtra icon={Icon.Warning} title={environment.commandName}>
        <MenuBarExtra.Item
          title="Raycast needs full disk access"
          tooltip={`You can revert this access in ${preferencesString} whenever you want`}
        />
        {props.priming ? (
          <MenuBarExtra.Item
            title={props.priming}
            tooltip={`You can revert this access in ${preferencesString} whenever you want`}
          />
        ) : null}
        <MenuBarExtra.Separator />
        <MenuBarExtra.Item title={action.title} onAction={() => open(action.target)} />
      </MenuBarExtra>
    );
  }

  return (
    <List>
      <List.EmptyView
        icon={{
          source: {
            light: "https://raycast.com/uploads/extensions-utils-security-permissions-light.png",
            dark: "https://raycast.com/uploads/extensions-utils-security-permissions-dark.png",
          },
        }}
        title="Raycast needs full disk access."
        description={`${
          props.priming ? props.priming + "\n" : ""
        }You can revert this access in ${preferencesString} whenever you want.`}
        actions={
          <ActionPanel>
            <Action.Open {...action} />
          </ActionPanel>
        }
      />
    </List>
  );
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  }
}
