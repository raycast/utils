/*
 * Inspired by Execa
 */

import childProcess from "node:child_process";
import { useCallback, useRef } from "react";

import { useCachedPromise, CachedPromiseOptions } from "./useCachedPromise";
import { useLatest } from "./useLatest";
import { UseCachedPromiseReturnType } from "./types";
import {
  getSpawnedPromise,
  getSpawnedResult,
  handleOutput,
  defaultParsing,
  ParseExecOutputHandler,
} from "./exec-utils";

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
  /** If timeout is greater than `0`, the parent will send the signal `SIGTERM` if the child runs longer than timeout milliseconds.
   *
   * @default 10000
   */
  timeout?: number;
};

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
 * export default function Command() {
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
    parseOutput?: ParseExecOutputHandler<T, Buffer, ExecOptions>;
  } & ExecOptions & {
      encoding: "buffer";
    } & ExecCachedPromiseOptions<T, U>
): UseCachedPromiseReturnType<T, U>;
export function useExec<T = string, U = undefined>(
  command: string,
  options?: {
    parseOutput?: ParseExecOutputHandler<T, string, ExecOptions>;
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
    parseOutput?: ParseExecOutputHandler<T, Buffer, ExecOptions>;
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
    parseOutput?: ParseExecOutputHandler<T, string, ExecOptions>;
  } & ExecOptions & {
      encoding?: BufferEncoding;
    } & ExecCachedPromiseOptions<T, U>
): UseCachedPromiseReturnType<T, U>;
export function useExec<T, U = undefined>(
  command: string,
  optionsOrArgs?:
    | string[]
    | ({
        parseOutput?: ParseExecOutputHandler<T, Buffer, ExecOptions> | ParseExecOutputHandler<T, string, ExecOptions>;
      } & ExecOptions &
        ExecCachedPromiseOptions<T, U>),
  options?: {
    parseOutput?: ParseExecOutputHandler<T, Buffer, ExecOptions> | ParseExecOutputHandler<T, string, ExecOptions>;
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

  const abortable = useRef<AbortController>();
  const parseOutputRef = useLatest(parseOutput || defaultParsing);

  const fn = useCallback(
    async (_command: string, _args: string[], _options?: ExecOptions, input?: string | Buffer) => {
      const [file, ...args] = parseCommand(_command, _args);
      const command = [file, ...args].join(" ");

      const options = {
        stripFinalNewline: true,
        ..._options,
        timeout: _options?.timeout || 10000,
        signal: abortable.current?.signal,
        encoding: _options?.encoding === null ? "buffer" : _options?.encoding || "utf8",
        env: { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", ...process.env, ..._options?.env },
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
        parentError: new Error(),
      }) as T;
    },
    [parseOutputRef]
  );

  // @ts-expect-error T can't be a Promise so it's actually the same
  return useCachedPromise(fn, [command, Array.isArray(optionsOrArgs) ? optionsOrArgs : [], execOptions, input], {
    ...useCachedPromiseOptions,
    abortable,
  });
}
