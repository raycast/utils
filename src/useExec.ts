/*
 * Inspired by Execa
 */

import childProcess from "node:child_process";
import { useCallback, useRef } from "react";

import { useDeepMemo } from "./useDeepMemo";
import { useCachedPromise, CachedPromiseOptions } from "./useCachedPromise";
import { useLatest } from "./useLatest";
import { UseCachedPromiseReturnType } from "./types";
import { getSpawnedPromise, getSpawnedResult } from "./exec-utils";

type ExecOptions = {
  /**
   * If `true`, runs the command inside of a shell. Uses `/bin/sh`. A different shell can be specified as a string. The shell should understand the `-c` switch.
   *
   * We recommend against using this option since it is:
   * - not cross-platform, encouraging shell-specific syntax.
   * - slower, because of the additional shell interpretation.
   * - unsafe, potentially allowing command injection.
   *
   * @default false
   */
  shell?: boolean | string;
  /**
   * Strip the final newline character from the output.
   * @default true
   */
  stripFinalNewline?: boolean;
  /**
   * Current working directory of the child process.
   * @default process.cwd()
   */
  cwd?: string;
  /**
   * Environment key-value pairs. Extends automatically from `process.env`.
   * @default process.env
   */
  env?: NodeJS.ProcessEnv;
  /**
   * Specify the character encoding used to decode the stdout and stderr output. If set to `"buffer"`, then stdout and stderr will be a Buffer instead of a string.
   *
   * @default "utf8"
   */
  encoding?: BufferEncoding | "buffer";
  /**
   * Write some input to the `stdin` of your binary.
   */
  input?: string | Buffer;
  /** If timeout is greater than `0`, the parent will send the signal `SIGTERM` if the child runs longer than timeout milliseconds. */
  timeout?: number;
};

export type ParseExecOutputHandler<T, DecodedOutput extends string | Buffer = string | Buffer> = (args: {
  /** The output of the process on stdout. */
  stdout: DecodedOutput;
  /** The output of the process on stderr. */
  stderr: DecodedOutput;
  error?: Error;
  /** The numeric exit code of the process that was run. */
  exitCode: number | null;
  /**
   * The name of the signal that was used to terminate the process. For example, SIGFPE.
   *
   * If a signal terminated the process, this property is defined. Otherwise it is null.
   */
  signal: NodeJS.Signals | null;
  /** Whether the process timed out. */
  timedOut: boolean;
  /** The command that was run, for logging purposes. */
  command: string;
  options?: ExecOptions;
}) => T;

const SPACES_REGEXP = / +/g;
function parseCommand(command: string, args?: string[]) {
  if (args) {
    return [command, ...args];
  }
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
  options,
}: {
  stdout: T;
  stderr: T;
  error?: Error;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  command: string;
  options?: ExecOptions;
}) {
  if (error || exitCode !== 0 || signal !== null) {
    const returnedError = makeError({
      error,
      exitCode,
      signal,
      stdout,
      stderr,
      command,
      timedOut,
      options,
    });

    throw returnedError;
  }

  return stdout;
}

type ExecCachedPromiseOptions<T, U> = Omit<
  CachedPromiseOptions<
    (_command: string, _args: string[], _options?: ExecOptions, input?: string | Buffer) => Promise<T>,
    U
  >,
  "abortable"
>;

/**
 * Executes a command and returns the {@link AsyncState} corresponding to the execution of the command. The last value will be kept between command runs.
 *
 * @remark When specifying the arguments via the `command` string, if the file or an argument of the command contains spaces, they must be escaped with backslashes. This matters especially if `command` is not a constant but a variable, for example with `__dirname` or `process.cwd()`. Except for spaces, no escaping/quoting is needed.
 *
 * The `shell` option must be used if the command uses shell-specific features (for example, `&&` or `||`), as opposed to being a simple file followed by its arguments.
 *
 * @example
 * ```
 * import { useExec } from '@raycast/utils';
 *
 * const Demo = () => {
 *   const { isLoading, data, revalidate } = useExec("brew", ["info", "--json=v2", "--installed"]);
 *   const results = useMemo<{}[]>(() => JSON.parse(data || "[]"), [data]);
 *
 *   return (
 *     <List isLoading={isLoading}>
 *      {(data || []).map((item) => (
 *        <List.Item key={item.id} title={item.name} />
 *      ))}
 *    </List>
 *   );
 * };
 * ```
 */
export function useExec<T = Buffer, U = undefined>(
  command: string,
  options: {
    parseOutput?: ParseExecOutputHandler<T, Buffer>;
  } & ExecOptions & {
      encoding: "buffer";
    } & ExecCachedPromiseOptions<T, U>
): UseCachedPromiseReturnType<T, U>;
export function useExec<T = string, U = undefined>(
  command: string,
  options?: {
    parseOutput?: ParseExecOutputHandler<T, string>;
  } & ExecOptions & {
      encoding?: BufferEncoding;
    } & ExecCachedPromiseOptions<T, U>
): UseCachedPromiseReturnType<T, U>;
export function useExec<T = Buffer, U = undefined>(
  file: string,
  /**
   * The arguments to pass to the file. No escaping/quoting is needed.
   *
   * If defined, the commands needs to be a file to execute. If undefined, the arguments will be parsed from the command.
   */
  args: string[],
  options: {
    parseOutput?: ParseExecOutputHandler<T, Buffer>;
  } & ExecOptions & {
      encoding: "buffer";
    } & ExecCachedPromiseOptions<T, U>
): UseCachedPromiseReturnType<T, U>;
export function useExec<T = string, U = undefined>(
  file: string,
  /**
   * The arguments to pass to the file. No escaping/quoting is needed.
   *
   * If defined, the commands needs to be a file to execute. If undefined, the arguments will be parsed from the command.
   */
  args: string[],
  options?: {
    parseOutput?: ParseExecOutputHandler<T, string>;
  } & ExecOptions & {
      encoding?: BufferEncoding;
    } & ExecCachedPromiseOptions<T, U>
): UseCachedPromiseReturnType<T, U>;
export function useExec<T, U = undefined>(
  command: string,
  optionsOrArgs?:
    | string[]
    | ({
        parseOutput?: ParseExecOutputHandler<T, Buffer> | ParseExecOutputHandler<T, string>;
      } & ExecOptions &
        ExecCachedPromiseOptions<T, U>),
  options?: {
    parseOutput?: ParseExecOutputHandler<T, Buffer> | ParseExecOutputHandler<T, string>;
  } & ExecOptions &
    ExecCachedPromiseOptions<T, U>
): UseCachedPromiseReturnType<T, U> {
  const { parseOutput, input, onData, onWillExecute, initialData, execute, keepPreviousData, onError, ...execOptions } =
    Array.isArray(optionsOrArgs) ? options || {} : optionsOrArgs || {};

  const useCachedPromiseOptions: ExecCachedPromiseOptions<T, U> = {
    initialData,
    execute,
    keepPreviousData,
    onError,
    onData,
    onWillExecute,
  };

  const args = useDeepMemo<[string[], ExecOptions, string | Buffer | undefined]>([
    Array.isArray(optionsOrArgs) ? optionsOrArgs : [],
    execOptions,
    input,
  ]);

  const abortable = useRef<AbortController>();
  const parseOutputRef = useLatest(parseOutput || defaultParsing);

  const fn = useCallback(
    async (_command: string, _args: string[], _options?: ExecOptions, input?: string | Buffer) => {
      const [file, ...args] = parseCommand(_command, _args);
      const command = [file, ...args].join(" ");

      const options = {
        stripFinalNewline: true,
        ..._options,
        signal: abortable.current?.signal,
        encoding: _options?.encoding === null ? "buffer" : _options?.encoding || "utf8",
        env: { ...process.env, ..._options?.env },
      };

      const spawned = childProcess.spawn(file, args, options);
      const spawnedPromise = getSpawnedPromise(spawned, options);

      if (input) {
        spawned.stdin.end(input);
      }

      const [{ error, exitCode, signal, timedOut }, stdoutResult, stderrResult] = await getSpawnedResult(
        spawned,
        options,
        spawnedPromise
      );
      const stdout = handleOutput(options, stdoutResult);
      const stderr = handleOutput(options, stderrResult);

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
        options,
      }) as T;
    },
    [parseOutputRef]
  );

  return useCachedPromise(fn, [command, ...args], {
    ...useCachedPromiseOptions,
    abortable,
  });
}
