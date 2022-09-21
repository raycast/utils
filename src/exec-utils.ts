import childProcess from "node:child_process";
import { constants as BufferConstants } from "node:buffer";
import Stream from "node:stream";
import { promisify } from "node:util";
import onExit from "signal-exit";

export type SpawnedPromise = Promise<{
  exitCode: number | null;
  error?: Error;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}>;

export function getSpawnedPromise(
  spawned: childProcess.ChildProcessWithoutNullStreams,
  { timeout }: { timeout?: number } = {}
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

  const removeExitHandler = onExit(() => {
    spawned.kill();
  });

  return Promise.race([timeoutPromise, safeSpawnedPromise]).finally(() => removeExitHandler());
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

export async function getSpawnedResult<T extends string | Buffer>(
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
