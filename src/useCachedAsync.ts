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
    /**
     * The initial value if there aren't any in the Cache yet.
     */
    initialValue?: U;
    /**
     * A reference to an `AbortController` to cancel a previous call when triggering a new one
     */
    abortable?: MutableRefObject<AbortController | null | undefined>;
    /**
     * Whether to actually execute the function or not.
     * This is useful for cases where a `useCachedAsync`'s arguments depends on something that
     * might not be available right away (for example, depends on some user inputs). Because React requires
     * every hooks to be defined on the render, this flag enables you to define the hook right away but
     * wait util you have all the arguments ready to execute the function.
     */
    execute?: boolean;
    /**
     * Tells the hook to keep the previous results instead of returning the initial value
     * if there aren't any in the cache for the new arguments.
     * This is particularly useful when used for data for a List to avoid flickering.
     */
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
