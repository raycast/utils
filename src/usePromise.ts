import { useEffect, useCallback, MutableRefObject, useRef, useState } from "react";
import { showToast, Toast, Clipboard } from "@raycast/api";
import { FunctionReturningPromise, AsyncStateFromFunctionReturningPromise, PromiseType, MutatePromise } from "./types";
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
  onData?: (data: PromiseType<ReturnType<T>>) => void | Promise<void>;
};

/**
 * Wraps an asynchronous function or a function that returns a promise and returns the {@link AsyncState} corresponding to the execution of the function.
 *
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
export function usePromise<T extends FunctionReturningPromise<[]>>(
  fn: T
): AsyncStateFromFunctionReturningPromise<T> & {
  /**
   * Function to manually call the function again
   */
  revalidate: () => void;
  /**
   * Function to wrap an asynchronous update and gives some control about how the
   * `usePromise`'s data should be updated while the update is going through.
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
   * When doing so, you can specify a `rollbackOnError` function to mutate back the
   * data if the asynchronous update fails. If not specified, the data will be automatically
   * rolled back to its previous value (before the optimistic update).
   */
  mutate: MutatePromise<PromiseType<ReturnType<T>> | undefined>;
};
export function usePromise<T extends FunctionReturningPromise>(
  fn: T,
  args: Parameters<T>,
  options?: PromiseOptions<T>
): AsyncStateFromFunctionReturningPromise<T> & {
  /**
   * Function to manually call the function again
   */
  revalidate: () => void;
  /**
   * Function to wrap an asynchronous update and gives some control about how the
   * `usePromise`'s data should be updated while the update is going through.
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
   * When doing so, you can specify a `rollbackOnError` function to mutate back the
   * data if the asynchronous update fails. If not specified, the data will be automatically
   * rolled back to its previous value (before the optimistic update).
   */
  mutate: MutatePromise<PromiseType<ReturnType<T>> | undefined>;
};
export function usePromise<T extends FunctionReturningPromise>(
  fn: T,
  args?: Parameters<T>,
  options?: PromiseOptions<T>
): AsyncStateFromFunctionReturningPromise<T> & {
  revalidate: () => void;
  mutate: MutatePromise<PromiseType<ReturnType<T>> | undefined>;
} {
  const lastCallId = useRef(0);
  const [state, set] = useState<AsyncStateFromFunctionReturningPromise<T>>({ isLoading: true });

  const fnRef = useLatest(fn);
  const latestAbortable = useLatest(options?.abortable);
  const latestArgs = useLatest(args || []);
  const latestOnError = useLatest(options?.onError);
  const latestOnData = useLatest(options?.onData);
  const latestValue = useLatest(state.data);

  const callback = useCallback(
    (...args: Parameters<T>): ReturnType<T> => {
      const callId = ++lastCallId.current;

      if (latestAbortable.current) {
        latestAbortable.current.current?.abort();
        latestAbortable.current.current = new AbortController();
      }

      set((prevState) => ({ ...prevState, loading: true }));

      return fnRef.current(...args).then(
        (data) => {
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
              console.error(state.error);
              showToast({
                style: Toast.Style.Failure,
                title: "Failed to fetch latest data",
                message: error.message,
                primaryAction: {
                  title: "Retry",
                  onAction(toast) {
                    toast.hide();
                    revalidate();
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
            set({ error, isLoading: false });
          }

          return error;
        }
      ) as ReturnType<T>;
    },
    [latestAbortable, fnRef, set]
  ) as any as T;

  const revalidate = useCallback(() => {
    callback(...(latestArgs.current || []));
  }, [callback, latestArgs]);

  const mutate = useCallback<MutatePromise<PromiseType<ReturnType<T>> | undefined>>(
    async (asyncUpdate, options) => {
      let dataBeforeOptimisticUpdate: PromiseType<ReturnType<T>> | undefined;
      try {
        if (options?.optimisticUpdate) {
          if (typeof options?.rollbackOnError !== "function" && options?.rollbackOnError !== false) {
            // keep track of the data before the optimistic update,
            // but only if we need it (eg. only when we want to automatically rollback after)
            dataBeforeOptimisticUpdate = JSON.parse(JSON.stringify(latestValue.current?.value));
          }
          const update = options.optimisticUpdate;
          set((prevState) => ({ ...prevState, value: update(prevState.data) }));
        }
        return await asyncUpdate;
      } catch (err) {
        if (typeof options?.rollbackOnError === "function") {
          const update = options.rollbackOnError;
          set((prevState) => ({ ...prevState, value: update(prevState.data) }));
        } else if (options?.optimisticUpdate && options?.rollbackOnError !== false) {
          set((prevState) => ({ ...prevState, value: dataBeforeOptimisticUpdate }));
        }
        throw err;
      } finally {
        if (options?.shouldRevalidateAfter !== false) {
          revalidate();
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
  }, [...(args || []), options?.execute, callback]);

  // abort request when unmounting
  useEffect(() => {
    return () => {
      if (latestAbortable.current) {
        latestAbortable.current.current?.abort();
      }
    };
  }, [latestAbortable]);

  return { ...state, revalidate, mutate };
}
