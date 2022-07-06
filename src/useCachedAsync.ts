import { useEffect, MutableRefObject, useRef, useCallback } from "react";
import hash from "object-hash";
import { showToast, Toast, Clipboard } from "@raycast/api";
import { FunctionReturningPromise, PromiseType } from "./types";
import { useAsyncFunction } from "./useAsyncFunction";
import { useCachedState } from "./useCachedState";

import { useLatest } from "./useLatest";

// Symbol to differentiate an empty cache from `undefined`
const emptyCache = Symbol();

export function useCachedAsync<T extends FunctionReturningPromise, U = undefined>(
  fn: T,
  args: Parameters<T>,
  config?: {
    initialValue?: U;
    abortable?: MutableRefObject<AbortController | null | undefined>;
    execute?: boolean;
    keepPreviousData?: boolean;
  }
) {
  const [cachedData, mutateCache] = useCachedState<typeof emptyCache | (PromiseType<ReturnType<T>> | U)>(
    createCacheKey(args),
    emptyCache,
    {
      cacheNamespace: createCacheKey(fn),
    }
  );

  const [state, revalidate] = useAsyncFunction(fn, {
    initialState: { isLoading: true },
    abortable: config?.abortable,
  });

  const data = cachedData !== emptyCache ? cachedData : (config?.initialValue as U);

  // Use a ref to store previous returned data. Use the inital data as its inital value.
  const laggyDataRef = useRef(data);

  const returnedData = config?.keepPreviousData
    ? cachedData !== emptyCache
      ? cachedData
      : laggyDataRef.current
    : data;

  const latestData = useLatest(returnedData);
  const latestArgs = useLatest(args);

  const mutate = useCallback(
    async (
      asyncUpdate: Promise<any> = Promise.resolve(),
      options?: {
        optimisticUpdate?: (data: PromiseType<ReturnType<T>> | U) => PromiseType<ReturnType<T>> | U;
        rollbackOnError?: (data: PromiseType<ReturnType<T>> | U) => PromiseType<ReturnType<T>> | U;
        revalidate?: boolean;
      }
    ) => {
      try {
        if (options?.optimisticUpdate) {
          mutateCache(options.optimisticUpdate(latestData.current));
        }
        return await asyncUpdate;
      } catch (err) {
        if (options?.rollbackOnError) {
          mutateCache(options.rollbackOnError(latestData.current));
        }
        throw err;
      } finally {
        if (options?.revalidate !== false) {
          revalidate(...latestArgs.current);
        }
      }
    },
    [mutateCache, revalidate, latestData, latestArgs]
  );

  // revalidate when the args change
  useEffect(() => {
    if (config?.execute !== false) {
      revalidate(...args);
    }
  }, [...args, config?.execute, revalidate]);

  // update the cache when we fetch new values
  useEffect(() => {
    if (typeof state.value !== "undefined") {
      mutateCache(state.value);
      laggyDataRef.current = state.value;
    }
  }, [state.value, mutateCache, laggyDataRef]);

  useEffect(() => {
    if (state.error) {
      console.error(state.error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch latest data",
        message: state.error.message,
        primaryAction: {
          title: "Retry",
          onAction(toast) {
            toast.hide();
            revalidate(...latestArgs.current);
          },
        },
        secondaryAction: {
          title: "Copy Logs",
          onAction(toast) {
            toast.hide();
            Clipboard.copy(state.error?.stack || state.error?.message || "");
          },
        },
      });
    }
  }, [state.error, latestArgs, revalidate]);

  return {
    data: returnedData as PromiseType<ReturnType<T>> | U,
    mutate,
    isLoading: state.isLoading,
    error: state.error,
  };
}

function createCacheKey(args: any): string {
  return hash(args);
}
