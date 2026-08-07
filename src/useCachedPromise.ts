import { useEffect, useRef, useCallback } from "react";
import {
  FunctionReturningPromise,
  UseCachedPromiseReturnType,
  MutatePromise,
  FunctionReturningPaginatedPromise,
  UnwrapReturn,
  PaginationOptions,
} from "./types";
import { useCachedState } from "./useCachedState";
import { usePromise, PromiseOptions } from "./usePromise";
import { useLatest } from "./useLatest";
import { hash } from "./helpers";

// Symbol to differentiate an empty cache from `undefined`
const emptyCache = /* #__PURE__ */ Symbol();

export type CachedPromiseOptions<
  T extends FunctionReturningPromise | FunctionReturningPaginatedPromise,
  U,
> = PromiseOptions<T> & {
  /**
   * The initial data if there aren't any in the Cache yet.
   */
  initialData?: U;
  /**
   * The debounce time in milliseconds for writing to the cache.
   */
  cacheWriteDebounce?: number;
  /**
   * Tells the hook to keep the previous results instead of returning the initial value
   * if there aren't any in the cache for the new arguments.
   * This is particularly useful when used for data for a List to avoid flickering.
   */
  keepPreviousData?: boolean;
};

/**
 * Wraps an asynchronous function or a function that returns a Promise in another function, and returns the {@link AsyncState} corresponding to the execution of the function. The last value will be kept between command runs.
 *
 * @remark This overload should be used when working with paginated data sources.
 * @remark When paginating, only the first page will be cached.
 *
 * @example
 * ```
 * import { setTimeout } from "node:timers/promises";
 * import { useState } from "react";
 * import { List } from "@raycast/api";
 * import { useCachedPromise } from "@raycast/utils";
 *
 * export default function Command() {
 *   const [searchText, setSearchText] = useState("");
 *
 *   const { isLoading, data, pagination } = useCachedPromise(
 *     (searchText: string) => async (options: { page: number }) => {
 *       await setTimeout(200);
 *       const newData = Array.from({ length: 25 }, (_v, index) => ({
 *         index,
 *         page: options.page,
 *         text: searchText,
 *       }));
 *       return { data: newData, hasMore: options.page < 10 };
 *     },
 *     [searchText],
 *   );
 *
 *   return (
 *     <List isLoading={isLoading} onSearchTextChange={setSearchText} pagination={pagination}>
 *       {data?.map((item) => (
 *         <List.Item
 *           key={`${item.page} ${item.index} ${item.text}`}
 *           title={`Page ${item.page} Item ${item.index}`}
 *           subtitle={item.text}
 *         />
 *       ))}
 *     </List>
 *   );
 * }
 * ```
 */
export function useCachedPromise<T extends FunctionReturningPaginatedPromise<[]>>(
  fn: T,
): UseCachedPromiseReturnType<UnwrapReturn<T>, undefined>;
export function useCachedPromise<T extends FunctionReturningPaginatedPromise, U extends any[] = any[]>(
  fn: T,
  args: Parameters<T>,
  options?: CachedPromiseOptions<T, U>,
): UseCachedPromiseReturnType<UnwrapReturn<T>, U>;

/**
 * Wraps an asynchronous function or a function that returns a Promise and returns the {@link AsyncState} corresponding to the execution of the function. The last value will be kept between command runs.
 *
 * @remark The value needs to be JSON serializable.
 * @remark The function is assumed to be constant (eg. changing it won't trigger a revalidation).
 *
 * @example
 * ```
 * import { useCachedPromise } from '@raycast/utils';
 *
 * export default function Command() {
 *   const abortable = useRef<AbortController>();
 *   const { isLoading, data, revalidate } = useCachedPromise(async (url: string) => {
 *     const response = await fetch(url, { signal: abortable.current?.signal });
 *     const result = await response.text();
 *     return result
 *   },
 *   ['https://api.example'],
 *   {
 *     abortable
 *   });
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
export function useCachedPromise<T extends FunctionReturningPromise<[]>>(
  fn: T,
): UseCachedPromiseReturnType<UnwrapReturn<T>, undefined>;
export function useCachedPromise<T extends FunctionReturningPromise, U = undefined>(
  fn: T,
  args: Parameters<T>,
  options?: CachedPromiseOptions<T, U>,
): UseCachedPromiseReturnType<UnwrapReturn<T>, U>;

export function useCachedPromise<
  T extends FunctionReturningPromise | FunctionReturningPaginatedPromise,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  U extends any[] | undefined = undefined,
>(fn: T, args?: Parameters<T>, options?: CachedPromiseOptions<T, U>) {
  /**
   * The hook generates a cache key from the promise it receives & its arguments.
   * Sometimes that's not enough to guarantee uniqueness, so hooks that build on top of `useCachedPromise` can
   * use an `internal_cacheKeySuffix` to help it.
   *
   * @remark For internal use only.
   */
  const {
    initialData,
    keepPreviousData,
    internal_cacheKeySuffix,
    cacheWriteDebounce,
    ...usePromiseOptions
  }: CachedPromiseOptions<T, U> & { internal_cacheKeySuffix?: string } = options || {};
  const lastUpdateFrom = useRef<{ cacheKey: string; source: "cache" | "promise" } | null>(null);
  const cacheKey = hash(args || []) + internal_cacheKeySuffix;

  const [cachedData, mutateCache] = useCachedState<typeof emptyCache | (UnwrapReturn<T> | U)>(cacheKey, emptyCache, {
    cacheNamespace: hash(fn),
    cacheWriteDebounce,
  });

  // Use a ref to store previous returned data. Use the inital data as its inital value from the cache.
  const laggyDataRef = useRef<Awaited<ReturnType<T>> | U>(cachedData !== emptyCache ? cachedData : (initialData as U));
  const paginationArgsRef = useRef<
    { cacheKey: string; pagination: PaginationOptions<UnwrapReturn<T> | U> | undefined } | undefined
  >(undefined);

  const {
    mutate: _mutate,
    revalidate,
    ...state
    // @ts-expect-error fn has the same signature in both usePromise and useCachedPromise
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = usePromise(fn, args || ([] as any as Parameters<T>), {
    ...usePromiseOptions,
    onData(data, pagination) {
      paginationArgsRef.current = { cacheKey, pagination };
      const onDataResult = usePromiseOptions.onData?.(data, pagination);
      if (pagination && pagination.page > 0) {
        // don't cache beyond the first page
        return onDataResult;
      }
      lastUpdateFrom.current = { cacheKey, source: "promise" };
      laggyDataRef.current = data;
      mutateCache(data);
      return onDataResult;
    },
  });

  let returnedData: U | Awaited<ReturnType<T>> | UnwrapReturn<T>;
  const pagination = state.pagination;
  const currentPaginationArgs =
    paginationArgsRef.current?.cacheKey === cacheKey ? paginationArgsRef.current.pagination : undefined;
  const currentLastUpdateFrom = lastUpdateFrom.current?.cacheKey === cacheKey ? lastUpdateFrom.current.source : null;
  // when paginating, only the first page gets cached, so we return the data we get from `usePromise`, because
  // it will be accumulated.
  if (currentPaginationArgs && currentPaginationArgs.page > 0 && state.data) {
    returnedData = state.data as UnwrapReturn<T>;
    // if the latest update if from the Promise, we keep it
  } else if (currentLastUpdateFrom === "promise") {
    returnedData = laggyDataRef.current;
  } else if (keepPreviousData && cachedData !== emptyCache) {
    // if we want to keep the latest data, we pick the cache but only if it's not empty
    returnedData = cachedData;
    if (pagination) {
      pagination.hasMore = true;
      pagination.pageSize = cachedData.length;
    }
  } else if (keepPreviousData && cachedData === emptyCache) {
    // if the cache is empty, we will return the previous data
    returnedData = laggyDataRef.current;
    // there are no special cases, so either return the cache or initial data
  } else if (cachedData !== emptyCache) {
    returnedData = cachedData;
    if (pagination) {
      pagination.hasMore = true;
      pagination.pageSize = cachedData.length;
    }
  } else {
    returnedData = initialData as U;
  }

  const latestData = useLatest(returnedData);
  const latestCacheKey = useLatest(cacheKey);

  // we rewrite the mutate function to update the cache instead
  const mutate = useCallback<MutatePromise<Awaited<ReturnType<T>> | U>>(
    async (asyncUpdate, options) => {
      let dataBeforeOptimisticUpdate;
      let mutationData = latestData.current;
      try {
        if (options?.optimisticUpdate) {
          if (typeof options?.rollbackOnError !== "function" && options?.rollbackOnError !== false) {
            // keep track of the data before the optimistic update,
            // but only if we need it (eg. only when we want to automatically rollback after)
            dataBeforeOptimisticUpdate = structuredClone(latestData.current);
          }
          const data = options.optimisticUpdate(mutationData);
          mutationData = data;
          lastUpdateFrom.current = { cacheKey, source: "cache" };
          laggyDataRef.current = data;
          mutateCache(data);
        }
        return await _mutate(asyncUpdate, { shouldRevalidateAfter: options?.shouldRevalidateAfter });
      } catch (err) {
        if (typeof options?.rollbackOnError === "function") {
          const data = options.rollbackOnError(mutationData);
          if (latestCacheKey.current === cacheKey) {
            lastUpdateFrom.current = { cacheKey, source: "cache" };
            laggyDataRef.current = data;
          }
          mutateCache(data);
        } else if (options?.optimisticUpdate && options?.rollbackOnError !== false) {
          if (latestCacheKey.current === cacheKey) {
            lastUpdateFrom.current = { cacheKey, source: "cache" };
            // @ts-expect-error when undefined, it's expected
            laggyDataRef.current = dataBeforeOptimisticUpdate;
          }
          // @ts-expect-error when undefined, it's expected
          mutateCache(dataBeforeOptimisticUpdate);
        }
        throw err;
      }
    },
    [cacheKey, mutateCache, _mutate, latestData, latestCacheKey, laggyDataRef, lastUpdateFrom],
  );

  useEffect(() => {
    if (cachedData !== emptyCache) {
      lastUpdateFrom.current = { cacheKey, source: "cache" };
      laggyDataRef.current = cachedData;
    }
  }, [cacheKey, cachedData]);

  return {
    data: returnedData,
    isLoading: state.isLoading,
    error: state.error,
    mutate: currentPaginationArgs && currentPaginationArgs.page > 0 ? _mutate : mutate,
    pagination,
    revalidate,
  };
}
