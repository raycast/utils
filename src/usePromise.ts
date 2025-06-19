import { useEffect, useCallback, RefObject, useRef, useState } from "react";
import { environment, LaunchType, Toast } from "@raycast/api";
import { useDeepMemo } from "./useDeepMemo";
import {
  FunctionReturningPromise,
  MutatePromise,
  UsePromiseReturnType,
  AsyncState,
  FunctionReturningPaginatedPromise,
  UnwrapReturn,
  PaginationOptions,
} from "./types";
import { useLatest } from "./useLatest";
import { showFailureToast } from "./showFailureToast";

export type PromiseOptions<T extends FunctionReturningPromise | FunctionReturningPaginatedPromise> = {
  /**
   * A reference to an `AbortController` to cancel a previous call when triggering a new one
   */
  abortable?: RefObject<AbortController | null | undefined>;
  /**
   * Whether to actually execute the function or not.
   * This is useful for cases where one of the function's arguments depends on something that
   * might not be available right away (for example, depends on some user inputs). Because React requires
   * every hooks to be defined on the render, this flag enables you to define the hook right away but
   * wait util you have all the arguments ready to execute the function.
   */
  execute?: boolean;
  /**
   * Options for the generic failure toast.
   * It allows you to customize the title, message, and primary action of the failure toast.
   */
  failureToastOptions?: Partial<Pick<Toast.Options, "title" | "primaryAction" | "message">>;
  /**
   * Called when an execution fails. By default it will log the error and show
   * a generic failure toast.
   */
  onError?: (error: Error) => void | Promise<void>;
  /**
   * Called when an execution succeeds.
   */
  onData?: (data: UnwrapReturn<T>, pagination?: PaginationOptions<UnwrapReturn<T>>) => void | Promise<void>;
  /**
   * Called when an execution will start
   */
  onWillExecute?: (parameters: Parameters<T>) => void;
};

/**
 * Wraps an asynchronous function or a function that returns a Promise in another function, and returns the {@link AsyncState} corresponding to the execution of the function.
 *
 * @remark This overload should be used when working with paginated data sources.
 *
 * @example
 * ```
 * import { setTimeout } from "node:timers/promises";
 * import { useState } from "react";
 * import { List } from "@raycast/api";
 * import { usePromise } from "@raycast/utils";
 *
 * export default function Command() {
 *   const [searchText, setSearchText] = useState("");
 *
 *   const { isLoading, data, pagination } = usePromise(
 *     (searchText: string) => async (options: { page: number }) => {
 *       await setTimeout(200);
 *       const newData = Array.from({ length: 25 }, (_v, index) => ({
 *         index,
 *         page: options.page,
 *         text: searchText,
 *       }));
 *       return { data: newData, hasMore: options.page < 10 };
 *     },
 *     [searchText]
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
 * };
 * ```
 */
export function usePromise<T extends FunctionReturningPaginatedPromise<[]>>(
  fn: T,
): UsePromiseReturnType<UnwrapReturn<T>>;
export function usePromise<T extends FunctionReturningPaginatedPromise>(
  fn: T,
  args: Parameters<T>,
  options?: PromiseOptions<T>,
): UsePromiseReturnType<UnwrapReturn<T>>;

/**
 * Wraps an asynchronous function or a function that returns a Promise and returns the {@link AsyncState} corresponding to the execution of the function.
 *
 * @remark The function is assumed to be constant (eg. changing it won't trigger a revalidation).
 *
 * @example
 * ```
 * import { usePromise } from '@raycast/utils';
 *
 * export default function Command() {
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
export function usePromise<T extends FunctionReturningPromise<[]>>(fn: T): UsePromiseReturnType<UnwrapReturn<T>>;
export function usePromise<T extends FunctionReturningPromise>(
  fn: T,
  args: Parameters<T>,
  options?: PromiseOptions<T>,
): UsePromiseReturnType<UnwrapReturn<T>>;

export function usePromise<T extends FunctionReturningPromise | FunctionReturningPaginatedPromise>(
  fn: T,
  args?: Parameters<T>,
  options?: PromiseOptions<T>,
): UsePromiseReturnType<any> {
  const lastCallId = useRef(0);
  const [state, set] = useState<AsyncState<UnwrapReturn<T>>>({ isLoading: true });

  const fnRef = useLatest(fn);
  const latestAbortable = useLatest(options?.abortable);
  const latestArgs = useLatest(args || []);
  const latestOnError = useLatest(options?.onError);
  const latestOnData = useLatest(options?.onData);
  const latestOnWillExecute = useLatest(options?.onWillExecute);
  const latestFailureToast = useLatest(options?.failureToastOptions);
  const latestValue = useLatest(state.data);
  const latestCallback = useRef<(...args: Parameters<T>) => Promise<UnwrapReturn<T>>>(null);

  const paginationArgsRef = useRef<PaginationOptions>({ page: 0 });
  const usePaginationRef = useRef(false);
  const hasMoreRef = useRef(true);
  const pageSizeRef = useRef(50);

  const abort = useCallback(() => {
    if (latestAbortable.current) {
      latestAbortable.current.current?.abort();
      latestAbortable.current.current = new AbortController();
    }
    return ++lastCallId.current;
  }, [latestAbortable]);

  const callback = useCallback(
    (...args: Parameters<T>): Promise<UnwrapReturn<T>> => {
      const callId = abort();

      latestOnWillExecute.current?.(args);

      set((prevState) => ({ ...prevState, isLoading: true }));

      const promiseOrPaginatedPromise = bindPromiseIfNeeded(fnRef.current)(...args);

      function handleError(error: any) {
        if (error.name == "AbortError") {
          return error;
        }

        if (callId === lastCallId.current) {
          // handle errors
          if (latestOnError.current) {
            latestOnError.current(error);
          } else {
            if (environment.launchType !== LaunchType.Background) {
              showFailureToast(error, {
                title: "Failed to fetch latest data",
                primaryAction: {
                  title: "Retry",
                  onAction(toast) {
                    toast.hide();
                    latestCallback.current?.(...((latestArgs.current || []) as Parameters<T>));
                  },
                },
                ...latestFailureToast.current,
              });
            }
          }
          set({ error, isLoading: false });
        }

        return error;
      }

      if (typeof promiseOrPaginatedPromise === "function") {
        usePaginationRef.current = true;
        return promiseOrPaginatedPromise(paginationArgsRef.current).then(
          // @ts-expect-error too complicated for TS
          ({ data, hasMore, cursor }: { data: UnwrapReturn<T>; hasMore: boolean; cursor?: any }) => {
            if (callId === lastCallId.current) {
              if (paginationArgsRef.current) {
                paginationArgsRef.current.cursor = cursor;
                paginationArgsRef.current.lastItem = data?.[data.length - 1];
              }

              if (latestOnData.current) {
                latestOnData.current(data, paginationArgsRef.current);
              }

              if (hasMore) {
                pageSizeRef.current = data.length;
              }
              hasMoreRef.current = hasMore;

              set((previousData) => {
                if (paginationArgsRef.current.page === 0) {
                  return { data, isLoading: false };
                }
                // @ts-expect-error we know it's an array here
                return { data: (previousData.data || [])?.concat(data), isLoading: false };
              });
            }

            return data;
          },
          (error: unknown) => {
            hasMoreRef.current = false;
            return handleError(error);
          },
        ) as Promise<UnwrapReturn<T>>;
      }

      usePaginationRef.current = false;
      return promiseOrPaginatedPromise.then((data: UnwrapReturn<T>) => {
        if (callId === lastCallId.current) {
          if (latestOnData.current) {
            latestOnData.current(data);
          }
          set({ data, isLoading: false });
        }

        return data;
      }, handleError) as Promise<UnwrapReturn<T>>;
    },
    [
      latestOnData,
      latestOnError,
      latestArgs,
      fnRef,
      set,
      latestCallback,
      latestOnWillExecute,
      paginationArgsRef,
      latestFailureToast,
      abort,
    ],
  );

  latestCallback.current = callback;

  const revalidate = useCallback(() => {
    // reset the pagination
    paginationArgsRef.current = { page: 0 };

    const args = (latestArgs.current || []) as Parameters<T>;
    return callback(...args);
  }, [callback, latestArgs]);

  const mutate = useCallback<MutatePromise<Awaited<ReturnType<T>>, undefined>>(
    async (asyncUpdate, options) => {
      let dataBeforeOptimisticUpdate: Awaited<ReturnType<T>> | undefined;
      try {
        if (options?.optimisticUpdate) {
          // cancel the in-flight request to make sure it won't overwrite the optimistic update
          abort();

          if (typeof options?.rollbackOnError !== "function" && options?.rollbackOnError !== false) {
            // keep track of the data before the optimistic update,
            // but only if we need it (eg. only when we want to automatically rollback after)
            dataBeforeOptimisticUpdate = structuredClone(latestValue.current?.value);
          }
          const update = options.optimisticUpdate;
          set((prevState) => ({ ...prevState, data: update(prevState.data) }));
        }
        return await asyncUpdate;
      } catch (err) {
        if (typeof options?.rollbackOnError === "function") {
          const update = options.rollbackOnError;
          set((prevState) => ({ ...prevState, data: update(prevState.data) }));
        } else if (options?.optimisticUpdate && options?.rollbackOnError !== false) {
          set((prevState) => ({ ...prevState, data: dataBeforeOptimisticUpdate }));
        }
        throw err;
      } finally {
        if (options?.shouldRevalidateAfter !== false) {
          if (environment.launchType === LaunchType.Background || environment.commandMode === "menu-bar") {
            // when in the background or in a menu bar, we are going to await the revalidation
            // to make sure we get the right data at the end of the mutation
            await revalidate();
          } else {
            revalidate();
          }
        }
      }
    },
    [revalidate, latestValue, set, abort],
  );

  const onLoadMore = useCallback(() => {
    paginationArgsRef.current.page += 1;
    const args = (latestArgs.current || []) as Parameters<T>;
    callback(...args);
  }, [paginationArgsRef, latestArgs, callback]);

  // revalidate when the args change
  useEffect(() => {
    // reset the pagination
    paginationArgsRef.current = { page: 0 };

    if (options?.execute !== false) {
      callback(...((args || []) as Parameters<T>));
    } else {
      // cancel the previous request if we don't want to execute anymore
      abort();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDeepMemo([args, options?.execute, callback]), latestAbortable, paginationArgsRef]);

  // abort request when unmounting
  useEffect(() => {
    return () => {
      abort();
    };
  }, [abort]);

  // we only want to show the loading indicator if the promise is executing
  const isLoading = options?.execute !== false ? state.isLoading : false;

  // @ts-expect-error loading is has some fixed value in the enum which
  const stateWithLoadingFixed: AsyncState<Awaited<ReturnType<T>>> = { ...state, isLoading };

  const pagination = usePaginationRef.current
    ? {
        pageSize: pageSizeRef.current,
        hasMore: hasMoreRef.current,
        onLoadMore,
      }
    : undefined;

  return { ...stateWithLoadingFixed, revalidate, mutate, pagination };
}

/** Bind the fn if it's a Promise method */
function bindPromiseIfNeeded<T>(fn: T): T {
  if (fn === (Promise.all as any)) {
    // @ts-expect-error this is fine
    return fn.bind(Promise);
  }
  if (fn === (Promise.race as any)) {
    // @ts-expect-error this is fine
    return fn.bind(Promise);
  }
  if (fn === (Promise.resolve as any)) {
    // @ts-expect-error this is fine
    return fn.bind(Promise as any);
  }
  if (fn === (Promise.reject as any)) {
    // @ts-expect-error this is fine
    return fn.bind(Promise);
  }
  return fn;
}
