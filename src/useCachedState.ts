import { useCallback, Dispatch, SetStateAction, useSyncExternalStore, useMemo } from "react";
import { Cache } from "@raycast/api";
import { useLatest } from "./useLatest";

function replacer(_key: string, value: unknown) {
  if (value instanceof Date) {
    return `__raycast_cached_date__${value.toString()}`;
  }
  if (Buffer.isBuffer(value)) {
    return `__raycast_cached_buffer__${value.toString("base64")}`;
  }
  return value;
}

function reviver(_key: string, value: unknown) {
  if (typeof value === "string" && value.startsWith("__raycast_cached_date__")) {
    return new Date(value.replace("__raycast_cached_date__", ""));
  }
  if (typeof value === "string" && value.startsWith("__raycast_cached_buffer__")) {
    return Buffer.from(value.replace("__raycast_cached_buffer__", ""), "base64");
  }
  return value;
}

/**
 * Returns a stateful value, and a function to update it. The value will be kept between command runs.
 *
 * @remark The value needs to be JSON serializable.
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

  const keyRef = useLatest(key);
  const initialValueRef = useLatest(initialState);

  const cachedState = useSyncExternalStore(cache.subscribe, () => {
    try {
      return cache.get(keyRef.current);
    } catch (error) {
      console.error("Could not get Cache data:", error);
      return undefined;
    }
  });

  const state = useMemo(() => {
    if (typeof cachedState !== "undefined") {
      return JSON.parse(cachedState, reviver);
    } else {
      return initialValueRef.current;
    }
  }, [cachedState, initialValueRef]);

  const stateRef = useLatest(state);

  const setStateAndCache = useCallback(
    (updater: SetStateAction<T>) => {
      // @ts-expect-error TS struggles to infer the types as T could potentially be a function
      const newValue = typeof updater === "function" ? updater(stateRef.current) : updater;
      const stringifiedValue = JSON.stringify(newValue, replacer);
      cache.set(keyRef.current, stringifiedValue);
      return newValue;
    },
    [cache, keyRef, stateRef]
  );

  return [state, setStateAndCache];
}
