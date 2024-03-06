import { useCallback, useMemo, useRef } from "react";
import mediaTyper from "media-typer";
import contentType from "content-type";
import { useCachedPromise, CachedPromiseOptions } from "./useCachedPromise";
import { useLatest } from "./useLatest";
import { FunctionReturningPaginatedPromise, FunctionReturningPromise, UseCachedPromiseReturnType } from "./types";
import { fetch } from "cross-fetch";

function isJSON(contentTypeHeader: string | null | undefined): boolean {
  if (contentTypeHeader) {
    const ct = contentType.parse(contentTypeHeader);

    const mediaType = mediaTyper.parse(ct.type);

    if (mediaType.subtype === "json") {
      return true;
    }

    if (mediaType.suffix === "json") {
      return true;
    }

    if (mediaType.suffix && /\bjson\b/i.test(mediaType.suffix)) {
      return true;
    }

    if (mediaType.subtype && /\bjson\b/i.test(mediaType.subtype)) {
      return true;
    }
  }
  return false;
}

async function defaultParsing(response: Response) {
  if (!response.ok) {
    throw new Error(response.statusText);
  }

  const contentTypeHeader = response.headers.get("content-type");

  if (contentTypeHeader && isJSON(contentTypeHeader)) {
    return await response.json();
  }
  return await response.text();
}

function defaultMapping<V, T extends unknown[]>(result: V): { data: T; hasMore?: boolean } {
  return { data: result as unknown as T, hasMore: false };
}

type PaginatedRequestInfo = (pagination: { page: number; lastItem?: any }) => RequestInfo;

export function useFetch<V = unknown, U = undefined, T extends unknown[] = unknown[]>(
  url: PaginatedRequestInfo,
  options: RequestInit & {
    mapResult: (result: V) => { data: T; hasMore?: boolean };
    parseResponse?: (response: Response) => Promise<V>;
  } & Omit<CachedPromiseOptions<(url: RequestInfo, options?: RequestInit) => Promise<T>, U>, "abortable">,
): UseCachedPromiseReturnType<T, U>;
/**
 * Fetch the URL and returns the {@link AsyncState} corresponding to the execution of the fetch. The last value will be kept between command runs.
 *
 * @example
 * ```
 * import { useFetch } from '@raycast/utils';
 *
 * export default function Command() {
 *   const { isLoading, data, revalidate } = useFetch('https://api.example');
 *
 *   return (
 *     <Detail
 *       isLoading={isLoading}
 *       markdown={data}
 *       actions={
 *         <ActionPanel>
 *           <Action title="Reload" onAction={() => revalidate()} />
 *         </ActionPanel>
 *       }
 *     />
 *   );
 * };
 * ```
 */
export function useFetch<V = unknown, U = undefined, T = V>(
  url: RequestInfo,
  options: RequestInit & {
    mapResult: (result: V) => { data: T; hasMore?: boolean };
    parseResponse?: (response: Response) => Promise<V>;
  } & Omit<CachedPromiseOptions<(url: RequestInfo, options?: RequestInit) => Promise<T>, U>, "abortable">,
): UseCachedPromiseReturnType<T, U> & { pagination: undefined };

export function useFetch<V = unknown, U = undefined, T extends unknown[] = unknown[]>(
  url: RequestInfo | PaginatedRequestInfo,
  options?: RequestInit & {
    mapResult?: (result: V) => { data: T; hasMore?: boolean };
    parseResponse?: (response: Response) => Promise<V>;
  } & Omit<CachedPromiseOptions<(url: RequestInfo, options?: RequestInit) => Promise<T>, U>, "abortable">,
): UseCachedPromiseReturnType<T, U> {
  const {
    parseResponse,
    mapResult,
    initialData,
    execute,
    keepPreviousData,
    onError,
    onData,
    onWillExecute,
    ...fetchOptions
  } = options || {};

  const useCachedPromiseOptions: CachedPromiseOptions<(url: RequestInfo, options?: RequestInit) => Promise<T>, U> = {
    initialData,
    execute,
    keepPreviousData,
    onError,
    onData,
    onWillExecute,
  };

  const parseResponseRef = useLatest(parseResponse || defaultParsing);
  const mapResultRef = useLatest(mapResult || defaultMapping);
  const urlRef = useRef<RequestInfo | PaginatedRequestInfo>();
  const firstPageUrlRef = useRef<RequestInfo | undefined>();
  const firstPageUrl = typeof url === "function" ? url({ page: 0 }) : undefined;
  if (!urlRef.current || firstPageUrlRef.current !== firstPageUrl) {
    urlRef.current = url;
  }
  firstPageUrlRef.current = firstPageUrl;
  const abortable = useRef<AbortController>();

  const paginatedFn: FunctionReturningPaginatedPromise<[PaginatedRequestInfo, typeof fetchOptions], T> = useCallback(
    (url: PaginatedRequestInfo, options?: RequestInit) => async (pagination: { page: number }) => {
      const res = await fetch(url(pagination), { signal: abortable.current?.signal, ...options });
      const parsed = (await parseResponseRef.current(res)) as V;
      return mapResultRef.current?.(parsed);
    },
    [parseResponseRef, mapResultRef],
  );
  const fn: FunctionReturningPromise<[RequestInfo, RequestInit?], T> = useCallback(
    async (url: RequestInfo, options?: RequestInit) => {
      const res = await fetch(url, { signal: abortable.current?.signal, ...options });
      const parsed = (await parseResponseRef.current(res)) as V;
      if (!mapResultRef.current) {
        return parsed as unknown as T;
      }
      const mapped = mapResultRef.current(parsed);
      return mapped?.data as unknown as T;
    },
    [parseResponseRef, mapResultRef],
  );

  const promise = useMemo(() => {
    if (firstPageUrlRef.current) {
      return paginatedFn;
    }
    return fn;
  }, [firstPageUrlRef, fn, paginatedFn]);

  // @ts-expect-error lastItem can't be inferred properly
  return useCachedPromise(promise, [urlRef.current as PaginatedRequestInfo, fetchOptions], {
    ...useCachedPromiseOptions,
    internal_cacheKeySuffix: firstPageUrlRef.current,
    abortable,
  });
}
