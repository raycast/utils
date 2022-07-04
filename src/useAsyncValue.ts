import { useEffect, MutableRefObject } from "react";
import { useAsyncFunction } from "./useAsyncFunction";
import { FunctionReturningPromise } from "./types";

/**
 * React hook that resolves an async function or a function that returns a promise;
 * @remark This hook assumes that the function is constant
 */
export function useAsyncValue<T extends FunctionReturningPromise>(
  fn: T,
  args: Parameters<T>,
  config?: { abortable?: MutableRefObject<AbortController | null> }
) {
  const [state, callback] = useAsyncFunction(fn, {
    abortable: config?.abortable,
    initialState: {
      loading: true,
    },
  });

  useEffect(() => {
    callback(args);
  }, [callback, ...args]);

  return state;
}
