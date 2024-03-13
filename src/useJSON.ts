import { environment } from "@raycast/api";
import fetch from "cross-fetch";
import { createReadStream, createWriteStream, mkdirSync, Stats } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { useCallback, useEffect, useRef, useState } from "react";
import Chain from "stream-chain";
import { parser } from "stream-json";
import StreamArray from "stream-json/streamers/StreamArray";
import { isJSON } from "./fetch-utils";

async function maybeCacheURL(url: string, folder: string, fileName: string) {
  let shouldUpdate = false;

  try {
    await stat(folder);
  } catch (e) {
    console.log(`Cache folder ${folder} doesn't exist, will be created.`);
    mkdirSync(folder, { recursive: true });
  }

  const destination = join(folder, fileName);
  let stats: Stats | undefined = undefined;
  try {
    stats = await stat(destination);
  } catch (e) {
    shouldUpdate = true;
  }

  const headResponse = await fetch(url, { method: "HEAD" });
  if (!headResponse.ok) {
    throw new Error("Failed to fetch URL");
  }

  if (!isJSON(headResponse.headers.get("content-type"))) {
    throw new Error("URL does not return JSON");
  }

  const lastModified = Date.parse(headResponse.headers.get("last-modified") ?? "");
  if (!stats || stats.size === 0 || isNaN(lastModified) || lastModified > stats.mtimeMs) {
    shouldUpdate = true;
  }

  if (!shouldUpdate) {
    return;
  }

  console.log(`${destination}: cache stale, will be updated from ${url}.`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch URL");
  }

  if (!isJSON(response.headers.get("content-type"))) {
    throw new Error("URL does not return JSON");
  }
  if (!response.body) {
    throw new Error("Failed to retrieve expected JSON content: Response body is missing or inaccessible.");
  }
  await pipeline(response.body as unknown as NodeJS.ReadableStream, createWriteStream(destination));
}

async function* streamJsonFile<T>(
  filePath: string,
  pageSize: number,
  abortSignal?: AbortSignal,
  filterFn?: (item: T) => boolean,
): AsyncGenerator<T[]> {
  let page: T[] = [];
  const fileStream = createReadStream(filePath);
  const jsonParser = parser();
  const arrayParser = new StreamArray();

  const pipeline = new Chain([fileStream, jsonParser, arrayParser]);

  fileStream.on("error", (error) => {
    console.log("File stream error", error);
    pipeline.destroy();
  });
  jsonParser.on("error", (error) => {
    console.log("JSON Parser error", error);
    pipeline.destroy();
  });
  arrayParser.on("error", (error) => {
    console.log("Array Parser error", error);
    pipeline.destroy();
  });

  abortSignal?.addEventListener("abort", () => {
    pipeline.destroy();
  });

  try {
    for await (const data of pipeline) {
      if (abortSignal?.aborted) {
        break;
      }

      if (!filterFn || filterFn(data.value)) {
        page.push(data.value);
      }
      if (page.length >= pageSize) {
        yield page;
        page = [];
      }
    }
    if (page.length > 0) {
      yield page;
    }
  } catch (e) {
    console.log("aborted?");
    pipeline.destroy();
  }
}

type Options<T> = {
  fileName?: string;
  filter?: (item: T) => boolean;
  folder?: string;
  pageSize?: number;
};

export function useJSON<T>(urlOrPath: string, options?: Options<T>) {
  const [state, setState] = useState<{ data: T[]; isLoading: boolean }>({ data: [], isLoading: true });
  const generatorRef = useRef<AsyncGenerator<T[]> | null>(null);

  const hasMoreRef = useRef(false);
  const pageSizeRef = useRef(options?.pageSize ?? 30);
  const onLoadMore = useCallback(() => {
    if (!hasMoreRef.current) {
      return;
    }
    setState((p) => ({ ...p, isLoading: true }));
    generatorRef.current?.next().then(({ done, value }) => {
      hasMoreRef.current = !done;
      setState((p) => ({ data: [...p.data, ...(value || [])], isLoading: false }));
    });
  }, [generatorRef, hasMoreRef]);

  const filter = options?.filter;
  const folder = options?.folder ?? environment.supportPath;
  const fileName = `${options?.fileName?.replace(/\.json$/, "") ?? "cache"}.json`;

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setState({ data: [], isLoading: true });
      await maybeCacheURL(urlOrPath, folder, fileName);
      generatorRef.current = streamJsonFile(join(folder, fileName), pageSizeRef.current, controller.signal, filter);
      const { value: newData, done } = await generatorRef.current.next();
      hasMoreRef.current = !done;
      setState({ data: newData ?? [], isLoading: false });
    })();

    return () => {
      controller.abort();
    };
  }, [urlOrPath, filter, pageSizeRef, folder, fileName]);

  const pagination = { hasMore: hasMoreRef.current, pageSize: pageSizeRef.current, onLoadMore };

  return { ...state, pagination };
}
