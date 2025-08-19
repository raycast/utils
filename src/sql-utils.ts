import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import childProcess from "node:child_process";
import path from "node:path";
import { getSpawnedPromise, getSpawnedResult } from "./exec-utils";
import { hash } from "./helpers";

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export function isPermissionError(error: unknown): error is PermissionError {
  return error instanceof Error && error.name === "PermissionError";
}

export async function baseExecuteSQL<T = unknown>(
  databasePath: string,
  query: string,
  options?: {
    signal?: AbortSignal;
  },
): Promise<T[]> {
  if (!existsSync(databasePath)) {
    throw new Error("The database does not exist");
  }

  let sqlite3: typeof import("node:sqlite");
  try {
    // this is a bit ugly but we can't directly import "node:sqlite" here because parcel will hoist it anyway and it will break when it's not available
    const dynamicImport = (module: string) => import(module);
    sqlite3 = await dynamicImport("node:sqlite");
  } catch (error) {
    // If sqlite3 is not available, we fallback to using the sqlite3 CLI (available on macOS and Linux by default).
    return sqliteFallback<T>(databasePath, query, options);
  }

  let db = new sqlite3.DatabaseSync(databasePath, { open: false, readOnly: true });

  const abortSignal = options?.signal;

  try {
    db.open();
  } catch (error: any) {
    console.log(error);
    if (error.message.match("(5)") || error.message.match("(14)")) {
      // That means that the DB is busy because of another app is locking it
      // This happens when Chrome or Arc is opened: they lock the History db.
      // As an ugly workaround, we duplicate the file and read that instead
      // (with vfs unix - none to just not care about locks)
      let workaroundCopiedDb: string | undefined;
      if (!workaroundCopiedDb) {
        const tempFolder = path.join(os.tmpdir(), "useSQL", hash(databasePath));
        await mkdir(tempFolder, { recursive: true });
        checkAborted(abortSignal);

        workaroundCopiedDb = path.join(tempFolder, "db.db");
        await copyFile(databasePath, workaroundCopiedDb);

        await writeFile(workaroundCopiedDb + "-shm", "");
        await writeFile(workaroundCopiedDb + "-wal", "");

        checkAborted(abortSignal);
      }

      db = new sqlite3.DatabaseSync(workaroundCopiedDb, { open: false, readOnly: true });
      db.open();
      checkAborted(abortSignal);
    }
  }

  const statement = db.prepare(query);
  checkAborted(abortSignal);

  const result = statement.all();

  db.close();

  return result as T[];
}

async function sqliteFallback<T = unknown>(
  databasePath: string,
  query: string,
  options?: {
    signal?: AbortSignal;
  },
): Promise<T[]> {
  const abortSignal = options?.signal;

  let spawned = childProcess.spawn("sqlite3", ["--json", "--readonly", databasePath, query], { signal: abortSignal });
  let spawnedPromise = getSpawnedPromise(spawned);
  let [{ error, exitCode, signal }, stdoutResult, stderrResult] = await getSpawnedResult<string>(
    spawned,
    { encoding: "utf-8" },
    spawnedPromise,
  );
  checkAborted(abortSignal);

  if (stderrResult.match("(5)") || stderrResult.match("(14)")) {
    // That means that the DB is busy because of another app is locking it
    // This happens when Chrome or Arc is opened: they lock the History db.
    // As an ugly workaround, we duplicate the file and read that instead
    // (with vfs unix - none to just not care about locks)
    let workaroundCopiedDb: string | undefined;
    if (!workaroundCopiedDb) {
      const tempFolder = path.join(os.tmpdir(), "useSQL", hash(databasePath));
      await mkdir(tempFolder, { recursive: true });
      checkAborted(abortSignal);

      workaroundCopiedDb = path.join(tempFolder, "db.db");
      await copyFile(databasePath, workaroundCopiedDb);

      await writeFile(workaroundCopiedDb + "-shm", "");
      await writeFile(workaroundCopiedDb + "-wal", "");

      checkAborted(abortSignal);
    }

    spawned = childProcess.spawn("sqlite3", ["--json", "--readonly", "--vfs", "unix-none", workaroundCopiedDb, query], {
      signal: abortSignal,
    });
    spawnedPromise = getSpawnedPromise(spawned);
    [{ error, exitCode, signal }, stdoutResult, stderrResult] = await getSpawnedResult<string>(
      spawned,
      { encoding: "utf-8" },
      spawnedPromise,
    );
    checkAborted(abortSignal);
  }

  if (error || exitCode !== 0 || signal !== null) {
    if (stderrResult.includes("authorization denied")) {
      throw new PermissionError("You do not have permission to access the database.");
    } else {
      throw new Error(stderrResult || "Unknown error");
    }
  }

  return JSON.parse(stdoutResult.trim() || "[]") as T[];
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  }
}
