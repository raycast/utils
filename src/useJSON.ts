import { environment } from "@raycast/api";
import fetch from "cross-fetch";
import { createReadStream, createWriteStream, mkdirSync, Stats } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import { pipeline } from "node:stream/promises";
import { useRef } from "react";
import Chain from "stream-chain";
import { parser } from "stream-json";
import StreamArray from "stream-json/streamers/StreamArray";
import { isJSON } from "./fetch-utils";
import { CachedPromiseOptions, useCachedPromise } from "./useCachedPromise";
import { FunctionReturningPaginatedPromise, UseCachedPromiseReturnType } from "./types";

async function cache(url: RequestInfo, destination: string, fetchOptions?: RequestInit) {
  if (typeof url === "object" || url.startsWith("http://") || url.startsWith("https://")) {
    return await cacheURL(url, destination, fetchOptions);
  } else if (url.startsWith("file://") && url.endsWith(".json")) {
    return await cacheFile(
      normalize(decodeURIComponent(new URL(url).pathname)),
      destination,
      fetchOptions?.signal ? fetchOptions.signal : undefined,
    );
  } else {
    throw new Error("Only HTTP(S) or file URLs with the 'json' extension  are supported");
  }
}

async function cacheURL(url: RequestInfo, destination: string, fetchOptions?: RequestInit) {
  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    throw new Error("Failed to fetch URL");
  }

  if (!isJSON(response.headers.get("content-type"))) {
    throw new Error("URL does not return JSON");
  }
  if (!response.body) {
    throw new Error("Failed to retrieve expected JSON content: Response body is missing or inaccessible.");
  }
  await pipeline(
    response.body as unknown as NodeJS.ReadableStream,
    createWriteStream(destination),
    fetchOptions?.signal ? { signal: fetchOptions.signal } : undefined,
  );
}

async function cacheFile(source: string, destination: string, abortSignal?: AbortSignal) {
  await pipeline(
    createReadStream(source),
    createWriteStream(destination),
    abortSignal ? { signal: abortSignal } : undefined,
  );
}

async function cacheURLIfNecessary(url: RequestInfo, folder: string, fileName: string, fetchOptions?: RequestInit) {
  const destination = join(folder, fileName);

  try {
    await stat(folder);
  } catch (e) {
    mkdirSync(folder, { recursive: true });
    await cache(url, destination, fetchOptions);
    return;
  }

  let stats: Stats | undefined = undefined;
  try {
    stats = await stat(destination);
  } catch (e) {
    await cache(url, destination, fetchOptions);
    return;
  }

  if (typeof url === "object" || url.startsWith("http://") || url.startsWith("https://")) {
    const headResponse = await fetch(url, { ...fetchOptions, method: "HEAD" });
    if (!headResponse.ok) {
      throw new Error("Could not fetch URL");
    }

    if (!isJSON(headResponse.headers.get("content-type"))) {
      throw new Error("URL does not return JSON");
    }

    const lastModified = Date.parse(headResponse.headers.get("last-modified") ?? "");
    if (stats.size === 0 || isNaN(lastModified) || lastModified > stats.mtimeMs) {
      await cache(url, destination, fetchOptions);
      return;
    }
  } else if (url.startsWith("file://") && url.endsWith(".json")) {
    try {
      const sourceStats = await stat(normalize(decodeURIComponent(new URL(url).pathname)));
      if (sourceStats.mtimeMs > stats.mtimeMs) {
        await cache(url, destination, fetchOptions);
      }
    } catch (e) {
      throw new Error("Source file could not be read");
    }
  } else {
    throw new Error("Only HTTP(S) or file URLs with the 'json' extension  are supported");
  }
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

  fileStream.on("error", (_error) => {
    pipeline.destroy();
  });
  jsonParser.on("error", (_error) => {
    pipeline.destroy();
  });
  arrayParser.on("error", (_error) => {
    pipeline.destroy();
  });
  abortSignal?.addEventListener("abort", () => {
    pipeline.destroy();
  });

  try {
    for await (const data of pipeline) {
      if (abortSignal?.aborted) {
        return [];
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
    pipeline.destroy();
    return [];
  }
}

type Options<T> = {
  /**
   * The name of the file where the JSON will be cached.
   * Defaults to `cache.json`.
   */
  fileName?: string;
  /**
   * The folder where the cache file should be saved.
   * Defaults to the extension's support `environment.supportPath`.
   *
   * @remark If the folder doesn't exist, the hook will try to create it, and any intermediate folders.
   */
  folder?: string;
  /**
   * A function to decide whether a particular item should be kept or not.
   * Defaults to `undefined`.
   *
   * @remark The hook will revalidate every time the filter function changes, so you need to use [useCallback](https://react.dev/reference/react/useCallback) to make sure it only changes when it needs to.
   */
  filter?: (item: T) => boolean;
  /**
   * The amount of items to return for each page.
   * Defaults to `20`.
   */
  pageSize?: number;
};

/**
 * Takes a `http://`, `https://` or `file:///` URL pointing to a JSON resource, caches it to the command's support
 * folder, and streams through its content. Useful when dealing with large JSON arrays which would be too big to fit
 * in the command's memory.
 *
 * @remark The JSON resource needs to consist of an array of objects
 *
 * @example
 * ```
 * import { List } from "@raycast/api";
 * import { useJSON } from "@raycast/utils";
 *
 * type Formula = { name: string; desc?: string };
 *
 * export default function Main(): JSX.Element {
 *   const { data, isLoading, pagination } = useJSON<Formula>("https://formulae.brew.sh/api/formula.json");
 *
 *   return (
 *     <List isLoading={isLoading} pagination={pagination}>
 *       <List.Section title="Formulae">
 *         {data?.map((d) => <List.Item key={d.name} title={d.name} subtitle={d.desc} />)}
 *       </List.Section>
 *     </List>
 *   );
 * }
 * ```
 *
 * @example
 * ```
 * import { List } from "@raycast/api";
 * import { useJSON } from "@raycast/utils";
 * import { homedir } from "os";
 * import { join } from "path";
 *
 * type Formula = { name: string; desc?: string };
 *
 * export default function Main(): JSX.Element {
 *   const { data, isLoading, pagination } = useJSON<Formula>(`file:///${join(homedir(), "Downloads", "formulae.json")}`);
 *
 *   return (
 *     <List isLoading={isLoading} pagination={pagination}>
 *       <List.Section title="Formulae">
 *         {data?.map((d) => <List.Item key={d.name} title={d.name} subtitle={d.desc} />)}
 *       </List.Section>
 *     </List>
 *   );
 * }
 * ```
 */
export function useJSON<T, U = unknown>(url: RequestInfo): UseCachedPromiseReturnType<T[], U>;

/**
 * Takes a `http://`, `https://` or `file:///` URL pointing to a JSON resource, caches it to the command's support
 * folder, and streams through its content. Useful when dealing with large JSON arrays which would be too big to fit
 * in the command's memory.
 *
 * @remark The JSON resource needs to consist of an array of objects
 *
 * @example
 * ```
 * import { List, environment } from "@raycast/api";
 * import { useJSON } from "@raycast/utils";
 * import { join } from 'path';
 * import { useCallback, useState } from "react";
 *
 * type Formula = { name: string; desc?: string };
 *
 * export default function Main(): JSX.Element {
 *   const [searchText, setSearchText] = useState("");
 *
 *   const formulaFilter = useCallback(
 *     (item: Formula) => {
 *       if (!searchText) return true;
 *       return item.name.toLocaleLowerCase().includes(searchText);
 *     },
 *     [searchText],
 *   );
 *
 *   const { data, isLoading, pagination } = useJSON("https://formulae.brew.sh/api/formula.json", {
 *     initialData: [] as Formula[],
 *     pageSize: 20,
 *     folder: join(environment.supportPath, "cache"),
 *     fileName: "formulae",
 *     filter: formulaFilter,
 *   });
 *
 *   return (
 *     <List isLoading={isLoading} pagination={pagination} onSearchTextChange={setSearchText}>
 *       <List.Section title="Formulae">
 *         {data.map((d) => (
 *           <List.Item key={d.name} title={d.name} subtitle={d.desc} />
 *         ))}
 *       </List.Section>
 *     </List>
 *   );
 * }
 * ``` support folder, and streams through its content.
 *
 * @example
 * ```
 * import { List, environment } from "@raycast/api";
 * import { useJSON } from "@raycast/utils";
 * import { join } from "path";
 * import { homedir } from "os";
 * import { useCallback, useState } from "react";
 *
 * type Formula = { name: string; desc?: string };
 *
 * export default function Main(): JSX.Element {
 *   const [searchText, setSearchText] = useState("");
 *
 *   const formulaFilter = useCallback(
 *     (item: Formula) => {
 *       if (!searchText) return true;
 *       return item.name.toLocaleLowerCase().includes(searchText);
 *     },
 *     [searchText],
 *   );
 *
 *   const { data, isLoading, pagination } = useJSON(`file:///${join(homedir(), "Downloads", "formulae.json")}`, {
 *     initialData: [] as Formula[],
 *     pageSize: 20,
 *     folder: join(environment.supportPath, "cache"),
 *     fileName: "formulae",
 *     filter: formulaFilter,
 *   });
 *
 *   return (
 *     <List isLoading={isLoading} pagination={pagination} onSearchTextChange={setSearchText}>
 *       <List.Section title="Formulae">
 *         {data.map((d) => (
 *           <List.Item key={d.name} title={d.name} subtitle={d.desc} />
 *         ))}
 *       </List.Section>
 *     </List>
 *   );
 * }
 * ```
 */
export function useJSON<T, U extends any[] = any[]>(
  url: RequestInfo,
  options: Options<T> & RequestInit & Omit<CachedPromiseOptions<FunctionReturningPaginatedPromise, U>, "abortable">,
): UseCachedPromiseReturnType<T[], U>;

export function useJSON<T, U extends any[] = any[]>(
  url: RequestInfo,
  options?: Options<T> & RequestInit & Omit<CachedPromiseOptions<FunctionReturningPaginatedPromise, U>, "abortable">,
): UseCachedPromiseReturnType<T[], U> {
  const {
    initialData,
    execute,
    keepPreviousData,
    onError,
    onData,
    onWillExecute,
    fileName,
    filter,
    folder = environment.supportPath,
    pageSize = 20,
    ...fetchOptions
  } = options ?? {};

  const useCachedPromiseOptions: CachedPromiseOptions<FunctionReturningPaginatedPromise, U> = {
    initialData,
    execute,
    keepPreviousData,
    onError,
    onData,
    onWillExecute,
  };

  const generatorRef = useRef<AsyncGenerator<T[]> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const hasMoreRef = useRef(false);

  return useCachedPromise(
    (
      url: RequestInfo,
      pageSize: number,
      folder: string,
      fileName: string,
      fetchOptions: RequestInit | undefined,
      filter: ((item: T) => boolean) | undefined,
    ) =>
      async ({ page }) => {
        if (page === 0) {
          controllerRef.current?.abort();
          controllerRef.current = new AbortController();
          await cacheURLIfNecessary(url, folder, fileName, { ...fetchOptions, signal: controllerRef.current?.signal });
          const destination = join(folder, fileName);
          generatorRef.current = streamJsonFile(destination, pageSize, controllerRef.current?.signal, filter);
        }
        if (!generatorRef.current) {
          return { hasMore: hasMoreRef.current, data: [] };
        }
        const { value: newData, done } = await generatorRef.current.next();
        hasMoreRef.current = !done;
        return { hasMore: hasMoreRef.current, data: (newData ?? []) as T[] };
      },
    [url, pageSize, folder, `${fileName?.replace(/\.json$/, "") ?? "cache"}.json`, fetchOptions, filter],
    useCachedPromiseOptions,
  );
}
