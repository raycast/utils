import { useEffect, useCallback, MutableRefObject, useRef, useState } from "react";
import { showToast, Toast, Clipboard, environment, LaunchType } from "@raycast/api";
import { useDeepMemo } from "./useDeepMemo";
import { FunctionReturningPromise, MutatePromise, UsePromiseReturnType, AsyncState } from "./types";
import { useLatest } from "./useLatest";

export type PromiseOptions<T extends FunctionReturningPromise> = {
  /**
   * A reference to an `AbortController` to cancel a previous call when triggering a new one
   */
  abortable?: MutableRefObject<AbortController | null | undefined>;
  /**
   * Whether to actually execute the function or not.
   * This is useful for cases where one of the function's arguments depends on something that
   * might not be available right away (for example, depends on some user inputs). Because React requires
   * every hooks to be defined on the render, this flag enables you to define the hook right away but
   * wait util you have all the arguments ready to execute the function.
   */
  execute?: boolean;
  /**
   * Called when an execution fails. By default it will log the error and show
   * a generic failure toast.
   */
  onError?: (error: Error) => void | Promise<void>;
  /**
   * Called when an execution succeeds.
   */
  onData?: (data: Awaited<ReturnType<T>>) => void | Promise<void>;
  /**
   * Called when an execution will start
   */
  onWillExecute?: (parameters: Parameters<T>) => void;
};

/**
 * Wraps an asynchronous function or a function that returns a Promise and returns the {@link AsyncState} corresponding to the execution of the function.
 *
 * @remark The function is assumed to be constant (eg. changing it won't trigger a revalidation).
 *
 * @example
 * ```
 * import { usePromise } from '@raycast/utils';
 *
 * const Demo = () => {
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
export function usePromise<T extends FunctionReturningPromise<[]>>(fn: T): UsePromiseReturnType<Awaited<ReturnType<T>>>;
export function usePromise<T extends FunctionReturningPromise>(
  fn: T,
  args: Parameters<T>,
  options?: PromiseOptions<T>
): UsePromiseReturnType<Awaited<ReturnType<T>>>;
export function usePromise<T extends FunctionReturningPromise>(
  fn: T,
  args?: Parameters<T>,
  options?: PromiseOptions<T>
): UsePromiseReturnType<Awaited<ReturnType<T>>> {
  const lastCallId = useRef(0);
  const [state, set] = useState<AsyncState<Awaited<ReturnType<T>>>>({ isLoading: true });

  const fnRef = useLatest(fn);
  const latestAbortable = useLatest(options?.abortable);
  const latestArgs = useLatest(args || []);
  const latestOnError = useLatest(options?.onError);
  const latestOnData = useLatest(options?.onData);
  const latestOnWillExecute = useLatest(options?.onWillExecute);
  const latestValue = useLatest(state.data);
  const latestCallback = useRef<T>();

  const callback = useCallback(
    (...args: Parameters<T>): ReturnType<T> => {
      const callId = ++lastCallId.current;

      if (latestAbortable.current) {
        latestAbortable.current.current?.abort();
        latestAbortable.current.current = new AbortController();
      }

      latestOnWillExecute.current?.(args);

      set((prevState) => ({ ...prevState, isLoading: true }));

      return fnRef.current(...args).then(
        (data: Awaited<ReturnType<T>>) => {
          if (callId === lastCallId.current) {
            if (latestOnData.current) {
              latestOnData.current(data);
            }
            set({ data, isLoading: false });
          }

          return data;
        },
        (error) => {
          if (error.name == "AbortError") {
            return error;
          }

          if (callId === lastCallId.current) {
            // handle errors
            if (latestOnError.current) {
              latestOnError.current(error);
            } else {
              console.error(error);
              if (environment.launchType !== LaunchType.Background) {
                showToast({
                  style: Toast.Style.Failure,
                  title: "Failed to fetch latest data",
                  message: error.message,
                  primaryAction: {
                    title: "Retry",
                    onAction(toast) {
                      toast.hide();
                      latestCallback.current?.(...(latestArgs.current || []));
                    },
                  },
                  secondaryAction: {
                    title: "Copy Logs",
                    onAction(toast) {
                      toast.hide();
                      Clipboard.copy(error?.stack || error?.message || "");
                    },
                  },
                });
              }
            }
            set({ error, isLoading: false });
          }

          return error;
        }
      ) as ReturnType<T>;
    },
    [latestAbortable, latestOnData, latestOnError, latestArgs, fnRef, set, latestCallback, latestOnWillExecute]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any as T;

  latestCallback.current = callback;

  const revalidate = useCallback(() => {
    return callback(...(latestArgs.current || []));
  }, [callback, latestArgs]);

  const mutate = useCallback<MutatePromise<Awaited<ReturnType<T>>, undefined>>(
    async (asyncUpdate, options) => {
      let dataBeforeOptimisticUpdate: Awaited<ReturnType<T>> | undefined;
      try {
        if (options?.optimisticUpdate) {
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
    [revalidate, latestValue, set]
  );

  // revalidate when the args change
  useEffect(() => {
    if (options?.execute !== false) {
      callback(...(args || []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDeepMemo([args, options?.execute, callback])]);

  // abort request when unmounting
  useEffect(() => {
    return () => {
      if (latestAbortable.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        latestAbortable.current.current?.abort();
      }
    };
  }, [latestAbortable]);

  return { ...state, revalidate, mutate };
}
