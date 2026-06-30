import childProcess from "node:child_process";
import { constants as BufferConstants } from "node:buffer";
import Stream from "node:stream";
import { promisify } from "node:util";
import crossSpawn from "cross-spawn";
import { onExit } from "./vendors/signal-exit";

export type ExecOptions = {
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

export type SpawnedPromise = Promise<{
  exitCode: number | null;
  error?: Error;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}>;

export function getSpawnedPromise(
  spawned: childProcess.ChildProcessWithoutNullStreams,
  { timeout }: { timeout?: number } = {},
): SpawnedPromise {
  const spawnedPromise: SpawnedPromise = new Promise((resolve, reject) => {
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

  const removeExitHandler = onExit(() => {
    spawned.kill();
  });

  if (timeout === 0 || timeout === undefined) {
    return spawnedPromise.finally(() => removeExitHandler());
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

  return Promise.race([timeoutPromise, safeSpawnedPromise]).finally(() => removeExitHandler());
}

class MaxBufferError extends Error {
  constructor() {
    super("The output is too big");
    this.name = "MaxBufferError";
  }
}

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
  options: { encoding: BufferEncoding | "buffer" },
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
        await promisify(Stream.pipeline)(inputStream, stream);
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

export async function getSpawnedResult<T extends string | Buffer>(
  { stdout, stderr }: childProcess.ChildProcessWithoutNullStreams,
  { encoding }: { encoding: BufferEncoding | "buffer" },
  processDone: SpawnedPromise,
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

export function handleOutput<T extends string | Buffer>(options: { stripFinalNewline?: boolean }, value: T) {
  if (options.stripFinalNewline) {
    return stripFinalNewline(value);
  }

  return value;
}

function getErrorPrefix({
  timedOut,
  timeout,
  signal,
  exitCode,
}: {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  timeout?: number;
}) {
  if (timedOut) {
    return `timed out after ${timeout} milliseconds`;
  }

  if (signal !== undefined && signal !== null) {
    return `was killed with ${signal}`;
  }

  if (exitCode !== undefined && exitCode !== null) {
    return `failed with exit code ${exitCode}`;
  }

  return "failed";
}

function makeError({
  stdout,
  stderr,
  error,
  signal,
  exitCode,
  command,
  timedOut,
  options,
  parentError,
}: {
  stdout: string | Buffer;
  stderr: string | Buffer;
  error?: Error;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  command: string;
  options?: { timeout?: number };
  parentError: Error;
}) {
  const prefix = getErrorPrefix({ timedOut, timeout: options?.timeout, signal, exitCode });
  const execaMessage = `Command ${prefix}: ${command}`;
  const shortMessage = error ? `${execaMessage}\n${error.message}` : execaMessage;
  const message = [shortMessage, stderr, stdout].filter(Boolean).join("\n");

  if (error) {
    // @ts-expect-error not on Error
    error.originalMessage = error.message;
  } else {
    error = parentError;
  }

  error.message = message;

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
}

export type ParseExecOutputHandler<
  T,
  DecodedOutput extends string | Buffer = string | Buffer,
  Options = unknown,
> = (args: {
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
  options?: Options;
}) => T;

export function defaultParsing<T extends string | Buffer>({
  stdout,
  stderr,
  error,
  exitCode,
  signal,
  timedOut,
  command,
  options,
  parentError,
}: {
  stdout: T;
  stderr: T;
  error?: Error;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  command: string;
  options?: { timeout?: number };
  parentError: Error;
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
      parentError,
    });

    throw returnedError;
  }

  return stdout;
}

const SPACES_REGEXP = / +/g;
export function parseCommand(command: string, args?: string[]) {
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

/**
 * Cross-OS-correct command execution shared by `useExec` and the imperative `exec`.
 *
 * Uses `cross-spawn` in place of `childProcess.spawn` so commands resolve across `PATH` + `PATHEXT`
 * (finding `.cmd`/`.bat` shims like `npx.cmd`), read `PATH` under its real case-insensitive key, and
 * are escaped correctly when Windows routes them through `cmd.exe`, without the injection hazards of
 * `shell: true`. On macOS/Linux `cross-spawn` delegates straight to `childProcess.spawn`, so behavior
 * there is unchanged.
 */
export async function baseExec<T = string>(
  _command: string,
  _args?: string[],
  _options?: ExecOptions & {
    parseOutput?: ParseExecOutputHandler<T, string | Buffer, ExecOptions>;
    /**
     * A Signal object that allows you to abort the command if required via an AbortController object.
     */
    signal?: AbortSignal;
  },
): Promise<T> {
  const { parseOutput, input, signal, ...execOptions } = _options ?? {};
  const [file, ...args] = parseCommand(_command, _args);
  const command = [file, ...args].join(" ");

  const options = {
    stripFinalNewline: true,
    ...execOptions,
    timeout: execOptions.timeout || 10000,
    signal,
    encoding: execOptions.encoding || "utf8",
    env: {
      // The default Unix `PATH` is meaningless on Windows and would collide with `process.env.Path`.
      ...(process.platform === "win32" ? {} : { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" }),
      ...process.env,
      ...execOptions.env,
    },
  };

  const spawned = crossSpawn(file, args, options) as childProcess.ChildProcessWithoutNullStreams;
  const spawnedPromise = getSpawnedPromise(spawned, options);

  if (input) {
    spawned.stdin.end(input);
  }

  const [{ error, exitCode, signal: exitSignal, timedOut }, stdoutResult, stderrResult] = await getSpawnedResult(
    spawned,
    options,
    spawnedPromise,
  );
  const stdout = handleOutput(options, stdoutResult);
  const stderr = handleOutput(options, stderrResult);

  const parse = parseOutput ?? (defaultParsing as ParseExecOutputHandler<T, string | Buffer, ExecOptions>);
  const parseArgs = {
    stdout,
    stderr,
    error,
    exitCode,
    signal: exitSignal,
    timedOut,
    command,
    options,
    parentError: new Error(),
  };

  return parse(parseArgs) as T;
}
