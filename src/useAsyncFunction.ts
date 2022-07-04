import { useCallback, useRef, useState, MutableRefObject } from "react";
import { useLatest } from "./useLatest";
import { FunctionReturningPromise, PromiseType } from "./types";

export type AsyncState<T> =
  | {
      loading: boolean;
      error?: undefined;
      value?: undefined;
    }
  | {
      loading: true;
      error?: Error | undefined;
      value?: T;
    }
  | {
      loading: false;
      error: Error;
      value?: undefined;
    }
  | {
      loading: false;
      error?: undefined;
      value: T;
    };

type StateFromFunctionReturningPromise<T extends FunctionReturningPromise> = AsyncState<PromiseType<ReturnType<T>>>;

export type AsyncFnReturn<T extends FunctionReturningPromise = FunctionReturningPromise> = [
  StateFromFunctionReturningPromise<T>,
  T
];

/**
 *
 */
export function useAsyncFunction<T extends FunctionReturningPromise>(
  fn: T,
  config?: {
    abortable?: MutableRefObject<AbortController | null>;
    initialState?: StateFromFunctionReturningPromise<T>;
  }
): AsyncFnReturn<T> {
  const lastCallId = useRef(0);
  const [state, set] = useState<StateFromFunctionReturningPromise<T>>(config?.initialState ?? { loading: false });

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
            set({ value, loading: false });
          }

          return value;
        },
        (error) => {
          if (error.name == "AbortError") {
            return error;
          }

          if (callId === lastCallId.current) {
            set({ error, loading: false });
          }
          return error;
        }
      ) as ReturnType<T>;
    },
    [configRef, fnRef]
  );

  return [state, callback as unknown as T];
}
