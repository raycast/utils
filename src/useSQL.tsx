import { showToast, Toast, List, ActionPanel, Action, Clipboard } from "@raycast/api";
import { readFile } from "fs/promises";
import { useRef, useState, useEffect, useCallback } from "react";
import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { useCachedPromise, CachedPromiseOptions } from "./useCachedPromise";
import { useLatest } from "./useLatest";

// @ts-expect-error importing a wasm is tricky :)
// eslint-disable-next-line import/no-unresolved
import wasmBinary from "sql.js/dist/sql-wasm.wasm";

let SQL: SqlJsStatic;

async function loadDatabase(path: string) {
  if (!SQL) {
    SQL = await initSqlJs({ wasmBinary: Buffer.from(wasmBinary as Uint8Array) });
  }
  const fileContents = await readFile(path);
  return new SQL.Database(fileContents);
}

export function useSQL<T, U = undefined>(
  databasePath: string,
  query: string,
  options?: { permissionPriming?: string } & Omit<CachedPromiseOptions<() => Promise<T>, U>, "abortable">
) {
  const { initialData, execute, keepPreviousData } = options || {};

  const databaseRef = useRef<Database>();

  const [permissionView, setPermissionView] = useState<React.ReactNode>();
  const latestOptions = useLatest(options || {});

  const handleError = useCallback(
    (_error: Error) => {
      console.error(_error);
      const error =
        _error instanceof Error && _error.message.includes("operation not permitted")
          ? new PermissionError("You do not have permission to access the database.")
          : (_error as Error);

      if (isPermissionError(error)) {
        setPermissionView(<PermissionErrorScreen priming={latestOptions.current.permissionPriming} />);
      } else {
        if (latestOptions.current.onError) {
          latestOptions.current.onError(error);
        } else {
          showToast({
            style: Toast.Style.Failure,
            title: "Cannot query the data",
            message: error.message,
            primaryAction: {
              title: "Copy Logs",
              onAction(toast) {
                toast.hide();
                Clipboard.copy(error?.stack || error?.message || "");
              },
            },
          });
        }
      }
    },
    [latestOptions]
  );

  const fn = useCallback(
    async (query: string) => {
      if (!databaseRef.current) {
        databaseRef.current = await loadDatabase(databasePath);
      }

      const newResults: T[] = [];
      const statement = databaseRef.current.prepare(query);
      while (statement.step()) {
        newResults.push(statement.getAsObject() as unknown as T);
      }

      statement.free();

      return newResults;
    },
    [databasePath]
  );

  useEffect(() => {
    return () => {
      databaseRef.current?.close();
      databaseRef.current = undefined;
    };
  }, []);

  return {
    ...useCachedPromise(fn, [query], { initialData, execute, keepPreviousData, onError: handleError }),
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

function PermissionErrorScreen(props: { priming?: string }) {
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
        }You can revert this access in preferences whenever you want.`}
        actions={
          <ActionPanel>
            <Action.Open
              title="Open System Preferences - Privacy"
              target="x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
