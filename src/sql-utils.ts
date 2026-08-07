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
  } catch {
    // If sqlite3 is not available, we fallback to using the sqlite3 CLI (available on macOS and Linux by default).
    return sqliteFallback<T>(databasePath, query, options);
  }

  const abortSignal = options?.signal;

  try {
    return executeWithNodeSQLite<T>(sqlite3, databasePath, query, abortSignal);
  } catch (error) {
    if (isDatabaseBusy(error)) {
      // That means that the DB is busy because of another app is locking it
      // This happens when Chrome or Arc is opened: they lock the History db.
      // As an ugly workaround, we duplicate the file and read that instead
      // (with vfs unix - none to just not care about locks)
      const workaroundCopiedDb = await createDatabaseCopy(databasePath, abortSignal);
      return executeWithNodeSQLite<T>(sqlite3, workaroundCopiedDb, query, abortSignal);
    }
    throw error;
  }
}

function executeWithNodeSQLite<T>(
  sqlite3: typeof import("node:sqlite"),
  databasePath: string,
  query: string,
  abortSignal?: AbortSignal,
) {
  const db = new sqlite3.DatabaseSync(databasePath, { open: false, readOnly: true });
  let opened = false;
  try {
    db.open();
    opened = true;
    checkAborted(abortSignal);
    const statement = db.prepare(query);
    checkAborted(abortSignal);
    return statement.all() as T[];
  } finally {
    if (opened) {
      db.close();
    }
  }
}

function isDatabaseBusy(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const errorWithCode = error as Error & { errcode?: number };
  return (
    errorWithCode.errcode === 5 ||
    errorWithCode.errcode === 14 ||
    error.message.includes("(5)") ||
    error.message.includes("(14)")
  );
}

async function createDatabaseCopy(databasePath: string, abortSignal?: AbortSignal) {
  const tempFolder = path.join(os.tmpdir(), "useSQL", hash(databasePath));
  await mkdir(tempFolder, { recursive: true });
  checkAborted(abortSignal);

  const workaroundCopiedDb = path.join(tempFolder, "db.db");
  try {
    await copyFile(databasePath, workaroundCopiedDb);
  } catch (error) {
    if (process.platform === "darwin" && error instanceof Error && "code" in error && error.code === "EPERM") {
      throw new PermissionError("You do not have permission to access the database.");
    }
    throw error;
  }

  await writeFile(workaroundCopiedDb + "-shm", "");
  await writeFile(workaroundCopiedDb + "-wal", "");
  checkAborted(abortSignal);
  return workaroundCopiedDb;
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

  if (stderrResult.includes("(5)") || stderrResult.includes("(14)")) {
    // That means that the DB is busy because of another app is locking it
    // This happens when Chrome or Arc is opened: they lock the History db.
    // As an ugly workaround, we duplicate the file and read that instead
    // (with vfs unix - none to just not care about locks)
    const workaroundCopiedDb = await createDatabaseCopy(databasePath, abortSignal);

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
    if (process.platform === "darwin" && stderrResult.includes("authorization denied")) {
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
