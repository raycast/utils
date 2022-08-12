/*
 * Inspired by Execa
 */

import childProcess from "node:child_process";
import { constants as BufferConstants } from "node:buffer";
import Stream from "node:stream";
import { promisify } from "node:util";
import { useCallback, useRef } from "react";
import onExit from "signal-exit";

import { useDeepMemo } from "./useDeepMemo";
import { useCachedPromise, CachedPromiseOptions } from "./useCachedPromise";
import { useLatest } from "./useLatest";
import { AsyncState, MutatePromise } from "./types";

type SpawnedPromise = Promise<{
  exitCode: number | null;
  error?: Error;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}>;

const SPACES_REGEXP = / +/g;
function parseCommand(command: string) {
  const tokens: string[] = [];
  for (const token of command.trim().split(SPACES_REGEXP)) {
    // Allow spaces to be escaped by a backslash if not meant as a delimiter
    const previousToken = tokens[tokens.length - 1];
    if (previousToken && previousToken.endsWith("\\")) {
      // Merge previous token with current one
      tokens[tokens.length - 1] = `${previousToken.slice(0, -1)} ${token}`;
    } else {
      tokens.push(token);
    }
  }

  return tokens;
}

const NO_ESCAPE_REGEXP = /^[\w.-]+$/;
const DOUBLE_QUOTES_REGEXP = /"/g;
function escapeArg(arg: string) {
  if (typeof arg !== "string" || NO_ESCAPE_REGEXP.test(arg)) {
    return arg;
  }

  return `"${arg.replace(DOUBLE_QUOTES_REGEXP, '\\"')}"`;
}

function getSpawnedPromise(spawned: childProcess.ChildProcessWithoutNullStreams): SpawnedPromise {
  return new Promise((resolve, reject) => {
    spawned.on("exit", (exitCode, signal) => {
      resolve({ exitCode, signal, timedOut: false });
    });

    spawned.on("error", (error) => {
      reject(error);
    });

    if (spawned.stdin) {
      spawned.stdin.on("error", (error) => {
        reject(error);
      });
    }
  });
}

function setupTimeout(
  spawned: childProcess.ChildProcessWithoutNullStreams,
  { timeout }: { timeout?: number },
  spawnedPromise: SpawnedPromise
) {
  if (timeout === 0 || timeout === undefined) {
    return spawnedPromise;
  }

  let timeoutId: NodeJS.Timeout;
  const timeoutPromise: SpawnedPromise = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      spawned.kill("SIGTERM");
      reject(Object.assign(new Error("Timed out"), { timedOut: true, signal: "SIGTERM" }));
    }, timeout);
  });

  const safeSpawnedPromise = spawnedPromise.finally(() => {
    clearTimeout(timeoutId);
  });

  return Promise.race([timeoutPromise, safeSpawnedPromise]);
}

function setExitHandler(spawned: childProcess.ChildProcessWithoutNullStreams, timedPromise: SpawnedPromise) {
  const removeExitHandler = onExit(() => {
    spawned.kill();
  });

  return timedPromise.finally(() => {
    removeExitHandler();
  });
}

class MaxBufferError extends Error {
  constructor() {
    super("The output is too big");
    this.name = "MaxBufferError";
  }
}

const streamPipelinePromisified = promisify(Stream.pipeline);

function bufferStream<T extends string | Buffer>(options: { encoding: BufferEncoding | "buffer" }) {
  const { encoding } = options;
  const isBuffer = encoding === "buffer";

  // @ts-expect-error missing the methods we are adding below
  const stream: Stream.PassThrough & { getBufferedValue: () => T; getBufferedLength: () => number } =
    new Stream.PassThrough({ objectMode: false });

  if (encoding && encoding !== "buffer") {
    stream.setEncoding(encoding);
  }

  let length = 0;
  const chunks: any[] = [];

  stream.on("data", (chunk) => {
    chunks.push(chunk);

    length += chunk.length;
  });

  stream.getBufferedValue = () => {
    return (isBuffer ? Buffer.concat(chunks, length) : chunks.join("")) as T;
  };

  stream.getBufferedLength = () => length;

  return stream;
}

async function getStream<T extends string | Buffer>(
  inputStream: Stream.Readable,
  options: { encoding: BufferEncoding | "buffer" }
) {
  const stream = bufferStream<T>(options);

  await new Promise<void>((resolve, reject) => {
    const rejectPromise = (error: Error & { bufferedData?: T }) => {
      // Don't retrieve an oversized buffer.
      if (error && stream.getBufferedLength() <= BufferConstants.MAX_LENGTH) {
        error.bufferedData = stream.getBufferedValue();
      }

      reject(error);
    };

    (async () => {
      try {
        await streamPipelinePromisified(inputStream, stream);
        resolve();
      } catch (error) {
        rejectPromise(error as any);
      }
    })();

    stream.on("data", () => {
      // 80mb
      if (stream.getBufferedLength() > 1000 * 1000 * 80) {
        rejectPromise(new MaxBufferError());
      }
    });
  });

  return stream.getBufferedValue();
}

// On failure, `result.stdout|stderr` should contain the currently buffered stream
async function getBufferedData<T extends string | Buffer>(stream: Stream.Readable, streamPromise: Promise<T>) {
  stream.destroy();

  try {
    return await streamPromise;
  } catch (error) {
    return (error as any as { bufferedData: T }).bufferedData;
  }
}

async function getSpawnedResult<T extends string | Buffer>(
  { stdout, stderr }: childProcess.ChildProcessWithoutNullStreams,
  { encoding }: { encoding: BufferEncoding | "buffer" },
  processDone: SpawnedPromise
) {
  const stdoutPromise = getStream<T>(stdout, { encoding });
  const stderrPromise = getStream<T>(stderr, { encoding });

  try {
    return await Promise.all([processDone, stdoutPromise, stderrPromise]);
  } catch (error: any) {
    return Promise.all([
      {
        error: error as Error,
        exitCode: null,
        signal: error.signal as NodeJS.Signals | null,
        timedOut: (error.timedOut as boolean) || false,
      },
      getBufferedData(stdout, stdoutPromise),
      getBufferedData(stderr, stderrPromise),
    ]);
  }
}

function stripFinalNewline<T extends string | Buffer>(input: T) {
  const LF = typeof input === "string" ? "\n" : "\n".charCodeAt(0);
  const CR = typeof input === "string" ? "\r" : "\r".charCodeAt(0);

  if (input[input.length - 1] === LF) {
    // @ts-expect-error we are doing some nasty stuff here
    input = input.slice(0, -1);
  }

  if (input[input.length - 1] === CR) {
    // @ts-expect-error we are doing some nasty stuff here
    input = input.slice(0, -1);
  }

  return input;
}

function handleOutput<T extends string | Buffer>(options: { stripFinalNewline?: boolean }, value: T) {
  if (options.stripFinalNewline) {
    return stripFinalNewline(value);
  }

  return value;
}

const getErrorPrefix = ({
  timedOut,
  timeout,
  signal,
  exitCode,
}: {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  timeout?: number;
}) => {
  if (timedOut) {
    return `timed out after ${timeout} milliseconds`;
  }

  if (signal !== undefined) {
    return `was killed with ${signal}`;
  }

  if (exitCode !== undefined) {
    return `failed with exit code ${exitCode}`;
  }

  return "failed";
};

const makeError = ({
  stdout,
  stderr,
  error,
  signal,
  exitCode,
  command,
  escapedCommand,
  timedOut,
  options,
}: {
  stdout: string | Buffer;
  stderr: string | Buffer;
  error?: Error;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  command: string;
  escapedCommand: string;
  options?: { timeout?: number };
}) => {
  const prefix = getErrorPrefix({ timedOut, timeout: options?.timeout, signal, exitCode });
  const execaMessage = `Command ${prefix}: ${command}`;
  const shortMessage = error ? `${execaMessage}\n${error.message}` : execaMessage;
  const message = [shortMessage, stderr, stdout].filter(Boolean).join("\n");

  if (error) {
    // @ts-expect-error not on Error
    error.originalMessage = error.message;
    error.message = message;
  } else {
    error = new Error(message);
  }

  // @ts-expect-error not on Error
  error.shortMessage = shortMessage;
  // @ts-expect-error not on Error
  error.command = command;
  // @ts-expect-error not on Error
  error.escapedCommand = escapedCommand;
  // @ts-expect-error not on Error
  error.exitCode = exitCode;
  // @ts-expect-error not on Error
  error.signal = signal;
  // @ts-expect-error not on Error
  error.stdout = stdout;
  // @ts-expect-error not on Error
  error.stderr = stderr;

  if ("bufferedData" in error) {
    delete error["bufferedData"];
  }

  return error;
};

function defaultParsing<T extends string | Buffer>({
  stdout,
  stderr,
  error,
  exitCode,
  signal,
  timedOut,
  command,
  escapedCommand,
  options,
}: {
  stdout: T;
  stderr: T;
  error?: Error;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  command: string;
  escapedCommand: string;
  options?: { timeout?: number };
}) {
  if (error || exitCode !== 0 || signal !== null) {
    const returnedError = makeError({
      error,
      exitCode,
      signal,
      stdout,
      stderr,
      command,
      escapedCommand,
      timedOut,
      options,
    });

    throw returnedError;
  }

  return stdout;
}

export function useExec<T = Buffer, U = undefined>(
  command: string,
  options: {
    parseOutput?: (output: {
      stdout: Buffer;
      stderr: Buffer;
      error?: Error;
      exitCode: number | null;
      signal: NodeJS.Signals | null;
      timedOut: boolean;
      command: string;
      escapedCommand: string;
    }) => T;
    shell?: boolean;
    stripFinalNewline?: boolean;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    encoding: "buffer";
    timeout?: number;
  } & Omit<CachedPromiseOptions<() => Promise<T>, U>, "abortable">
): AsyncState<T> & {
  /**
   * Function to wrap an asynchronous update and gives some control about how the
   * `useCachedPromise`'s data should be updated.
   *
   * By default, the data will be revalidated (eg. the function will be called again)
   * after the update is done.
   *
   * **Optimistic Update**
   *
   * In an optimistic update, the UI behaves as though a change was successfully
   * completed before receiving confirmation from the server that it actually was -
   * it is being optimistic that it will eventually get the confirmation rather than an error.
   * This allows for a more responsive user experience.
   *
   * You can specify an `optimisticUpdate` function to mutate the data in order to reflect
   * the change introduced by the asynchronous update.
   *
   * When doing so, you will want to specify the `rollbackOnError` function to mutate back the
   * data if the asynchronous update fails.
   */
  mutate: MutatePromise<T | U>;
  /**
   * Function to manually call the function again
   */
  revalidate: () => void;
};
export function useExec<T = string, U = undefined>(
  command: string,
  options: {
    parseOutput?: (output: {
      stdout: string;
      stderr: string;
      error?: Error;
      exitCode: number | null;
      signal: NodeJS.Signals | null;
      timedOut: boolean;
      command: string;
      escapedCommand: string;
    }) => T;
    shell?: boolean;
    stripFinalNewline?: boolean;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    encoding?: BufferEncoding;
    timeout?: number;
  } & Omit<CachedPromiseOptions<() => Promise<T>, U>, "abortable">
): AsyncState<T> & {
  /**
   * Function to wrap an asynchronous update and gives some control about how the
   * `useCachedPromise`'s data should be updated.
   *
   * By default, the data will be revalidated (eg. the function will be called again)
   * after the update is done.
   *
   * **Optimistic Update**
   *
   * In an optimistic update, the UI behaves as though a change was successfully
   * completed before receiving confirmation from the server that it actually was -
   * it is being optimistic that it will eventually get the confirmation rather than an error.
   * This allows for a more responsive user experience.
   *
   * You can specify an `optimisticUpdate` function to mutate the data in order to reflect
   * the change introduced by the asynchronous update.
   *
   * When doing so, you will want to specify the `rollbackOnError` function to mutate back the
   * data if the asynchronous update fails.
   */
  mutate: MutatePromise<T | U>;
  /**
   * Function to manually call the function again
   */
  revalidate: () => void;
};
export function useExec<T, U = undefined>(
  command: string,
  options?: {
    parseOutput?:
      | ((output: {
          stdout: Buffer;
          stderr: Buffer;
          error?: Error;
          exitCode: number | null;
          signal: NodeJS.Signals | null;
          timedOut: boolean;
          command: string;
          escapedCommand: string;
        }) => T)
      | ((output: {
          stdout: string;
          stderr: string;
          error?: Error;
          exitCode: number | null;
          signal: NodeJS.Signals | null;
          timedOut: boolean;
          command: string;
          escapedCommand: string;
        }) => T);
    shell?: boolean;
    stripFinalNewline?: boolean;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    encoding?: BufferEncoding | "buffer";
    timeout?: number;
  } & Omit<CachedPromiseOptions<() => Promise<T>, U>, "abortable">
): AsyncState<T> & {
  /**
   * Function to wrap an asynchronous update and gives some control about how the
   * `useCachedPromise`'s data should be updated.
   *
   * By default, the data will be revalidated (eg. the function will be called again)
   * after the update is done.
   *
   * **Optimistic Update**
   *
   * In an optimistic update, the UI behaves as though a change was successfully
   * completed before receiving confirmation from the server that it actually was -
   * it is being optimistic that it will eventually get the confirmation rather than an error.
   * This allows for a more responsive user experience.
   *
   * You can specify an `optimisticUpdate` function to mutate the data in order to reflect
   * the change introduced by the asynchronous update.
   *
   * When doing so, you will want to specify the `rollbackOnError` function to mutate back the
   * data if the asynchronous update fails.
   */
  mutate: MutatePromise<T | U>;
  /**
   * Function to manually call the function again
   */
  revalidate: () => void;
} {
  const { initialData, execute, keepPreviousData, onError, parseOutput, ...execOptions } = options || {};

  const abortable = useRef<AbortController>();
  const parseOutputRef = useLatest(parseOutput || defaultParsing);

  const fn = useCallback(
    async (
      _command: string,
      options?: {
        shell?: boolean;
        stripFinalNewline?: boolean;
        cwd?: string;
        env?: NodeJS.ProcessEnv;
        encoding?: BufferEncoding | "buffer";
        timeout?: number;
      }
    ) => {
      const [file, ...args] = parseCommand(_command);
      const command = [file, ...args].join(" ");
      const escapedCommand = [file, ...args].map(escapeArg).join(" ");

      const spawned = childProcess.spawn(file, args, { ...options, signal: abortable.current?.signal });

      const spawnedPromise = getSpawnedPromise(spawned);
      const timedPromise = setupTimeout(spawned, options || {}, spawnedPromise);
      const processDone = setExitHandler(spawned, timedPromise);

      const [{ error, exitCode, signal, timedOut }, stdoutResult, stderrResult] = await getSpawnedResult(
        spawned,
        { ...options, encoding: options?.encoding === null ? "buffer" : options?.encoding || "utf8" },
        processDone
      );
      const stdout = handleOutput({ stripFinalNewline: true, ...options }, stdoutResult);
      const stderr = handleOutput({ stripFinalNewline: true, ...options }, stderrResult);

      return parseOutputRef.current({
        // @ts-expect-error too many generics, I give up
        stdout,
        // @ts-expect-error too many generics, I give up
        stderr,
        error,
        exitCode,
        signal,
        timedOut,
        command,
        escapedCommand,
        options,
      }) as T;
    },
    [parseOutputRef]
  );

  const args = useDeepMemo(execOptions);

  return useCachedPromise(fn, [command, args], { initialData, abortable, execute, keepPreviousData, onError });
}
