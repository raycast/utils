import { useEffect, useRef, useCallback } from "react";
import hash from "object-hash";
import { FunctionReturningPromise, PromiseType, AsyncStateFromFunctionReturningPromise, MutatePromise } from "./types";
import { useCachedState } from "./useCachedState";
import { usePromise, PromiseOptions } from "./usePromise";

import { useLatest } from "./useLatest";

// Symbol to differentiate an empty cache from `undefined`
const emptyCache = Symbol();

export type CachedPromiseOptions<U> = PromiseOptions & {
  /**
   * The initial data if there aren't any in the Cache yet.
   */
  initialData?: U;
  /**
   * Tells the hook to keep the previous results instead of returning the initial value
   * if there aren't any in the cache for the new arguments.
   * This is particularly useful when used for data for a List to avoid flickering.
   */
  keepPreviousData?: boolean;
};

/**
 * Wraps an asynchronous function or a function that returns a promise and returns the {@link AsyncState} corresponding to the execution of the function. The last value will be kept between command runs.
 *
 * @remark The value needs to be JSON serializable.
 * @remark The function is assumed to be constant (eg. changing it won't trigger a revalidation).
 *
 * @example
 * ```
 * import { usePromise } from '@raycast/utils';
 *
 * const Demo = ({url}) => {
 *   const abortable = useRef<AbortController>();
 *   const { isLoading, data, revalidate } = usePromise(async (url: string) => {
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
  fn: T
): AsyncStateFromFunctionReturningPromise<T> & {
  data: PromiseType<ReturnType<T>> | undefined;
  /**
   * Function to wrap an asynchronous update and gives some control about how the
   * `useCachedPromise`'s data should be updated.
   *
   * By default, the data will be revalidated (eg. the function will be called again)
   * after the update is done.
   *
   * **Optimistic Update**
   *
   * In an optimistic update, the UI behaves as though a change was successfully
   * completed before receiving confirmation from the server that it actually was -
   * it is being optimistic that it will eventually get the confirmation rather than an error.
   * This allows for a more responsive user experience.
   *
   * You can specify an `optimisticUpdate` function to mutate the data in order to reflect
   * the change introduced by the asynchronous update.
   *
   * When doing so, you will want to specify the `rollbackOnError` function to mutate back the
   * data if the asynchronous update fails.
   */
  mutate: MutatePromise<T>;
  /**
   * Function to manually call the function again
   */
  revalidate: () => void;
};
export function useCachedPromise<T extends FunctionReturningPromise, U = undefined>(
  fn: T,
  args: Parameters<T>,
  options?: CachedPromiseOptions<U>
): AsyncStateFromFunctionReturningPromise<T> & {
  data: PromiseType<ReturnType<T>> | U;
  /**
   * Function to wrap an asynchronous update and gives some control about how the
   * `useCachedPromise`'s data should be updated.
   *
   * By default, the data will be revalidated (eg. the function will be called again)
   * after the update is done.
   *
   * **Optimistic Update**
   *
   * In an optimistic update, the UI behaves as though a change was successfully
   * completed before receiving confirmation from the server that it actually was -
   * it is being optimistic that it will eventually get the confirmation rather than an error.
   * This allows for a more responsive user experience.
   *
   * You can specify an `optimisticUpdate` function to mutate the data in order to reflect
   * the change introduced by the asynchronous update.
   *
   * When doing so, you will want to specify the `rollbackOnError` function to mutate back the
   * data if the asynchronous update fails.
   */
  mutate: MutatePromise<PromiseType<ReturnType<T>> | U>;
  /**
   * Function to manually call the function again
   */
  revalidate: () => void;
};
export function useCachedPromise<T extends FunctionReturningPromise, U = undefined>(
  fn: T,
  args?: Parameters<T>,
  options?: CachedPromiseOptions<U>
) {
  const { initialData, keepPreviousData, ...usePromiseOptions } = options || {};
  const [cachedData, mutateCache] = useCachedState<typeof emptyCache | (PromiseType<ReturnType<T>> | U)>(
    hash(args || []),
    emptyCache,
    {
      cacheNamespace: hash(fn),
    }
  );

  const {
    mutate: _mutate,
    revalidate,
    ...state
  } = usePromise(fn, args || ([] as any as Parameters<T>), usePromiseOptions);

  const data = cachedData !== emptyCache ? cachedData : (initialData as U);

  // Use a ref to store previous returned data. Use the inital data as its inital value.
  const laggyDataRef = useRef(data);

  const returnedData = keepPreviousData ? (cachedData !== emptyCache ? cachedData : laggyDataRef.current) : data;

  const latestData = useLatest(returnedData);

  // we rewrite the mutate function to update the cache instead
  const mutate = useCallback<MutatePromise<PromiseType<ReturnType<T>> | U>>(
    async (asyncUpdate, options) => {
      let dataBeforeOptimisticUpdate;
      try {
        if (options?.optimisticUpdate) {
          if (typeof options?.rollbackOnError !== "function" && options?.rollbackOnError !== false) {
            // keep track of the data before the optimistic update,
            // but only if we need it (eg. only when we want to automatically rollback after)
            dataBeforeOptimisticUpdate = JSON.parse(JSON.stringify(latestData.current));
          }
          mutateCache(options.optimisticUpdate(latestData.current));
        }
        return await _mutate(asyncUpdate, { shouldRevalidateAfter: options?.shouldRevalidateAfter });
      } catch (err) {
        if (typeof options?.rollbackOnError === "function") {
          mutateCache(options.rollbackOnError(latestData.current));
        } else if (options?.optimisticUpdate && options?.rollbackOnError !== false) {
          mutateCache(dataBeforeOptimisticUpdate);
        }
        throw err;
      }
    },
    [mutateCache, _mutate, latestData]
  );

  // update the cache when we fetch new values
  useEffect(() => {
    if (typeof state.data !== "undefined") {
      mutateCache(state.data);
      laggyDataRef.current = state.data;
    }
  }, [state.data, mutateCache, laggyDataRef]);

  return {
    data: returnedData as PromiseType<ReturnType<T>> | U,
    isLoading: state.isLoading,
    error: state.error,
    mutate,
    revalidate,
  };
}
