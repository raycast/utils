import { baseExec, ExecOptions, ParseExecOutputHandler } from "./exec-utils";

/**
 * Executes a command and returns a Promise that resolves with its parsed output. This is the
 * imperative sibling of {@link useExec}, for use outside of React render (AI tools, `no-view`
 * commands, scripts).
 *
 * Like `useExec`, it resolves the command across the OS so the same call works on macOS, Linux, and
 * Windows: on Windows it finds `.cmd`/`.bat` shims via `PATHEXT` (so `npx` resolves to `npx.cmd`
 * instead of throwing `ENOENT`) and escapes arguments correctly, without needing `shell: true`.
 *
 * @remark When specifying the arguments via the `command` string, if the file or an argument of the command contains spaces, they must be escaped with backslashes. This matters especially if `command` is not a constant but a variable, for example with `__dirname` or `process.cwd()`. Except for spaces, no escaping/quoting is needed.
 *
 * The `shell` option must be used if the command uses shell-specific features (for example, `&&` or `||`), as opposed to being a simple file followed by its arguments.
 *
 * @example
 * ```typescript
 * import { exec } from "@raycast/utils";
 *
 * export default async function () {
 *   const output = await exec("brew", ["info", "--json=v2", "--installed"]);
 *   const formulae = JSON.parse(output).formulae;
 *   // ...
 * }
 * ```
 */
type ExecImperativeOptions = ExecOptions & {
  /**
   * A Signal object that allows you to abort the command if required via an AbortController object.
   */
  signal?: AbortSignal;
};

export async function exec<T = string>(
  command: string,
  options?: {
    parseOutput?: ParseExecOutputHandler<T, string, ExecOptions>;
  } & ExecImperativeOptions & { encoding?: BufferEncoding },
): Promise<T>;
export async function exec<T = Buffer>(
  command: string,
  options: {
    parseOutput?: ParseExecOutputHandler<T, Buffer, ExecOptions>;
  } & ExecImperativeOptions & { encoding: "buffer" },
): Promise<T>;
export async function exec<T = string>(
  file: string,
  /**
   * The arguments to pass to the file. No escaping/quoting is needed.
   */
  args: string[],
  options?: {
    parseOutput?: ParseExecOutputHandler<T, string, ExecOptions>;
  } & ExecImperativeOptions & { encoding?: BufferEncoding },
): Promise<T>;
export async function exec<T = Buffer>(
  file: string,
  /**
   * The arguments to pass to the file. No escaping/quoting is needed.
   */
  args: string[],
  options: {
    parseOutput?: ParseExecOutputHandler<T, Buffer, ExecOptions>;
  } & ExecImperativeOptions & { encoding: "buffer" },
): Promise<T>;
export async function exec<T = string>(
  command: string,
  optionsOrArgs?:
    | string[]
    | ({
        parseOutput?: ParseExecOutputHandler<T, Buffer, ExecOptions> | ParseExecOutputHandler<T, string, ExecOptions>;
      } & ExecImperativeOptions),
  options?: {
    parseOutput?: ParseExecOutputHandler<T, Buffer, ExecOptions> | ParseExecOutputHandler<T, string, ExecOptions>;
  } & ExecImperativeOptions,
): Promise<T> {
  const args = Array.isArray(optionsOrArgs) ? optionsOrArgs : undefined;
  const execOptions = (Array.isArray(optionsOrArgs) ? options : optionsOrArgs) ?? {};

  return baseExec<T>(command, args, {
    ...execOptions,
    parseOutput: execOptions.parseOutput as ParseExecOutputHandler<T, string | Buffer, ExecOptions>,
  });
}
