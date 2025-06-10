import childProcess from "node:child_process";
import {
  defaultParsing,
  getSpawnedPromise,
  getSpawnedResult,
  handleOutput,
  ParseExecOutputHandler,
} from "./exec-utils";

type PowerShellScriptOptions = {
  /**
   * A Signal object that allows you to abort the request if required via an AbortController object.
   */
  signal?: AbortSignal;
  /** If timeout is greater than `0`, the parent will send the signal `SIGTERM` if the child runs longer than timeout milliseconds.
   *
   * @default 10000
   */
  timeout?: number;
};

/**
 * Executes a PowerShell script.
 *
 * @example
 * ```typescript
 * import { showHUD } from "@raycast/api";
 * import { runPowerShellScript, showFailureToast } from "@raycast/utils";
 *
 * export default async function () {
 *   try {
 *     const res = await runPowerShellScript(
 *       `
 *       on run argv
 *         return "hello, " & item 1 of argv & "."
 *       end run
 *       `,
 *       ["world"]
 *     );
 *     await showHUD(res);
 *   } catch (error) {
 *     showFailureToast(error, { title: "Could not run PowerShell" });
 *   }
 * }
 * ```
 */
export async function runPowerShellScript<T = string>(
  script: string,
  options?: PowerShellScriptOptions & {
    parseOutput?: ParseExecOutputHandler<T, string, PowerShellScriptOptions>;
  },
): Promise<string>;
export async function runPowerShellScript<T = string>(
  script: string,
  /**
   * The arguments to pass to the script.
   */
  args: string[],
  options?: PowerShellScriptOptions & {
    parseOutput?: ParseExecOutputHandler<T, string, PowerShellScriptOptions>;
  },
): Promise<string>;
export async function runPowerShellScript<T = string>(
  script: string,
  optionsOrArgs?:
    | string[]
    | (PowerShellScriptOptions & {
        parseOutput?: ParseExecOutputHandler<T, string, PowerShellScriptOptions>;
      }),
  options?: PowerShellScriptOptions & {
    parseOutput?: ParseExecOutputHandler<T, string, PowerShellScriptOptions>;
  },
): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("PowerShell is only supported on Windows");
  }

  const { timeout, ...execOptions } = Array.isArray(optionsOrArgs) ? options || {} : optionsOrArgs || {};

  const outputArguments = ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"];
  if (Array.isArray(optionsOrArgs)) {
    outputArguments.push(...optionsOrArgs);
  }

  const spawned = childProcess.spawn("powershell.exe", outputArguments, {
    ...execOptions,
  });
  const spawnedPromise = getSpawnedPromise(spawned, { timeout: timeout ?? 10000 });

  spawned.stdin.end(script);

  const [{ error, exitCode, signal, timedOut }, stdoutResult, stderrResult] = await getSpawnedResult<string>(
    spawned,
    { encoding: "utf8" },
    spawnedPromise,
  );
  const stdout = handleOutput({ stripFinalNewline: true }, stdoutResult);
  const stderr = handleOutput({ stripFinalNewline: true }, stderrResult);

  return defaultParsing({
    stdout,
    stderr,
    error,
    exitCode,
    signal,
    timedOut,
    command: "powershell.exe",
    options,
    parentError: new Error(),
  });
}
