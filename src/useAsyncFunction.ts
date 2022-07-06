import { useCallback, useRef, useState, MutableRefObject } from "react";
import { useLatest } from "./useLatest";
import { FunctionReturningPromise, PromiseType } from "./types";

export type AsyncState<T> =
  | {
      isLoading: boolean;
      error?: undefined;
      value?: undefined;
    }
  | {
      isLoading: true;
      error?: Error | undefined;
      value?: T;
    }
  | {
      isLoading: false;
      error: Error;
      value?: undefined;
    }
  | {
      isLoading: false;
      error?: undefined;
      value: T;
    };

type StateFromFunctionReturningPromise<T extends FunctionReturningPromise> = AsyncState<PromiseType<ReturnType<T>>>;

export type AsyncFnReturn<T extends FunctionReturningPromise = FunctionReturningPromise> = [
  StateFromFunctionReturningPromise<T>,
  T
];

/**
 * Wraps an asynchronous function or a function that returns a promise and returns the {@link AsyncState} corresponding to the execution of the function with the callback to trigger the execution of the function.
 *
 * You can specify an initial state (default being `{ isLoading: false }`) and a reference to an AbortController to cancel a previous call when triggering a new one.
 *
 * @example
 * ```
 * import { useAsyncFunction } from '@raycast/utils';
 *
 * const Demo = ({url}) => {
 * const abortable = useRef<AbortController>();
 * const [state, doFetch] = useAsyncFunction(async (url: string) => {
 *   const response = await fetch(url, { signal: abortable.current?.signal });
 *   const result = await response.text();
 *   return result
 * }, {
 *   abortable
 * });
 *
 * useEffect(() => {
 *   if (state.error) {
 *     showToast({ style: Toast.Style.Failure, title: state.error.message })
 *   }
 * }, [state.error])
 *
 * return (
 *   <Detail
 *     isLoading={state.isLoading}
 *     markdown={state.value}
 *     actions={
 *       <ActionPanel>
 *         <Action title="Start Loading" onAction={() => doFetch(url)} />
 *       </ActionPanel>
 *     }
 *   />
 * );
};
 * ```
 */
export function useAsyncFunction<T extends FunctionReturningPromise>(
  fn: T,
  config?: {
    abortable?: MutableRefObject<AbortController | null | undefined>;
    initialState?: StateFromFunctionReturningPromise<T>;
  }
): AsyncFnReturn<T> {
  const lastCallId = useRef(0);
  const [state, set] = useState<StateFromFunctionReturningPromise<T>>(config?.initialState ?? { isLoading: false });

  const fnRef = useLatest(fn);
  const configRef = useLatest(config);

  const callback = useCallback(
    (...args: Parameters<T>): ReturnType<T> => {
      const callId = ++lastCallId.current;

      if (configRef.current?.abortable) {
        configRef.current.abortable.current?.abort();
        configRef.current.abortable.current = new AbortController();
      }

      set((prevState) => ({ ...prevState, loading: true }));

      return fnRef.current(...args).then(
        (value) => {
          if (callId === lastCallId.current) {
            set({ value, isLoading: false });
          }

          return value;
        },
        (error) => {
          if (error.name == "AbortError") {
            return error;
          }

          if (callId === lastCallId.current) {
            set({ error, isLoading: false });
          }
          return error;
        }
      ) as ReturnType<T>;
    },
    [configRef, fnRef]
  );

  return [state, callback as unknown as T];
}
