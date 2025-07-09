import { useCallback, Dispatch, SetStateAction, useSyncExternalStore, useMemo } from "react";
import { Cache } from "@raycast/api";
import { useLatest } from "./useLatest";
import { replacer, reviver } from "./helpers";

const rootCache = /* #__PURE__ */ Symbol("cache without namespace");
const cacheMap = /* #__PURE__ */ new Map<string | symbol, Cache>();

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
  config?: { cacheNamespace?: string },
): [T, Dispatch<SetStateAction<T>>];
export function useCachedState<T = undefined>(key: string): [T | undefined, Dispatch<SetStateAction<T | undefined>>];
export function useCachedState<T>(
  key: string,
  initialState?: T,
  config?: { cacheNamespace?: string },
): [T, Dispatch<SetStateAction<T>>] {
  const cacheKey = config?.cacheNamespace || rootCache;
  const cache =
    cacheMap.get(cacheKey) || cacheMap.set(cacheKey, new Cache({ namespace: config?.cacheNamespace })).get(cacheKey);

  if (!cache) {
    throw new Error("Missing cache");
  }

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
      if (cachedState === "undefined") {
        return undefined;
      }
      try {
        return JSON.parse(cachedState, reviver);
      } catch (err) {
        // the data got corrupted somehow
        console.warn("The cached data is corrupted", err);
        return initialValueRef.current;
      }
    } else {
      return initialValueRef.current;
    }
  }, [cachedState, initialValueRef]);

  const stateRef = useLatest(state);

  const setStateAndCache = useCallback(
    (updater: SetStateAction<T>) => {
      // @ts-expect-error TS struggles to infer the types as T could potentially be a function
      const newValue = typeof updater === "function" ? updater(stateRef.current) : updater;
      if (typeof newValue === "undefined") {
        cache.set(keyRef.current, "undefined");
      } else {
        const stringifiedValue = JSON.stringify(newValue, replacer);
        cache.set(keyRef.current, stringifiedValue);
      }
      return newValue;
    },
    [cache, keyRef, stateRef],
  );

  return [state, setStateAndCache];
}
