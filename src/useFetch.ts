import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCachedPromise, CachedPromiseOptions } from "./useCachedPromise";
import { useLatest } from "./useLatest";
import { FunctionReturningPaginatedPromise, FunctionReturningPromise, UseCachedPromiseReturnType } from "./types";
import { isJSON } from "./fetch-utils";
import { hash } from "./helpers";

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

function defaultMapping<V, T extends unknown[]>(result: V): { data: T; hasMore?: boolean; cursor?: any } {
  return { data: result as unknown as T, hasMore: false };
}

type RequestInfo = string | URL | globalThis.Request;
type PaginatedRequestInfo = (pagination: { page: number; lastItem?: any; cursor?: any }) => RequestInfo;

async function getRequestInfoCacheKey(requestInfo: RequestInfo) {
  if (typeof requestInfo === "string" || requestInfo instanceof URL) {
    return requestInfo.toString();
  }

  const body = requestInfo.body === null ? undefined : new Uint8Array(await requestInfo.clone().arrayBuffer());

  return hash({
    body,
    cache: requestInfo.cache,
    credentials: requestInfo.credentials,
    headers: Array.from(requestInfo.headers.entries()),
    integrity: requestInfo.integrity,
    method: requestInfo.method,
    mode: requestInfo.mode,
    redirect: requestInfo.redirect,
    referrer: requestInfo.referrer,
    referrerPolicy: requestInfo.referrerPolicy,
    url: requestInfo.url,
  });
}

function getUrlFactoryErrorCacheKey(url: PaginatedRequestInfo, error: unknown) {
  // The error itself can be recreated with a different identity or message on every call. Keying the failed state by
  // the factory implementation keeps inline factories stable across error-state renders while still distinguishing
  // factories with different implementations.
  const normalizedError = error instanceof Error ? { name: error.name, message: error.message } : String(error);
  return `url-factory-error:${hash([url.toString(), normalizedError])}`;
}

function combineAbortSignals(...signals: Array<AbortSignal | null | undefined>) {
  const definedSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (definedSignals.length === 0) {
    return undefined;
  }
  if (definedSignals.length === 1) {
    return definedSignals[0];
  }
  return AbortSignal.any(definedSignals);
}

/**
 * Fetches the paginatedURL and returns the {@link AsyncState} corresponding to the execution of the fetch. The last value will be kept between command runs.
 *
 * @remark This overload should be used when working with paginated data sources.
 * @remark When paginating, only the first page will be cached.
 *
 * @example
 * ```
 * import { Icon, Image, List } from "@raycast/api";
 * import { useFetch } from "@raycast/utils";
 * import { useState } from "react";
 *
 * type SearchResult = { companies: Company[]; page: number; totalPages: number };
 * type Company = { id: number; name: string; smallLogoUrl?: string };
 * export default function Command() {
 *   const [searchText, setSearchText] = useState("");
 *   const { isLoading, data, pagination } = useFetch(
 *     (options) =>
 *       "https://api.ycombinator.com/v0.1/companies?" +
 *       new URLSearchParams({ page: String(options.page + 1), q: searchText }).toString(),
 *     {
 *       mapResult(result: SearchResult) {
 *         return {
 *           data: result.companies,
 *           hasMore: result.page < result.totalPages,
 *         };
 *       },
 *       keepPreviousData: true,
 *       initialData: [],
 *     },
 *   );
 *
 *   return (
 *     <List isLoading={isLoading} pagination={pagination} onSearchTextChange={setSearchText}>
 *       {data.map((company) => (
 *         <List.Item
 *           key={company.id}
 *           icon={{ source: company.smallLogoUrl ?? Icon.MinusCircle, mask: Image.Mask.RoundedRectangle }}
 *           title={company.name}
 *         />
 *       ))}
 *     </List>
 *   );
 * }
 * ```
 */
export function useFetch<V = unknown, U = undefined, T extends unknown[] = unknown[]>(
  url: PaginatedRequestInfo,
  options: RequestInit & {
    mapResult: (result: V) => { data: T; hasMore?: boolean; cursor?: any };
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
  options?: RequestInit & {
    mapResult?: (result: V) => { data: T; hasMore?: boolean; cursor?: any };
    parseResponse?: (response: Response) => Promise<V>;
  } & Omit<CachedPromiseOptions<(url: RequestInfo, options?: RequestInit) => Promise<T>, U>, "abortable">,
): UseCachedPromiseReturnType<T, U> & { pagination: undefined };

export function useFetch<V = unknown, U = undefined, T extends unknown[] = unknown[]>(
  url: RequestInfo | PaginatedRequestInfo,
  options?: RequestInit & {
    mapResult?: (result: V) => { data: T; hasMore?: boolean; cursor?: any };
    parseResponse?: (response: Response) => Promise<V>;
  } & Omit<CachedPromiseOptions<(url: RequestInfo, options?: RequestInit) => Promise<T>, U>, "abortable">,
): UseCachedPromiseReturnType<T, U> {
  const {
    parseResponse,
    mapResult,
    initialData,
    cacheWriteDebounce,
    execute,
    keepPreviousData,
    onError,
    onData,
    onWillExecute,
    failureToastOptions,
    ...fetchOptions
  } = options || {};

  const useCachedPromiseOptions: CachedPromiseOptions<(url: RequestInfo, options?: RequestInit) => Promise<T>, U> = {
    initialData,
    cacheWriteDebounce,
    execute,
    keepPreviousData,
    onError,
    onData,
    onWillExecute,
    failureToastOptions,
  };

  const parseResponseRef = useLatest(parseResponse || defaultParsing);
  const mapResultRef = useLatest(mapResult || defaultMapping);
  const isPaginated = typeof url === "function";
  const paginatedUrlRef = useRef<PaginatedRequestInfo>(null);
  const firstPageErrorRef = useRef<{ error: unknown }>(null);
  const [paginatedRequest, setPaginatedRequest] = useState<{
    cacheKey: string;
    requestInfo: PaginatedRequestInfo;
  } | null>(null);
  const [resolvedRequest, setResolvedRequest] = useState<{ request: Request; cacheKey: string } | null>(null);

  // Resolve the first page after render. The wrapper below stays referentially stable until that page's cache key
  // changes, so inline URL factories don't revalidate again when the request updates this hook's own state.
  useEffect(() => {
    if (!isPaginated || execute === false) {
      paginatedUrlRef.current = null;
      firstPageErrorRef.current = null;
      setPaginatedRequest(null);
      return;
    }

    const paginatedUrl = url as PaginatedRequestInfo;
    paginatedUrlRef.current = paginatedUrl;

    let cancelled = false;
    void (async () => {
      let cacheKey: string;
      let firstPageError: { error: unknown } | null = null;
      try {
        const requestInfo = paginatedUrl({ page: 0 });
        cacheKey = await getRequestInfoCacheKey(requestInfo);
      } catch (error) {
        firstPageError = { error };
        cacheKey = getUrlFactoryErrorCacheKey(paginatedUrl, error);
      }

      if (cancelled) {
        return;
      }
      firstPageErrorRef.current = firstPageError;

      setPaginatedRequest((previous) => {
        if (previous?.cacheKey === cacheKey) {
          return previous;
        }

        return {
          cacheKey,
          requestInfo(pagination) {
            const currentUrl = paginatedUrlRef.current;
            if (!currentUrl) {
              throw new Error("The paginated URL factory is not ready");
            }

            if (pagination.page === 0) {
              const firstPageError = firstPageErrorRef.current;
              if (firstPageError) {
                throw firstPageError.error;
              }
            }

            return currentUrl(pagination);
          },
        };
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [execute, isPaginated, url]);

  useEffect(() => {
    if (isPaginated || execute === false || !(url instanceof Request)) {
      setResolvedRequest(null);
      return;
    }

    let cancelled = false;
    void getRequestInfoCacheKey(url).then(
      (cacheKey) => {
        if (!cancelled) {
          setResolvedRequest({ request: url, cacheKey });
        }
      },
      (error) => {
        if (!cancelled) {
          setResolvedRequest({ request: url, cacheKey: `request-error:${hash(String(error))}` });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [execute, isPaginated, url]);

  const abortable = useRef<AbortController>(null);

  const paginatedFn: FunctionReturningPaginatedPromise<[PaginatedRequestInfo, typeof fetchOptions], T> = useCallback(
    (url: PaginatedRequestInfo, options?: RequestInit) => async (pagination: { page: number }) => {
      const requestInfo = url(pagination);
      const request = requestInfo instanceof Request ? requestInfo.clone() : requestInfo;
      const signal = combineAbortSignals(
        abortable.current?.signal,
        options?.signal,
        requestInfo instanceof Request ? requestInfo.signal : undefined,
      );
      const res = await fetch(request, { ...options, signal });
      const parsed = (await parseResponseRef.current(res)) as V;
      return mapResultRef.current?.(parsed);
    },
    [parseResponseRef, mapResultRef],
  );
  const fn: FunctionReturningPromise<[RequestInfo, RequestInit?], T> = useCallback(
    async (url: RequestInfo, options?: RequestInit) => {
      const request = url instanceof Request ? url.clone() : url;
      const signal = combineAbortSignals(
        abortable.current?.signal,
        options?.signal,
        url instanceof Request ? url.signal : undefined,
      );
      const res = await fetch(request, { ...options, signal });
      const parsed = (await parseResponseRef.current(res)) as V;
      const mapped = mapResultRef.current(parsed);
      return mapped?.data as unknown as T;
    },
    [parseResponseRef, mapResultRef],
  );

  const promise = useMemo(() => {
    if (isPaginated) {
      return paginatedFn;
    }
    return fn;
  }, [isPaginated, fn, paginatedFn]);

  const requestInfo = isPaginated ? paginatedRequest?.requestInfo : url;
  const requestCacheKey =
    !isPaginated && url instanceof Request && resolvedRequest?.request === url ? resolvedRequest.cacheKey : null;
  const isResolvingRequestCacheKey = !isPaginated && url instanceof Request && execute !== false && !requestCacheKey;

  // @ts-expect-error lastItem can't be inferred properly
  const result = useCachedPromise(promise, [requestInfo, fetchOptions], {
    ...useCachedPromiseOptions,
    execute: isPaginated ? execute !== false && paginatedRequest !== null : !isResolvingRequestCacheKey && execute,
    internal_cacheKeySuffix:
      (isPaginated ? paginatedRequest?.cacheKey : requestCacheKey || "") +
      hash(mapResultRef.current) +
      hash(parseResponseRef.current),
    abortable,
  }) as UseCachedPromiseReturnType<T, U>;

  if ((isPaginated && execute !== false && paginatedRequest === null) || isResolvingRequestCacheKey) {
    return { ...result, isLoading: true } as UseCachedPromiseReturnType<T, U>;
  }

  return result;
}
