import fetch from "cross-fetch";
import { createReadStream, ReadStream } from "node:fs";
import { normalize } from "node:path";
import { useRef } from "react";
import Chain from "stream-chain";
import { parser } from "stream-json";
import Pick from "stream-json/filters/Pick";
import StreamArray from "stream-json/streamers/StreamArray";
import { isJSON } from "./fetch-utils";
import { FunctionReturningPaginatedPromise, UseCachedPromiseReturnType } from "./types";
import { CachedPromiseOptions, useCachedPromise } from "./useCachedPromise";

async function getStream(url: RequestInfo, options?: RequestInit): Promise<ReadStream> {
  if (typeof url === "object" || url.startsWith("http://") || url.startsWith("https://")) {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error("Failed to fetch URL");
    }

    if (!isJSON(response.headers.get("content-type"))) {
      throw new Error("URL does not return JSON");
    }
    if (!response.body) {
      throw new Error("Failed to retrieve expected JSON content: Response body is missing or inaccessible.");
    }
    return response.body as unknown as ReadStream;
  } else if (url.startsWith("file://")) {
    return createReadStream(normalize(decodeURIComponent(new URL(url).pathname)));
  } else {
    throw new Error("Only HTTP(S) or file URLs are supported");
  }
}

async function* streamJsonFile<T>(
  stream: ReadStream,
  pageSize: number,
  abortSignal?: AbortSignal,
  dataPath?: string,
  filterFn?: (item: T) => boolean,
  transformFn?: (item: any) => T,
): AsyncGenerator<T[]> {
  let page: T[] = [];

  const pipeline = new Chain([stream, dataPath ? Pick.withParser({ filter: dataPath }) : parser(), new StreamArray()]);

  abortSignal?.addEventListener("abort", () => {
    pipeline.destroy();
  });

  try {
    for await (const data of pipeline) {
      if (abortSignal?.aborted) {
        return [];
      }

      const value = transformFn?.(data.value) ?? data.value;
      if (!filterFn || filterFn(value)) {
        page.push(value);
      }
      if (page.length >= pageSize) {
        yield page;
        page = [];
      }
    }
  } catch (e) {
    pipeline.destroy();
    return [];
  }

  if (page.length > 0) {
    yield page;
  }

  return [];
}

type Options<T> = {
  /**
   * The hook expects to iterate through an array of data, so by default, it assumes the JSON it receives itself represents an array. However, sometimes the array of data is wrapped in an object,
   * i.e. `{ "success": true, "data": […] }`, or even `{ "success": true, "results": { "data": […] } }`. In those cases, you can use `dataPath` to specify where the data array can be found.
   *
   * @example For `{ "success": true, "data": […] }`, dataPath would be `data`
   * @example For `{ "success": true, "results": { "data": […] } }`, dataPath would be `results.data`
   */
  dataPath?: string;
  /**
   * A function to decide whether a particular item should be kept or not.
   * Defaults to `undefined`, keeping any encountered item.
   *
   * @remark The hook will revalidate every time the filter function changes, so you need to use [useCallback](https://react.dev/reference/react/useCallback) to make sure it only changes when it needs to.
   */
  filter?: (item: T) => boolean;
  /**
   * A function to apply to each item before passing it to `filter`. Useful for ensuring that all items have the expected properties, and, as on optimization, for getting rid of the properties that you don't care about.
   * Defaults to a passthrough function if not provided.
   *
   * @remark The hook will revalidate every time the transform function changes, so it is important to use [useCallback](https://react.dev/reference/react/useCallback) to ensure it only changes when necessary to prevent unnecessary re-renders or computations.
   */
  transform?: (item: any) => T;
  /**
   * The amount of items to return for each page.
   * Defaults to `20`.
   */
  pageSize?: number;
};

/**
 * Takes a `http://`, `https://` or `file:///` URL pointing to a JSON resource and streams through its content.
 * Useful when dealing with large JSON arrays which would be too big to fit in the command's memory.
 *
 * @remark The JSON resource needs to consist of an array of objects
 *
 * @example
 * ```
 * import { List } from "@raycast/api";
 * import { useStreamJSON } from "@raycast/utils";
 *
 * type Formula = { name: string; desc?: string };
 *
 * export default function Main(): JSX.Element {
 *   const { data, isLoading, pagination } = useStreamJSON<Formula>("https://formulae.brew.sh/api/formula.json");
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
 * import { useStreamJSON } from "@raycast/utils";
 * import { homedir } from "os";
 * import { join } from "path";
 *
 * type Formula = { name: string; desc?: string };
 *
 * export default function Main(): JSX.Element {
 *   const { data, isLoading, pagination } = useStreamJSON<Formula>(`file:///${join(homedir(), "Downloads", "formulae.json")}`);
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
export function useStreamJSON<T, U = unknown>(url: RequestInfo): UseCachedPromiseReturnType<T[], U>;

/**
 * Takes a `http://`, `https://` or `file:///` URL pointing to a JSON resourceand  streams through its content.
 * Useful when dealing with large JSON arrays which would be too big to fit in the command's memory.
 *
 * @remark The JSON resource needs to consist of an array of objects
 *
 * @example
 * ```
 * import { List, environment } from "@raycast/api";
 * import { useStreamJSON } from "@raycast/utils";
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
 *   const formulaTransform = useCallback((item: any): Formula => {
 *     return { name: item.name, desc: item.desc };
 *   }, []);
 *
 *   const { data, isLoading, pagination } = useStreamJSON("https://formulae.brew.sh/api/formula.json", {
 *     initialData: [] as Formula[],
 *     pageSize: 20,
 *     filter: formulaFilter,
 *     transform: formulaTransform,
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
 * import { useStreamJSON } from "@raycast/utils";
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
 *   const formulaTransform = useCallback((item: any): Formula => {
 *     return { name: item.name, desc: item.desc };
 *   }, []);
 *
 *   const { data, isLoading, pagination } = useStreamJSON(`file:///${join(homedir(), "Downloads", "formulae.json")}`, {
 *     initialData: [] as Formula[],
 *     pageSize: 20,
 *     filter: formulaFilter,
 *     transform: formulaTransform,
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
export function useStreamJSON<T, U extends any[] = any[]>(
  url: RequestInfo,
  options: Options<T> & RequestInit & Omit<CachedPromiseOptions<FunctionReturningPaginatedPromise, U>, "abortable">,
): UseCachedPromiseReturnType<T[], U>;

export function useStreamJSON<T, U extends any[] = any[]>(
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
    dataPath,
    filter,
    transform,
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
      fetchOptions: RequestInit | undefined,
      dataPath: string | undefined,
      filter: ((item: T) => boolean) | undefined,
      transform: ((item: unknown) => T) | undefined,
    ) =>
      async ({ page }) => {
        if (page === 0) {
          controllerRef.current?.abort();
          controllerRef.current = new AbortController();
          const stream = await getStream(url, fetchOptions);
          generatorRef.current = streamJsonFile(
            stream,
            pageSize,
            controllerRef.current?.signal,
            dataPath,
            filter,
            transform,
          );
        }
        if (!generatorRef.current) {
          return { hasMore: hasMoreRef.current, data: [] };
        }
        const { value: newData, done } = await generatorRef.current.next();
        hasMoreRef.current = !done;
        return { hasMore: hasMoreRef.current, data: (newData ?? []) as T[] };
      },
    [url, pageSize, fetchOptions, dataPath, filter, transform],
    useCachedPromiseOptions,
  );
}
