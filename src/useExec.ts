/*
 * Inspired by Execa
 */

import { useCallback, useRef } from "react";

import { useCachedPromise, CachedPromiseOptions } from "./useCachedPromise";
import { useLatest } from "./useLatest";
import { UseCachedPromiseReturnType } from "./types";
import { baseExec, defaultParsing, ExecOptions, ParseExecOutputHandler } from "./exec-utils";

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
    } & ExecCachedPromiseOptions<T, U>,
): UseCachedPromiseReturnType<T, U>;
export function useExec<T = string, U = undefined>(
  command: string,
  options?: {
    parseOutput?: ParseExecOutputHandler<T, string, ExecOptions>;
  } & ExecOptions & {
      encoding?: BufferEncoding;
    } & ExecCachedPromiseOptions<T, U>,
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
    } & ExecCachedPromiseOptions<T, U>,
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
    } & ExecCachedPromiseOptions<T, U>,
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
    ExecCachedPromiseOptions<T, U>,
): UseCachedPromiseReturnType<T, U> {
  const {
    parseOutput,
    input,
    onData,
    onWillExecute,
    initialData,
    execute,
    keepPreviousData,
    onError,
    failureToastOptions,
    ...execOptions
  } = Array.isArray(optionsOrArgs) ? options || {} : optionsOrArgs || {};

  const useCachedPromiseOptions: ExecCachedPromiseOptions<T, U> = {
    initialData,
    execute,
    keepPreviousData,
    onError,
    onData,
    onWillExecute,
    failureToastOptions,
  };

  const abortable = useRef<AbortController>(null);
  const parseOutputRef = useLatest(parseOutput || defaultParsing);

  const fn = useCallback(
    async (_command: string, _args: string[], _options?: ExecOptions, input?: string | Buffer) => {
      return baseExec<T>(_command, _args, {
        ..._options,
        input,
        signal: abortable.current?.signal ?? undefined,
        parseOutput: parseOutputRef.current as ParseExecOutputHandler<T, string | Buffer, ExecOptions>,
      });
    },
    [parseOutputRef],
  );

  // @ts-expect-error T can't be a Promise so it's actually the same
  return useCachedPromise(fn, [command, Array.isArray(optionsOrArgs) ? optionsOrArgs : [], execOptions, input], {
    ...useCachedPromiseOptions,
    abortable,
  });
}
