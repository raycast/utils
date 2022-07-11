import { useCallback, Dispatch, SetStateAction, useSyncExternalStore, useMemo, useState, useRef } from "react";
import { Cache } from "@raycast/api";
import { useLatest } from "./useLatest";

/**
 * Returns a stateful value, and a function to update it. The value will be kept between command runs.
 * The value needs to be JSON serializable.
 *
 * @param key - The unique identifier of the state. This can be used to share the state across components and/or commands.
 * @param initialState - The initial value of the state if there aren't any in the Cache yet.
 */
export function useCachedState<T>(
  key: string,
  initialState: T,
  config?: { cacheNamespace?: string }
): [T, Dispatch<SetStateAction<T>>];
export function useCachedState<T = undefined>(key: string): [T | undefined, Dispatch<SetStateAction<T | undefined>>];
export function useCachedState<T>(
  key: string,
  initialState?: T,
  config?: { cacheNamespace?: string }
): [T, Dispatch<SetStateAction<T>>] {
  const cache = useMemo(() => new Cache({ namespace: config?.cacheNamespace }), [config?.cacheNamespace]);
  const optimisticValue = useRef<string>();
  const [, setRender] = useState(0);
  const rerender = useCallback(() => setRender((x) => x++), [setRender]);

  const keyRef = useLatest(key);
  const initialValueRef = useLatest(initialState);

  const cachedState = useSyncExternalStore(cache.subscribe, () => {
    try {
      optimisticValue.current = undefined;
      return cache.get(keyRef.current);
    } catch (error) {
      console.error("Could not get Cache data:", error);
      return undefined;
    }
  });

  const state = useMemo(() => {
    if (typeof optimisticValue.current !== "undefined") {
      return JSON.parse(optimisticValue.current);
    } else if (typeof cachedState !== "undefined") {
      return JSON.parse(cachedState);
    } else {
      return initialValueRef.current;
    }
  }, [cachedState, initialValueRef, optimisticValue]);

  const stateRef = useLatest(state);

  const setStateAndCache = useCallback(
    (updater: SetStateAction<T>) => {
      // @ts-expect-error TS struggles to infer the types as T could potentially be a function
      const newValue = typeof updater === "function" ? updater(stateRef.current) : updater;
      const stringifiedValue = JSON.stringify(newValue);
      cache.set(keyRef.current, stringifiedValue);
      optimisticValue.current = stringifiedValue;
      rerender();
      return newValue;
    },
    [cache, keyRef, stateRef]
  );

  return [state, setStateAndCache];
}
